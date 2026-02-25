/*
  # Add Approved and Rejected Permission

  1. Changes
    - Inserts a new permission named 'Approved and Rejected' under module 'approved_rejected'
    - This permission controls access to the Approved & Rejected page in the Reimbursement/Liquidation section
    - Users with this permission can view all requests they have been involved in as an approver

  2. Notes
    - Safe insert using ON CONFLICT DO NOTHING to avoid duplicate errors
    - Module name matches the new entry added to the modules list in RolesPermissionsConfig
*/

INSERT INTO permissions (name, description, module, is_active)
VALUES (
  'Approved and Rejected',
  'View all requests the user has approved or rejected',
  'approved_rejected',
  true
)
ON CONFLICT (name) DO NOTHING;
