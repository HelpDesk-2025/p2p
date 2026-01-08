/*
  # Fix User Profiles Infinite Recursion

  1. Changes
    - Drop the problematic UPDATE policy that causes infinite recursion
    - Create a security definer function to check if user is admin (bypasses RLS)
    - Create new UPDATE policy using the helper function
    
  2. Security
    - Helper function is SECURITY DEFINER to bypass RLS when checking admin status
    - Policy still restricts updates to own profile or admin users only
*/

-- Create a helper function to check if current user is admin (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$;

-- Drop the problematic UPDATE policy
DROP POLICY IF EXISTS "Users can update own profile or admins can update any" ON user_profiles;

-- Create new UPDATE policy using the helper function
CREATE POLICY "Users can update own profile or admins can update any"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid() 
    OR is_admin()
  )
  WITH CHECK (
    id = auth.uid() 
    OR is_admin()
  );