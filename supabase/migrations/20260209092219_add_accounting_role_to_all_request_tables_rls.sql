/*
  # Add accounting role to all request tables RLS policies
  
  1. Changes
    - Update SELECT policies on canvass_requests, cash_advance_requests, petty_cash_requests, reimbursement_requests
    - Update UPDATE policies on all request tables to include 'accounting' role
  
  2. Security
    - Accounting users need to view and approve all request types
    - Maintains existing security model while adding accounting role access
*/

-- CANVASS REQUESTS
DROP POLICY IF EXISTS "Approvers and Procurement can view all canvass requests" ON canvass_requests;

CREATE POLICY "Approvers, Procurement and Accounting can view all canvass requests"
  ON canvass_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  );

DROP POLICY IF EXISTS "Approvers can update canvass status" ON canvass_requests;

CREATE POLICY "Approvers, Procurement and Accounting can update canvass status"
  ON canvass_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  );

-- CASH ADVANCE REQUESTS
DROP POLICY IF EXISTS "Approvers and Procurement can view all cash advance requests" ON cash_advance_requests;

CREATE POLICY "Approvers, Procurement and Accounting can view all cash advance requests"
  ON cash_advance_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  );

DROP POLICY IF EXISTS "Approvers can update cash advance status" ON cash_advance_requests;

CREATE POLICY "Approvers, Procurement and Accounting can update cash advance status"
  ON cash_advance_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  );

-- PETTY CASH REQUESTS
DROP POLICY IF EXISTS "Approvers and Procurement can view all petty cash requests" ON petty_cash_requests;

CREATE POLICY "Approvers, Procurement and Accounting can view all petty cash requests"
  ON petty_cash_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  );

DROP POLICY IF EXISTS "Approvers can update petty cash status" ON petty_cash_requests;

CREATE POLICY "Approvers, Procurement and Accounting can update petty cash status"
  ON petty_cash_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  );

-- REIMBURSEMENT REQUESTS
DROP POLICY IF EXISTS "Approvers and Procurement can view all reimbursement requests" ON reimbursement_requests;

CREATE POLICY "Approvers, Procurement and Accounting can view all reimbursement requests"
  ON reimbursement_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  );

DROP POLICY IF EXISTS "Approvers can update reimbursement status" ON reimbursement_requests;

CREATE POLICY "Approvers, Procurement and Accounting can update reimbursement status"
  ON reimbursement_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  );
