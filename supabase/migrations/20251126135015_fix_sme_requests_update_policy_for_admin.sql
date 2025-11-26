/*
  # Fix SME Requests Update Policy for Admins

  1. Changes
    - Add policy to allow admins to update SME requests
    - This enables admins to mark SME requests as reviewed when viewing on behalf of SME users
  
  2. Security
    - Policy restricted to users with admin role
    - Maintains security while allowing admin oversight
*/

CREATE POLICY "Admins can update SME requests"
  ON sme_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );
