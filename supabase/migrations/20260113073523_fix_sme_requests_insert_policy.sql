/*
  # Fix SME Requests INSERT Policy

  1. Changes
    - Drop existing restrictive INSERT policy
    - Create new INSERT policy that allows:
      - Users to create SME requests where they are the requester
      - Admins to create SME requests on behalf of anyone
  
  2. Security
    - Maintains RLS protection
    - Allows admin users to create SME requests for any user
    - Regular users can only create requests for themselves
*/

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Procurement users can create SME requests" ON sme_requests;

-- Create a new INSERT policy that allows both regular users and admins
CREATE POLICY "Users and admins can create SME requests"
  ON sme_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User is creating a request for themselves
    auth.uid() = requested_by
    OR
    -- User is an admin
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );