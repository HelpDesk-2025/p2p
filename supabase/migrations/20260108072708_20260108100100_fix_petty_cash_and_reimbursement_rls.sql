/*
  # Fix Petty Cash and Reimbursement RLS for Approvers

  Updates the RLS policies on petty_cash_requests and reimbursement_requests to work with the approval flow system.

  Changes:
  - Drops old policies that don't check activation status
  - Creates new policies that check user role and active status
  - Allows approvers to view all pending requests in their company
  - Allows approvers to update requests they can approve

  Security:
  - Users can still only view/edit their own drafts
  - Approvers can view all pending requests in their company
  - Approvers must be active to approve requests
  - Admins retain full access
*/

-- ============================================
-- PETTY CASH REQUESTS
-- ============================================

-- Drop old approver policies
DROP POLICY IF EXISTS "Approvers can view pending petty cash" ON petty_cash_requests;
DROP POLICY IF EXISTS "Approvers can update petty cash status" ON petty_cash_requests;
DROP POLICY IF EXISTS "Approvers can view company petty cash" ON petty_cash_requests;
DROP POLICY IF EXISTS "Admins can view all petty cash" ON petty_cash_requests;
DROP POLICY IF EXISTS "Admins can update all petty cash" ON petty_cash_requests;

-- Create new policy for approvers to view all pending petty cash in their company
CREATE POLICY "Approvers can view company petty cash"
  ON petty_cash_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'approver'
      AND user_profiles.is_active = true
    )
  );

-- Create new policy for approvers to update petty cash status
CREATE POLICY "Approvers can update petty cash status"
  ON petty_cash_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin')
      AND user_profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin')
      AND user_profiles.is_active = true
    )
  );

-- Admin can view all petty cash requests
CREATE POLICY "Admins can view all petty cash"
  ON petty_cash_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.is_active = true
    )
  );

-- Admin can update all petty cash requests
CREATE POLICY "Admins can update all petty cash"
  ON petty_cash_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.is_active = true
    )
  );

-- ============================================
-- REIMBURSEMENT REQUESTS
-- ============================================

-- Drop old approver policies
DROP POLICY IF EXISTS "Approvers can view pending reimbursements" ON reimbursement_requests;
DROP POLICY IF EXISTS "Approvers can update reimbursement status" ON reimbursement_requests;
DROP POLICY IF EXISTS "Approvers can view company reimbursements" ON reimbursement_requests;
DROP POLICY IF EXISTS "Admins can view all reimbursements" ON reimbursement_requests;
DROP POLICY IF EXISTS "Admins can update all reimbursements" ON reimbursement_requests;

-- Create new policy for approvers to view all pending reimbursements in their company
CREATE POLICY "Approvers can view company reimbursements"
  ON reimbursement_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'approver'
      AND user_profiles.is_active = true
    )
  );

-- Create new policy for approvers to update reimbursement status
CREATE POLICY "Approvers can update reimbursement status"
  ON reimbursement_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin')
      AND user_profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin')
      AND user_profiles.is_active = true
    )
  );

-- Admin can view all reimbursement requests
CREATE POLICY "Admins can view all reimbursements"
  ON reimbursement_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.is_active = true
    )
  );

-- Admin can update all reimbursement requests
CREATE POLICY "Admins can update all reimbursements"
  ON reimbursement_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.is_active = true
    )
  );
