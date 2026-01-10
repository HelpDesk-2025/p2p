/*
  # Add Multi-Company Request Feature to User Profiles

  1. Changes
    - Add `enable_multi_company_requests` boolean column (default false)
    - Add `allowed_companies` jsonb column to store array of company UUIDs
    - Create index on allowed_companies for better performance
  
  2. Purpose
    - Allows users to create requests for multiple companies
    - Admin can configure which companies a user can access
    - When disabled, users work with their primary company only
  
  3. Notes
    - If enable_multi_company_requests is false, use profile.company_id
    - If enable_multi_company_requests is true, use selected company from allowed_companies
    - allowed_companies should be an array of UUIDs: ["uuid1", "uuid2", ...]
*/

-- Add enable_multi_company_requests column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'enable_multi_company_requests'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN enable_multi_company_requests boolean DEFAULT false;
  END IF;
END $$;

-- Add allowed_companies column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'allowed_companies'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN allowed_companies jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_allowed_companies ON user_profiles USING gin(allowed_companies);

-- Add comments explaining the fields
COMMENT ON COLUMN user_profiles.enable_multi_company_requests IS 
'When true, user can create requests for multiple companies specified in allowed_companies. When false, user works with their primary company_id only.';

COMMENT ON COLUMN user_profiles.allowed_companies IS 
'JSON array of company UUIDs the user is allowed to create requests for. Format: ["uuid1", "uuid2", ...]';