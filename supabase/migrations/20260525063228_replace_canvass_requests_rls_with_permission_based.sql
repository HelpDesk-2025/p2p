/*
  # Replace canvass_requests hardcoded role policies with permission-based

  1. Dropped Policies
    - "Admins can view all canvass" (hardcoded role = 'admin')
    - "Admins can update all canvass" (hardcoded role = 'admin')
    - "Approvers can view company canvass" (hardcoded role = 'approver')
    - "Approvers can view company canvass requests" (hardcoded roles)
    - "Approvers, Procurement, Accounting, Treasury can view canvass" (hardcoded roles)
    - "Approvers, Procurement, Accounting, Treasury can update canvass" (hardcoded roles)

  2. New Policies
    - "Permission-based view canvass requests" - uses user_has_permission('Canvass Approval') with company scoping
    - "Permission-based update canvass requests" - same for updates
    
  3. Security
    - Access driven by roles & permissions configuration
    - Full Access roles get unrestricted access
    - Normal roles scoped to allowed companies
*/

-- Drop legacy hardcoded policies
DROP POLICY IF EXISTS "Admins can view all canvass" ON canvass_requests;
DROP POLICY IF EXISTS "Admins can update all canvass" ON canvass_requests;
DROP POLICY IF EXISTS "Approvers can view company canvass" ON canvass_requests;
DROP POLICY IF EXISTS "Approvers can view company canvass requests" ON canvass_requests;
DROP POLICY IF EXISTS "Approvers, Procurement, Accounting, Treasury can view canvass" ON canvass_requests;
DROP POLICY IF EXISTS "Approvers, Procurement, Accounting, Treasury can update canvass" ON canvass_requests;

-- Create permission-based SELECT policy
CREATE POLICY "Permission-based view canvass requests"
  ON canvass_requests
  FOR SELECT
  TO authenticated
  USING (
    user_has_permission('Canvass Approval')
    AND user_can_access_company(company_id)
  );

-- Create permission-based UPDATE policy
CREATE POLICY "Permission-based update canvass requests"
  ON canvass_requests
  FOR UPDATE
  TO authenticated
  USING (
    user_has_permission('Canvass Approval')
    AND user_can_access_company(company_id)
  )
  WITH CHECK (
    user_has_permission('Canvass Approval')
    AND user_can_access_company(company_id)
  );