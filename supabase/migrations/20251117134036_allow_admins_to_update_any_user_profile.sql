/*
  # Allow admins to update any user profile

  1. Changes
    - Add policy to allow authenticated users with admin role to update any user profile
    - This is needed for the user management interface in ConfigManager
    
  2. Security
    - We check the role directly from the user_profiles table
    - Only users with role='admin' can update other users
    - Regular users can still only update their own profile
*/

-- Add policy for admins to update any user profile
CREATE POLICY "Admins can update any user profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'admin'
    )
  );
