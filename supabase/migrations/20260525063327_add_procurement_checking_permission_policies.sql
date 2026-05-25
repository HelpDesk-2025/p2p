/*
  # Add Procurement Checking permission-based policies for PR and Canvass

  1. New Policies
    - "Procurement checking view purchase requisitions" - allows users with Procurement Checking permission to view PRs in their allowed companies
    - "Procurement checking update purchase requisitions" - allows status updates during checking
    - "Procurement checking view canvass requests" - allows users with Procurement Checking permission to view canvass in their allowed companies
    - "Procurement checking update canvass requests" - allows status updates during checking

  2. Security
    - Uses user_has_permission('Procurement Checking') for dynamic permission check
    - Scoped to user's allowed companies via user_can_access_company
    - Full Access roles already covered by the approval policies
*/

-- Procurement Checking SELECT on purchase_requisitions
CREATE POLICY "Procurement checking view purchase requisitions"
  ON purchase_requisitions
  FOR SELECT
  TO authenticated
  USING (
    user_has_permission('Procurement Checking')
    AND user_can_access_company(company_id)
  );

-- Procurement Checking UPDATE on purchase_requisitions
CREATE POLICY "Procurement checking update purchase requisitions"
  ON purchase_requisitions
  FOR UPDATE
  TO authenticated
  USING (
    user_has_permission('Procurement Checking')
    AND user_can_access_company(company_id)
  )
  WITH CHECK (
    user_has_permission('Procurement Checking')
    AND user_can_access_company(company_id)
  );

-- Procurement Checking SELECT on canvass_requests
CREATE POLICY "Procurement checking view canvass requests"
  ON canvass_requests
  FOR SELECT
  TO authenticated
  USING (
    user_has_permission('Procurement Checking')
    AND user_can_access_company(company_id)
  );

-- Procurement Checking UPDATE on canvass_requests
CREATE POLICY "Procurement checking update canvass requests"
  ON canvass_requests
  FOR UPDATE
  TO authenticated
  USING (
    user_has_permission('Procurement Checking')
    AND user_can_access_company(company_id)
  )
  WITH CHECK (
    user_has_permission('Procurement Checking')
    AND user_can_access_company(company_id)
  );