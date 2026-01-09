/*
  # Fix RLS policies to allow procurement role access

  1. Changes
    - Update purchase_requisitions SELECT policy to allow 'procurement' role
    - Update canvass_requests SELECT policy to allow 'procurement' role  
    - Update cash_advance_requests SELECT policy to allow 'procurement' role
    - Update petty_cash_requests SELECT policy to allow 'procurement' role
    - Update reimbursement_requests SELECT policy to allow 'procurement' role

  2. Security
    - Maintains RLS protection
    - Only allows active procurement users to view requests for approval purposes
*/

-- Drop and recreate the purchase_requisitions approver policy
DROP POLICY IF EXISTS "Approvers can view company requisitions" ON purchase_requisitions;
CREATE POLICY "Approvers can view company requisitions"
  ON purchase_requisitions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement')
      AND user_profiles.is_active = true
    )
  );

-- Drop and recreate the canvass_requests approver policy
DROP POLICY IF EXISTS "Approvers can view company canvass requests" ON canvass_requests;
CREATE POLICY "Approvers can view company canvass requests"
  ON canvass_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement')
      AND user_profiles.is_active = true
    )
  );

-- Drop and recreate the cash_advance_requests approver policy
DROP POLICY IF EXISTS "Approvers can view company cash advance requests" ON cash_advance_requests;
CREATE POLICY "Approvers can view company cash advance requests"
  ON cash_advance_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement')
      AND user_profiles.is_active = true
    )
  );

-- Drop and recreate the petty_cash_requests approver policy
DROP POLICY IF EXISTS "Approvers can view company petty cash requests" ON petty_cash_requests;
CREATE POLICY "Approvers can view company petty cash requests"
  ON petty_cash_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement')
      AND user_profiles.is_active = true
    )
  );

-- Drop and recreate the reimbursement_requests approver policy
DROP POLICY IF EXISTS "Approvers can view company reimbursement requests" ON reimbursement_requests;
CREATE POLICY "Approvers can view company reimbursement requests"
  ON reimbursement_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement')
      AND user_profiles.is_active = true
    )
  );
