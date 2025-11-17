/*
  # Fix infinite recursion in user_profiles policies

  1. Changes
    - Drop existing admin policies that cause infinite recursion
    - Simplify policies to avoid self-referencing queries
    - Allow all authenticated users to read all active profiles
    - Allow users to update their own profile only
    - Store admin role in raw_app_meta_data for policy checks (to be done separately)

  2. Security
    - Users can view all active profiles (needed for workflow/approvals)
    - Users can only update their own profile data
    - Admin management will be handled through direct SQL or service role
*/

-- Drop all existing policies on user_profiles
DROP POLICY IF EXISTS "Users can view profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update any user profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON user_profiles;

-- Allow authenticated users to view all active profiles
CREATE POLICY "Authenticated users can view active profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (is_active = true OR auth.uid() = id);

-- Allow users to update only their own profile
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow users to insert their own profile (for signup)
CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
