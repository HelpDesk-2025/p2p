/*
  # Replace cash_advance_requests hardcoded role policies with permission-based

  1. Dropped Policies
    - "Admins can view all cash advance" (hardcoded role = 'admin')
    - "Admins can view all cash advances" (duplicate)
    - "Admins can update all cash advance" (hardcoded role = 'admin')
    - "Admins can update all cash advances" (duplicate)
    - "Approvers can view company cash advance" (hardcoded role = 'approver')
    - "Approvers can view company cash advance requests" (hardcoded roles)
    - "Approvers can view company cash advances" (hardcoded role = 'approver')
    - "Approvers, Procurement, Accounting, Treasury can view CA" (hardcoded roles)
    - "Approvers, Procurement, Accounting, Treasury can update CA" (hardcoded roles)

  2. New Policies
    - "Permission-based view cash advance requests" - uses user_has_permission('Cash Advance Approval') with company scoping
    - "Permission-based update cash advance requests" - same for updates
    
  3. Security
    - Access driven by roles & permissions configuration
    - Full Access roles get unrestricted access
    - Normal roles scoped to allowed companies
    - Also cleans up duplicate admin policies
*/

-- Drop all legacy hardcoded policies (including duplicates)
DROP POLICY IF EXISTS "Admins can view all cash advance" ON cash_advance_requests;
DROP POLICY IF EXISTS "Admins can view all cash advances" ON cash_advance_requests;
DROP POLICY IF EXISTS "Admins can update all cash advance" ON cash_advance_requests;
DROP POLICY IF EXISTS "Admins can update all cash advances" ON cash_advance_requests;
DROP POLICY IF EXISTS "Approvers can view company cash advance" ON cash_advance_requests;
DROP POLICY IF EXISTS "Approvers can view company cash advance requests" ON cash_advance_requests;
DROP POLICY IF EXISTS "Approvers can view company cash advances" ON cash_advance_requests;
DROP POLICY IF EXISTS "Approvers, Procurement, Accounting, Treasury can view CA" ON cash_advance_requests;
DROP POLICY IF EXISTS "Approvers, Procurement, Accounting, Treasury can update CA" ON cash_advance_requests;

-- Create permission-based SELECT policy
CREATE POLICY "Permission-based view cash advance requests"
  ON cash_advance_requests
  FOR SELECT
  TO authenticated
  USING (
    user_has_permission('Cash Advance Approval')
    AND user_can_access_company(company_id)
  );

-- Create permission-based UPDATE policy
CREATE POLICY "Permission-based update cash advance requests"
  ON cash_advance_requests
  FOR UPDATE
  TO authenticated
  USING (
    user_has_permission('Cash Advance Approval')
    AND user_can_access_company(company_id)
  )
  WITH CHECK (
    user_has_permission('Cash Advance Approval')
    AND user_can_access_company(company_id)
  );