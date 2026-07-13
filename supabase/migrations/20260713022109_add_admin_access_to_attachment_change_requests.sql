/*
# Add admin access to attachment_change_requests

## Changes
- Adds a SELECT policy allowing admin users to view all attachment change requests
- Adds an UPDATE policy allowing admin users to update any change request
- This enables admins to monitor and manage pending attachment changes across the system

## Security
- Admin check uses the existing user_profiles.role pattern
- Policies are scoped to authenticated users only
*/

DROP POLICY IF EXISTS "admin_select_attachment_change_requests" ON attachment_change_requests;
CREATE POLICY "admin_select_attachment_change_requests" ON attachment_change_requests FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "admin_update_attachment_change_requests" ON attachment_change_requests;
CREATE POLICY "admin_update_attachment_change_requests" ON attachment_change_requests FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );
