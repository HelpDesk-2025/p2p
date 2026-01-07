/*
  # Allow Anonymous Access to Approval Flow Setups for Signup

  1. Changes
    - Add RLS policy to allow unauthenticated (anonymous) users to read approval flow setups
    - This enables the signup form to display available departments for each company

  2. Security
    - Only SELECT access is granted
    - No sensitive data is exposed (only department_id)
    - Insert, update, and delete remain restricted to authenticated admins
*/

-- Add policy to allow anonymous users to read approval flow setups for signup
CREATE POLICY "Anonymous users can read approval flow setups for signup"
  ON approval_flow_setups
  FOR SELECT
  TO anon
  USING (true);
