/*
  # Add Admin User Management Policies

  1. Changes
    - Add policy allowing admins to update any user profile
    - Admins are identified by role = 'admin' in user_profiles table
    
  2. Security
    - Only users with admin role can update other users' profiles
    - Regular users can still only update their own profile
*/

-- Allow admins to update any user profile
CREATE POLICY "Admins can update any user profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );
