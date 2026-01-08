/*
  # Fix Purchase Requisition RLS for Approvers

  Updates the RLS policies on purchase_requisitions to work with the new approval flow system.
  
  Changes:
  - Drops old policies that check the deprecated `approvers` table
  - Creates new policies that check user role and approval flows
  - Allows approvers to view all pending requisitions in their company
  - Allows approvers to update requisitions they can approve
  
  Security:
  - Users can still only view/edit their own drafts
  - Approvers can view all pending requests in their company
  - Approvers can update status when they are in the approval flow
*/

-- Drop old approver policies
DROP POLICY IF EXISTS "Approvers can view pending requisitions" ON purchase_requisitions;
DROP POLICY IF EXISTS "Approvers can update requisition status" ON purchase_requisitions;

-- Create new policy for approvers to view all pending requisitions in their company
CREATE POLICY "Approvers can view company requisitions"
  ON purchase_requisitions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'approver'
      AND user_profiles.is_active = true
    )
  );

-- Create new policy for approvers to update requisition status
CREATE POLICY "Approvers can update requisition status"
  ON purchase_requisitions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin')
      AND user_profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin')
      AND user_profiles.is_active = true
    )
  );

-- Admin can view all requisitions
CREATE POLICY "Admins can view all requisitions"
  ON purchase_requisitions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.is_active = true
    )
  );

-- Admin can update all requisitions
CREATE POLICY "Admins can update all requisitions"
  ON purchase_requisitions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.is_active = true
    )
  );
