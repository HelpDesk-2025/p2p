/*
  # Allow Cross-Company Approvers to View Requests

  ## Summary
  Fixes a bug where approvers configured in approval_flows for multiple companies
  could not see requests from those companies on the Approval pages. The Dashboard
  count (via SECURITY DEFINER RPC) was correct, but the follow-up SELECT was
  blocked by RLS because user_can_access_company() only checks the user's own
  company or allowed_companies list.

  ## Problem
  - get_my_pending_approval_ids RPC (SECURITY DEFINER) returns request IDs from ALL
    companies where the user is an approver in approval_flows
  - The subsequent SELECT on request tables is subject to RLS
  - Existing RLS policies require user_can_access_company(company_id) which fails
    for companies the user is not explicitly assigned to

  ## Solution
  Add a new permissive SELECT policy on each request table that allows authenticated
  users to view requests from any company where they are configured as an approver
  (user_id or alternate_approver_id) in the approval_flows table.

  ## Modified Tables (new SELECT policy added)
  - purchase_requisitions
  - petty_cash_requests
  - canvass_requests
  - cash_advance_requests
  - reimbursement_requests

  ## Security
  - Only grants SELECT (read) access, not INSERT/UPDATE/DELETE
  - Only matches companies where the user is explicitly configured in approval_flows
  - Still requires the user to be authenticated
*/

-- Helper function: check if user is an approver for a given company
CREATE OR REPLACE FUNCTION public.user_is_approver_for_company(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM approval_flows af
    WHERE af.company_id = p_company_id
      AND af.is_active = true
      AND (af.user_id = v_uid OR af.alternate_approver_id = v_uid)
  );
END;
$$;

-- Also check via approval_flow_setups (some flows link company through setups)
CREATE OR REPLACE FUNCTION public.user_is_approver_for_company(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM approval_flows af
    LEFT JOIN approval_flow_setups afs ON af.approval_flow_setup_id = afs.id
    WHERE (af.company_id = p_company_id OR afs.company_id = p_company_id)
      AND af.is_active = true
      AND (af.user_id = v_uid OR af.alternate_approver_id = v_uid)
  );
END;
$$;

-- purchase_requisitions: allow approvers to view PRs from their assigned companies
CREATE POLICY "Approvers can view assigned company PRs"
  ON purchase_requisitions
  FOR SELECT
  TO authenticated
  USING (user_is_approver_for_company(company_id));

-- petty_cash_requests: allow approvers to view from assigned companies
CREATE POLICY "Approvers can view assigned company petty cash"
  ON petty_cash_requests
  FOR SELECT
  TO authenticated
  USING (user_is_approver_for_company(company_id));

-- canvass_requests: allow approvers to view from assigned companies
CREATE POLICY "Approvers can view assigned company canvass"
  ON canvass_requests
  FOR SELECT
  TO authenticated
  USING (user_is_approver_for_company(company_id));

-- cash_advance_requests: allow approvers to view from assigned companies
CREATE POLICY "Approvers can view assigned company cash advance"
  ON cash_advance_requests
  FOR SELECT
  TO authenticated
  USING (user_is_approver_for_company(company_id));

-- reimbursement_requests: allow approvers to view from assigned companies
CREATE POLICY "Approvers can view assigned company reimbursement"
  ON reimbursement_requests
  FOR SELECT
  TO authenticated
  USING (user_is_approver_for_company(company_id));
