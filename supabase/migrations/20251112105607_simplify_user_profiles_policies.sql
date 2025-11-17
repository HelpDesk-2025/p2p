/*
  # Simplify User Profiles RLS Policies
  
  1. Changes
    - Remove duplicate SELECT policies
    - Keep single policy: users can view all active profiles OR their own profile
    
  2. Security
    - Users can view active profiles or their own profile (even if inactive)
    - Users can update only their own profile
*/

-- Drop all existing SELECT policies
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view all active profiles" ON user_profiles;

-- Create single SELECT policy
CREATE POLICY "Users can view profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (is_active = true OR auth.uid() = id);
