/*
  # Replace petty_cash_requests hardcoded role policies with permission-based

  1. Dropped Policies
    - "Admins can view all petty cash" (hardcoded role = 'admin')
    - "Admins can update all petty cash" (hardcoded role = 'admin')
    - "Approvers can view company petty cash" (hardcoded role = 'approver')
    - "Approvers can view company petty cash requests" (hardcoded roles)
    - "Approvers, Procurement, Accounting, Treasury can view petty cas" (hardcoded roles)
    - "Approvers, Procurement, Accounting, Treasury can update petty c" (hardcoded roles)

  2. New Policies
    - "Permission-based view petty cash requests" - uses user_has_permission('Petty Cash Approval') with company scoping
    - "Permission-based update petty cash requests" - same permission check for updates
    
  3. Security
    - Access is now fully driven by roles & permissions configuration
    - Full Access roles automatically get unrestricted access (no company filter)
    - Normal roles are scoped to their allowed companies
    - Existing PCR, self-access, and cancel policies remain unchanged
*/

-- Drop legacy hardcoded policies
DROP POLICY IF EXISTS "Admins can view all petty cash" ON petty_cash_requests;
DROP POLICY IF EXISTS "Admins can update all petty cash" ON petty_cash_requests;
DROP POLICY IF EXISTS "Approvers can view company petty cash" ON petty_cash_requests;
DROP POLICY IF EXISTS "Approvers can view company petty cash requests" ON petty_cash_requests;
DROP POLICY IF EXISTS "Approvers, Procurement, Accounting, Treasury can view petty cas" ON petty_cash_requests;
DROP POLICY IF EXISTS "Approvers, Procurement, Accounting, Treasury can update petty c" ON petty_cash_requests;

-- Create permission-based SELECT policy
CREATE POLICY "Permission-based view petty cash requests"
  ON petty_cash_requests
  FOR SELECT
  TO authenticated
  USING (
    user_has_permission('Petty Cash Approval')
    AND user_can_access_company(company_id)
  );

-- Create permission-based UPDATE policy
CREATE POLICY "Permission-based update petty cash requests"
  ON petty_cash_requests
  FOR UPDATE
  TO authenticated
  USING (
    user_has_permission('Petty Cash Approval')
    AND user_can_access_company(company_id)
  )
  WITH CHECK (
    user_has_permission('Petty Cash Approval')
    AND user_can_access_company(company_id)
  );