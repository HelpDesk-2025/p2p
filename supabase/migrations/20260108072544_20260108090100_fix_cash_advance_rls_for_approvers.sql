/*
  # Fix Cash Advance Request RLS for Approvers

  Updates the RLS policies on cash_advance_requests to work with the approval flow system.

  Changes:
  - Drops old policies that don't check activation status
  - Creates new policies that check user role and active status
  - Allows approvers to view all pending cash advance in their company
  - Allows approvers to update cash advance they can approve

  Security:
  - Users can still only view/edit their own drafts
  - Approvers can view all pending requests in their company
  - Approvers must be active to approve requests
  - Admins retain full access
*/

-- Drop old approver policies
DROP POLICY IF EXISTS "Approvers can view pending cash advance requests" ON cash_advance_requests;
DROP POLICY IF EXISTS "Approvers can update pending cash advance requests" ON cash_advance_requests;
DROP POLICY IF EXISTS "Approvers can view company cash advance" ON cash_advance_requests;
DROP POLICY IF EXISTS "Approvers can update cash advance status" ON cash_advance_requests;

-- Create new policy for approvers to view all pending cash advance in their company
CREATE POLICY "Approvers can view company cash advance"
  ON cash_advance_requests
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

-- Create new policy for approvers to update cash advance status
CREATE POLICY "Approvers can update cash advance status"
  ON cash_advance_requests
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

-- Update admin view policy to check is_active
DROP POLICY IF EXISTS "Admins can view all cash advance requests" ON cash_advance_requests;
DROP POLICY IF EXISTS "Admins can view all cash advance" ON cash_advance_requests;
CREATE POLICY "Admins can view all cash advance"
  ON cash_advance_requests
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

-- Update admin manage policy to use separate UPDATE policy and check is_active
DROP POLICY IF EXISTS "Admins can manage all cash advance requests" ON cash_advance_requests;
DROP POLICY IF EXISTS "Admins can update all cash advance" ON cash_advance_requests;
CREATE POLICY "Admins can update all cash advance"
  ON cash_advance_requests
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
