import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, UserProfile } from '../lib/supabase';
import { getUserPermissions, UserPermissions } from '../lib/permissions';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  actualProfile: UserProfile | null;
  permissions: UserPermissions | null;
  loading: boolean;
  isImpersonating: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, department: string, companyId: string, companyName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  impersonateUser: (userId: string) => Promise<void>;
  stopImpersonation: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [actualProfile, setActualProfile] = useState<UserProfile | null>(null);
  const [impersonatedProfile, setImpersonatedProfile] = useState<UserProfile | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

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

    // Inactivity timeout - force logout after 1 minute of inactivity
    let inactivityTimeout: NodeJS.Timeout | null = null;

    const resetInactivityTimer = () => {
      // Clear existing timeout
      if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
      }

      // Only set timer if user is logged in
      if (user) {
        inactivityTimeout = setTimeout(async () => {
          console.log('User inactive for 1 minute - signing out');
          await supabase.auth.signOut();
          setUser(null);
          setActualProfile(null);
          setImpersonatedProfile(null);
          setPermissions(null);
        }, 60000); // 1 minute = 60000ms
      }
    };

    // Track user activity
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    activityEvents.forEach(event => {
      document.addEventListener(event, resetInactivityTimer);
    });

    // Start the timer initially if user is logged in
    if (user) {
      resetInactivityTimer();
    }

    return () => {
      subscription.unsubscribe();
      clearInterval(sessionCheckInterval);

      // Clean up inactivity timeout
      if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
      }

      // Remove activity event listeners
      activityEvents.forEach(event => {
        document.removeEventListener(event, resetInactivityTimer);
      });
    };
  }, [user]);

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
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      impersonateUser,
      stopImpersonation
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
