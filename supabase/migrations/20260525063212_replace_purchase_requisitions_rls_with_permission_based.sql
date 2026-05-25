/*
  # Replace purchase_requisitions hardcoded role policies with permission-based

  1. Dropped Policies
    - "Admins can view all requisitions" (hardcoded role = 'admin')
    - "Admins can update all requisitions" (hardcoded role = 'admin')
    - "Approvers can view company requisitions" (hardcoded roles)
    - "Approvers, Procurement, Accounting, Treasury can view PRs" (hardcoded roles)
    - "Approvers, Procurement, Accounting, Treasury can update PRs" (hardcoded roles)
    - "Users can update own draft requisitions" (redundant, subsumed by draft-or-returned policy)

  2. New Policies
    - "Permission-based view purchase requisitions" - uses user_has_permission('Purchase Requisition Approval') with company scoping
    - "Permission-based update purchase requisitions" - same for updates
    
  3. Security
    - Access driven by roles & permissions configuration
    - Full Access roles get unrestricted access
    - Normal roles scoped to allowed companies
*/

-- Drop legacy hardcoded policies
DROP POLICY IF EXISTS "Admins can view all requisitions" ON purchase_requisitions;
DROP POLICY IF EXISTS "Admins can update all requisitions" ON purchase_requisitions;
DROP POLICY IF EXISTS "Approvers can view company requisitions" ON purchase_requisitions;
DROP POLICY IF EXISTS "Approvers, Procurement, Accounting, Treasury can view PRs" ON purchase_requisitions;
DROP POLICY IF EXISTS "Approvers, Procurement, Accounting, Treasury can update PRs" ON purchase_requisitions;
DROP POLICY IF EXISTS "Users can update own draft requisitions" ON purchase_requisitions;

-- Create permission-based SELECT policy
CREATE POLICY "Permission-based view purchase requisitions"
  ON purchase_requisitions
  FOR SELECT
  TO authenticated
  USING (
    user_has_permission('Purchase Requisition Approval')
    AND user_can_access_company(company_id)
  );

-- Create permission-based UPDATE policy
CREATE POLICY "Permission-based update purchase requisitions"
  ON purchase_requisitions
  FOR UPDATE
  TO authenticated
  USING (
    user_has_permission('Purchase Requisition Approval')
    AND user_can_access_company(company_id)
  )
  WITH CHECK (
    user_has_permission('Purchase Requisition Approval')
    AND user_can_access_company(company_id)
  );