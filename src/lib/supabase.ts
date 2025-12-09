import { createClient } from '@supabase/supabase-js';

// Support both build-time (Vite) and runtime (Azure) configuration
declare global {
  interface Window {
    __APP_CONFIG__?: {
      VITE_SUPABASE_URL: string;
      VITE_SUPABASE_ANON_KEY: string;
    };
  }
}

const getConfig = () => {
  // Try runtime config first (Azure/production)
  if (typeof window !== 'undefined' && window.__APP_CONFIG__) {
    return {
      url: window.__APP_CONFIG__.VITE_SUPABASE_URL,
      key: window.__APP_CONFIG__.VITE_SUPABASE_ANON_KEY
    };
  }

  // Fallback to build-time config (local development)
  return {
    url: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_ANON_KEY
  };
};

const config = getConfig();
const supabaseUrl = config.url;
const supabaseAnonKey = config.key;
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Enhanced error message with debugging info
  const errorDetails = [
    'Missing Supabase environment variables!',
    '',
    'Runtime config available:', typeof window !== 'undefined' && !!window.__APP_CONFIG__,
    'Runtime URL:', typeof window !== 'undefined' && window.__APP_CONFIG__?.VITE_SUPABASE_URL ? 'SET' : 'NOT SET',
    'Build-time URL:', import.meta.env.VITE_SUPABASE_URL ? 'SET' : 'NOT SET',
    '',
    'AZURE FIX REQUIRED:',
    '1. Go to Azure Portal → Your App Service → Configuration',
    '2. Add Application Settings:',
    '   - VITE_SUPABASE_URL = your-supabase-url',
    '   - VITE_SUPABASE_ANON_KEY = your-anon-key',
    '3. Save and restart the app',
    '',
    'Check /config.js endpoint to verify:',
    window.location.origin + '/config.js',
    '',
    'See DEPLOY_AZURE_NOW.md for complete instructions'
  ].join('\n');

  console.error(errorDetails);
  throw new Error('Missing Supabase environment variables - Check console for details');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client with service role key (bypasses RLS)
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

export type UserRole = 'standard' | 'approver' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
