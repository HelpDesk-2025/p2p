/*
  # Use bypass RLS approach for admin operations

  1. Changes
    - Drop the recursive function and policy with CASCADE
    - Restore simple user-only update policy
    - Admin operations will use service role key from frontend
    
  2. Security
    - Regular users can only update their own profile
    - Admin operations must be done via service role (handled in frontend)
    - This completely avoids the recursion issue
*/

-- Drop the function and dependent policies with CASCADE
DROP FUNCTION IF EXISTS is_admin() CASCADE;

-- Restore simple policy for regular users
CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Note: Admin updates will bypass RLS using service role key
