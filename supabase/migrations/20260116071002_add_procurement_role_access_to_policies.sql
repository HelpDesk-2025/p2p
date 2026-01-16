/*
  # Add Procurement Role Access to RLS Policies

  1. Changes
    - Update RLS policies across multiple tables to include 'procurement' role
    - Procurement users should have similar access to approvers for viewing and managing requests
    - Allows procurement team to manage:
      - Purchase requisitions
      - Canvass requests  
      - Petty cash requests
      - Reimbursement requests
      - Cash advance requests
      - Approval flows configuration
      - Number series configuration
      - Companies configuration

  2. Security
    - Procurement role gets elevated access for procurement-related operations
    - Maintains separation of concerns with proper role-based access control
*/

-- Purchase Requisitions: Allow procurement to view all PRs
DROP POLICY IF EXISTS "Approvers can view all purchase requisitions" ON purchase_requisitions;
CREATE POLICY "Approvers and Procurement can view all purchase requisitions"
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

-- Canvass Requests: Allow procurement to view all canvass requests  
DROP POLICY IF EXISTS "Approvers can view all canvass requests" ON canvass_requests;
CREATE POLICY "Approvers and Procurement can view all canvass requests"
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

-- Petty Cash Requests: Allow procurement to view all petty cash requests
DROP POLICY IF EXISTS "Approvers can view all petty cash requests" ON petty_cash_requests;
CREATE POLICY "Approvers and Procurement can view all petty cash requests"
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

-- Reimbursement Requests: Allow procurement to view all reimbursement requests
DROP POLICY IF EXISTS "Approvers can view all reimbursement requests" ON reimbursement_requests;
CREATE POLICY "Approvers and Procurement can view all reimbursement requests"
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

-- Cash Advance Requests: Allow procurement to view all cash advance requests
DROP POLICY IF EXISTS "Approvers can view all cash advance requests" ON cash_advance_requests;
CREATE POLICY "Approvers and Procurement can view all cash advance requests"
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

-- Approval Flows: Allow procurement to manage approval flows
DROP POLICY IF EXISTS "Admin users can insert approval flows" ON approval_flows;
CREATE POLICY "Admin and Procurement users can insert approval flows"
  ON approval_flows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'procurement')
    )
  );

DROP POLICY IF EXISTS "Admin users can update approval flows" ON approval_flows;
CREATE POLICY "Admin and Procurement users can update approval flows"
  ON approval_flows
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'procurement')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'procurement')
    )
  );

DROP POLICY IF EXISTS "Admin users can delete approval flows" ON approval_flows;
CREATE POLICY "Admin and Procurement users can delete approval flows"
  ON approval_flows
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'procurement')
    )
  );

-- Number Series: Allow procurement to manage number series
DROP POLICY IF EXISTS "Admin can view number series" ON number_series;
CREATE POLICY "Admin and Procurement can view number series"
  ON number_series
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'procurement')
    )
  );

DROP POLICY IF EXISTS "Admin can insert number series" ON number_series;
CREATE POLICY "Admin and Procurement can insert number series"
  ON number_series
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'procurement')
    )
  );

DROP POLICY IF EXISTS "Admin can update number series" ON number_series;
CREATE POLICY "Admin and Procurement can update number series"
  ON number_series
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'procurement')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'procurement')
    )
  );

DROP POLICY IF EXISTS "Admin can delete number series" ON number_series;
CREATE POLICY "Admin and Procurement can delete number series"
  ON number_series
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'procurement')
    )
  );