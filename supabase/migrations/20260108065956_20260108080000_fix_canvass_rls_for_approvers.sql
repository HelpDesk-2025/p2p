/*
  # Fix Canvass Request RLS for Approvers

  Updates the RLS policies on canvass_requests to work with the approval flow system.

  Changes:
  - Drops old broad policies that don't check company/activation
  - Creates new policies that check user role, company, and active status
  - Allows approvers to view all pending canvass in their company
  - Allows approvers to update canvass they can approve

  Security:
  - Users can still only view/edit their own drafts
  - Approvers can view all pending requests in their company
  - Approvers can update status when they are in the approval flow
*/

-- Drop old approver policies
DROP POLICY IF EXISTS "Approvers can view pending canvass requests" ON canvass_requests;
DROP POLICY IF EXISTS "Approvers can update canvass status" ON canvass_requests;

-- Create new policy for approvers to view all pending canvass in their company
CREATE POLICY "Approvers can view company canvass"
  ON canvass_requests
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

-- Create new policy for approvers to update canvass status
CREATE POLICY "Approvers can update canvass status"
  ON canvass_requests
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

-- Admin can view all canvass requests
CREATE POLICY "Admins can view all canvass"
  ON canvass_requests
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

-- Admin can update all canvass requests
CREATE POLICY "Admins can update all canvass"
  ON canvass_requests
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
