/*
  # Add treasury role to all request table RLS policies

  1. Changes
    - Add `treasury` role to SELECT and UPDATE policies on:
      - purchase_requisitions
      - canvass_requests
      - cash_advance_requests
      - reimbursement_requests

  2. Problem
    - Treasury users assigned as approvers in approval flows could not view or update requests
    - The RPC correctly identified them but RLS blocked access at the table level
*/

-- Purchase Requisitions
DROP POLICY IF EXISTS "Approvers, Procurement and Accounting can view all purchase req" ON purchase_requisitions;
DROP POLICY IF EXISTS "Approvers, Procurement and Accounting can update requisition st" ON purchase_requisitions;

CREATE POLICY "Approvers, Procurement, Accounting, Treasury can view PRs"
  ON purchase_requisitions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement', 'accounting', 'treasury')
      AND user_profiles.is_active = true
    )
  );

CREATE POLICY "Approvers, Procurement, Accounting, Treasury can update PRs"
  ON purchase_requisitions FOR UPDATE
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

-- Canvass Requests
DROP POLICY IF EXISTS "Approvers, Procurement and Accounting can view all canvass requ" ON canvass_requests;
DROP POLICY IF EXISTS "Approvers, Procurement and Accounting can update canvass status" ON canvass_requests;

CREATE POLICY "Approvers, Procurement, Accounting, Treasury can view canvass"
  ON canvass_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement', 'accounting', 'treasury')
      AND user_profiles.is_active = true
    )
  );

CREATE POLICY "Approvers, Procurement, Accounting, Treasury can update canvass"
  ON canvass_requests FOR UPDATE
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

-- Cash Advance Requests
DROP POLICY IF EXISTS "Approvers, Procurement and Accounting can view all cash advance" ON cash_advance_requests;
DROP POLICY IF EXISTS "Approvers, Procurement and Accounting can update cash advance s" ON cash_advance_requests;

CREATE POLICY "Approvers, Procurement, Accounting, Treasury can view CA"
  ON cash_advance_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement', 'accounting', 'treasury')
      AND user_profiles.is_active = true
    )
  );

CREATE POLICY "Approvers, Procurement, Accounting, Treasury can update CA"
  ON cash_advance_requests FOR UPDATE
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

-- Reimbursement Requests
DROP POLICY IF EXISTS "Approvers, Procurement and Accounting can view all reimbursemen" ON reimbursement_requests;
DROP POLICY IF EXISTS "Approvers, Procurement and Accounting can update reimbursement " ON reimbursement_requests;

CREATE POLICY "Approvers, Procurement, Accounting, Treasury can view reimb"
  ON reimbursement_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement', 'accounting', 'treasury')
      AND user_profiles.is_active = true
    )
  );

CREATE POLICY "Approvers, Procurement, Accounting, Treasury can update reimb"
  ON reimbursement_requests FOR UPDATE
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