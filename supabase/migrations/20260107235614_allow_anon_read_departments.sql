/*
  # Allow Anonymous Users to Read Departments for Signup Form

  1. Changes
    - Add RLS policy to allow anonymous (anon) users to read departments
    - This enables the signup form to display available departments for each company

  2. Security
    - Only SELECT access is granted to anonymous users
    - Only active departments are accessible (is_active = true)
    - Insert, update, and delete remain restricted to authenticated admin users
*/

-- Create policy to allow anonymous users to read active departments
CREATE POLICY "Anonymous users can read active departments"
  ON departments
  FOR SELECT
  TO anon
  USING (is_active = true);
