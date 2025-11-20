/*
  # Fix admin update policy for user profiles

  1. Changes
    - Create a safe function to check admin role using auth metadata
    - Update the user_profiles UPDATE policy to allow admins
    
  2. Security
    - Regular users can only update their own profile
    - Users with role='admin' in user_profiles can update any profile
    - Uses a security definer function to safely check admin status
*/

-- Create a safe function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
$$;

-- Drop existing update policy
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Create new policy allowing users to update own profile OR admins to update any
CREATE POLICY "Users can update own profile or admins can update any"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR is_user_admin())
  WITH CHECK (auth.uid() = id OR is_user_admin());
