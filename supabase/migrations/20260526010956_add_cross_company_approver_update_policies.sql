/*
  # Allow Cross-Company Approvers to Update Requests

  ## Summary
  Fixes a critical bug where approvers configured in approval_flows for companies
  other than their own could not update requests (e.g., increment current_approval_level)
  when approving. The approval ledger entry was created successfully, but the actual
  request status/level update was silently blocked by RLS.

  ## Problem
  - UPDATE policies on all request tables require user_can_access_company(company_id)
  - Approvers assigned via approval_flows to other companies fail this check
  - Result: approval ledger entry is created but current_approval_level never increments
  - The request appears stuck at the same approval level

  ## Solution
  Add permissive UPDATE policies on each request table that allow authenticated
  users to update requests from any company where they are configured as an approver
  (user_id or alternate_approver_id) in the approval_flows table.

  ## Modified Tables (new UPDATE policy added)
  - purchase_requisitions
  - petty_cash_requests
  - canvass_requests
  - cash_advance_requests
  - reimbursement_requests

  ## Security
  - Only grants UPDATE access to users explicitly configured in approval_flows
  - Both USING and WITH CHECK use the same function for consistency
  - The user_is_approver_for_company function is SECURITY DEFINER and checks
    approval_flows.is_active = true
*/

-- purchase_requisitions: allow cross-company approvers to update
CREATE POLICY "Approvers can update assigned company PRs"
  ON purchase_requisitions
  FOR UPDATE
  TO authenticated
  USING (user_is_approver_for_company(company_id))
  WITH CHECK (user_is_approver_for_company(company_id));

-- petty_cash_requests: allow cross-company approvers to update
CREATE POLICY "Approvers can update assigned company petty cash"
  ON petty_cash_requests
  FOR UPDATE
  TO authenticated
  USING (user_is_approver_for_company(company_id))
  WITH CHECK (user_is_approver_for_company(company_id));

-- canvass_requests: allow cross-company approvers to update
CREATE POLICY "Approvers can update assigned company canvass"
  ON canvass_requests
  FOR UPDATE
  TO authenticated
  USING (user_is_approver_for_company(company_id))
  WITH CHECK (user_is_approver_for_company(company_id));

-- cash_advance_requests: allow cross-company approvers to update
CREATE POLICY "Approvers can update assigned company cash advance"
  ON cash_advance_requests
  FOR UPDATE
  TO authenticated
  USING (user_is_approver_for_company(company_id))
  WITH CHECK (user_is_approver_for_company(company_id));

-- reimbursement_requests: allow cross-company approvers to update
CREATE POLICY "Approvers can update assigned company reimbursement"
  ON reimbursement_requests
  FOR UPDATE
  TO authenticated
  USING (user_is_approver_for_company(company_id))
  WITH CHECK (user_is_approver_for_company(company_id));
