/*
  # Allow Public Access to Companies for Signup

  1. Changes
    - Add RLS policy to allow unauthenticated (anonymous) users to read company data
    - This enables the signup form to display available companies

  2. Security
    - Only SELECT access is granted
    - No sensitive data is exposed (only id, name, and departments)
    - Insert, update, and delete remain restricted to authenticated admins
*/

-- Add policy to allow anonymous users to read companies for signup
CREATE POLICY "Anonymous users can read companies for signup"
  ON companies
  FOR SELECT
  TO anon
  USING (true);
