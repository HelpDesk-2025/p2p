/*
  # Replace reimbursement_requests hardcoded role policies with permission-based

  1. Dropped Policies
    - "Admins can view all reimbursements" (hardcoded role = 'admin')
    - "Admins can update all reimbursements" (hardcoded role = 'admin')
    - "Approvers can view company reimbursement requests" (hardcoded roles)
    - "Approvers can view company reimbursements" (hardcoded role = 'approver')
    - "Approvers, Procurement, Accounting, Treasury can view reimb" (hardcoded roles)
    - "Approvers, Procurement, Accounting, Treasury can update reimb" (hardcoded roles)

  2. New Policies
    - "Permission-based view reimbursement requests" - uses user_has_permission('Reimbursement Approval') with company scoping
    - "Permission-based update reimbursement requests" - same for updates
    
  3. Security
    - Access driven by roles & permissions configuration
    - Full Access roles get unrestricted access
    - Normal roles scoped to allowed companies
*/

-- Drop legacy hardcoded policies
DROP POLICY IF EXISTS "Admins can view all reimbursements" ON reimbursement_requests;
DROP POLICY IF EXISTS "Admins can update all reimbursements" ON reimbursement_requests;
DROP POLICY IF EXISTS "Approvers can view company reimbursement requests" ON reimbursement_requests;
DROP POLICY IF EXISTS "Approvers can view company reimbursements" ON reimbursement_requests;
DROP POLICY IF EXISTS "Approvers, Procurement, Accounting, Treasury can view reimb" ON reimbursement_requests;
DROP POLICY IF EXISTS "Approvers, Procurement, Accounting, Treasury can update reimb" ON reimbursement_requests;

-- Create permission-based SELECT policy
CREATE POLICY "Permission-based view reimbursement requests"
  ON reimbursement_requests
  FOR SELECT
  TO authenticated
  USING (
    user_has_permission('Reimbursement Approval')
    AND user_can_access_company(company_id)
  );

-- Create permission-based UPDATE policy
CREATE POLICY "Permission-based update reimbursement requests"
  ON reimbursement_requests
  FOR UPDATE
  TO authenticated
  USING (
    user_has_permission('Reimbursement Approval')
    AND user_can_access_company(company_id)
  )
  WITH CHECK (
    user_has_permission('Reimbursement Approval')
    AND user_can_access_company(company_id)
  );