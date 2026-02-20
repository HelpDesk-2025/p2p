import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, UserProfile } from '../lib/supabase';
import { getUserPermissions, UserPermissions } from '../lib/permissions';

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const WARNING_BEFORE_MS = 10 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
const LAST_ACTIVITY_KEY = 'last_activity_ts';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  actualProfile: UserProfile | null;
  permissions: UserPermissions | null;
  loading: boolean;
  isImpersonating: boolean;
  showInactivityWarning: boolean;
  inactivityCountdown: number;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, department: string, companyId: string, companyName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  impersonateUser: (userId: string) => Promise<void>;
  stopImpersonation: () => void;
  resetInactivityTimer: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [actualProfile, setActualProfile] = useState<UserProfile | null>(null);
  const [impersonatedProfile, setImpersonatedProfile] = useState<UserProfile | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [inactivityCountdown, setInactivityCountdown] = useState(WARNING_BEFORE_MS / 1000);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Use impersonated profile if available, otherwise use actual profile
  const profile = impersonatedProfile || actualProfile;
  const isImpersonating = impersonatedProfile !== null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        console.log('Auth state change:', event, session ? 'has session' : 'no session');

        // Handle session ending events
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          setUser(null);
          setActualProfile(null);
          setImpersonatedProfile(null);
          setPermissions(null);
          setLoading(false);
          return;
        }

        // Handle token refresh failure - sign out
        if (event === 'TOKEN_REFRESHED' && !session) {
          console.log('Token refresh failed - signing out');
          await supabase.auth.signOut();
          setUser(null);
          setActualProfile(null);
          setImpersonatedProfile(null);
          setPermissions(null);
          setLoading(false);
          return;
        }

        // Update user state
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          // No session - sign out completely
          if (event !== 'INITIAL_SESSION') {
            console.log('No session detected - signing out');
            await supabase.auth.signOut();
          }
          setActualProfile(null);
          setImpersonatedProfile(null);
          setPermissions(null);
          setLoading(false);
        }
      })();
    });

    // Periodic session validation (every 30 seconds)
    const sessionCheckInterval = setInterval(async () => {
      const { data: { session }, error } = await supabase.auth.getSession();

      // If there's an error or no session, sign out
      if (error || !session) {
        console.log('Session validation failed - signing out');
        setUser(null);
        setActualProfile(null);
        setImpersonatedProfile(null);
        setPermissions(null);
        // Trigger sign out to clean up properly
        await supabase.auth.signOut();
      }
    }, 30000);

    return () => {
      subscription.unsubscribe();
      clearInterval(sessionCheckInterval);
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (!userRef.current) return;
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      if (!userRef.current) return;
      const lastActivity = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0', 10);
      const elapsed = Date.now() - lastActivity;
      const remaining = INACTIVITY_TIMEOUT_MS - elapsed;

      if (remaining <= 0) {
        stopPolling();
        setShowInactivityWarning(false);
        await supabase.auth.signOut();
        setUser(null);
        setActualProfile(null);
        setImpersonatedProfile(null);
        setPermissions(null);
        localStorage.removeItem(LAST_ACTIVITY_KEY);
      } else if (remaining <= WARNING_BEFORE_MS) {
        setShowInactivityWarning(true);
        setInactivityCountdown(Math.ceil(remaining / 1000));
      } else {
        setShowInactivityWarning(false);
        setInactivityCountdown(WARNING_BEFORE_MS / 1000);
      }
    }, 1000);
  }, [stopPolling]);

  useEffect(() => {
    if (!user) {
      stopPolling();
      setShowInactivityWarning(false);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      return;
    }

    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    startPolling();

    const handleActivity = () => {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    };
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));

    return () => {
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, handleActivity));
      stopPolling();
    };
  }, [user, startPolling, stopPolling]);

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      // Check if profile is inactive and sign out if so
      if (data && !data.is_active) {
        await supabase.auth.signOut();
        setActualProfile(null);
        setUser(null);
        setPermissions(null);
        setLoading(false);
        return;
      }

      setActualProfile(data);

      // Load user permissions (use impersonated profile if available)
      const profileToUse = impersonatedProfile || data;
      const userPermissions = profileToUse ? await getUserPermissions(profileToUse.id) : null;
      setPermissions(userPermissions);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Check if user profile is active
    if (data.user) {
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('is_active')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData?.is_active) {
        await supabase.auth.signOut();
        throw new Error('Your account is pending approval. Please contact an administrator.');
      }
    }
  };

  const signUp = async (email: string, password: string, fullName: string, department: string, companyId: string, companyName: string) => {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          company: companyName,
          company_id: companyId,
          department: department,
          role: 'standard'
        }
      }
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('No user returned from signup');

    // Sign out immediately since new accounts are inactive by default
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error && error.message !== 'Auth session missing!') {
        console.error('Sign out error:', error);
      }
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setUser(null);
      setActualProfile(null);
      setImpersonatedProfile(null);
      setPermissions(null);
    }
  };

  const impersonateUser = async (userId: string) => {
    // Only admins can impersonate
    if (actualProfile?.role !== 'admin') {
      throw new Error('Only administrators can impersonate users');
    }

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('User not found');

      setImpersonatedProfile(data);

      // Load permissions for impersonated user
      const userPermissions = await getUserPermissions(userId);
      setPermissions(userPermissions);
    } catch (error) {
      console.error('Error impersonating user:', error);
      throw error;
    }
  };

  const stopImpersonation = () => {
    setImpersonatedProfile(null);
    // Reload actual user's permissions
    if (actualProfile) {
      getUserPermissions(actualProfile.id).then(setPermissions);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      actualProfile,
      permissions,
      loading,
      isImpersonating,
      showInactivityWarning,
      inactivityCountdown,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      impersonateUser,
      stopImpersonation,
      resetInactivityTimer
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
