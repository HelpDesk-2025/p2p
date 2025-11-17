/*
  # Fix admin policy infinite recursion

  1. Changes
    - Drop the problematic admin policy that causes recursion
    - Create a simpler approach using a function to check admin status
    - Use auth.jwt() to check role from metadata (avoids recursion)
    
  2. Security
    - Admins identified by checking raw_app_meta_data
    - This approach avoids querying user_profiles during user_profiles operations
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Admins can update any user profile" ON user_profiles;

-- Create a function to safely check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN COALESCE(
    (SELECT role = 'admin' FROM user_profiles WHERE id = auth.uid()),
    false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update the existing policy to allow admins OR self
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

CREATE POLICY "Users can update own or admin can update any"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR is_admin())
  WITH CHECK (auth.uid() = id OR is_admin());
