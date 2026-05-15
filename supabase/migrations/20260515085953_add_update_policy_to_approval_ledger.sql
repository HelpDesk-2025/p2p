/*
  # Add UPDATE policy to approval_ledger for admins

  1. Security Changes
    - Add UPDATE policy allowing admin users to update approval ledger entries
    - Only admins can modify approver_type and for_checking fields

  2. Notes
    - Previously no UPDATE policy existed, causing silent save failures
*/

CREATE POLICY "Admins can update approval ledger entries"
  ON approval_ledger
  FOR UPDATE
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
