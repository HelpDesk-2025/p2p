/*
  # Add Goods Receipt Edit and Lock Permissions

  1. New Permissions
    - `Goods Receipt Edit` - allows editing confirmed GRs that are not locked
    - `Goods Receipt Lock` - allows locking a confirmed GR to prevent further edits/cancellations

  2. Security
    - Both permissions auto-granted to admin role
    - Module: Receiving (same as other GR permissions)
*/

INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('Goods Receipt Edit', 'Edit confirmed goods receipts that are not yet locked', 'Receiving', true),
  ('Goods Receipt Lock', 'Lock confirmed goods receipts to prevent further edits or cancellations', 'Receiving', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.name IN ('Goods Receipt Edit', 'Goods Receipt Lock')
ON CONFLICT DO NOTHING;
