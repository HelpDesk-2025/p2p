/*
  # Add treasury role to petty cash RLS policies

  1. Changes
    - Add `treasury` role to petty cash SELECT and UPDATE policies
    - Treasury users (like Ana Patrice) who are assigned as approvers in approval flows
      need to be able to view and update petty cash requests

  2. Problem
    - Users with the `treasury` role assigned as approvers could not see petty cash requests
    - The RPC correctly identified them as pending approvers, but RLS blocked their read access
*/

-- Drop the existing policies that need updating
DROP POLICY IF EXISTS "Approvers, Procurement and Accounting can view all petty cash r" ON petty_cash_requests;
DROP POLICY IF EXISTS "Approvers, Procurement and Accounting can update petty cash sta" ON petty_cash_requests;

-- Recreate with treasury role included
CREATE POLICY "Approvers, Procurement, Accounting, Treasury can view petty cash"
  ON petty_cash_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement', 'accounting', 'treasury')
      AND user_profiles.is_active = true
    )
  );

CREATE POLICY "Approvers, Procurement, Accounting, Treasury can update petty cash"
  ON petty_cash_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin', 'procurement', 'accounting', 'treasury')
      AND user_profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin', 'procurement', 'accounting', 'treasury')
      AND user_profiles.is_active = true
    )
  );