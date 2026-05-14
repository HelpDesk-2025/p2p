/*
  # Goods Receipt (PO GRN) Permissions

  Adds the four GRN permissions and grants them to the admin role automatically.
  Idempotent via ON CONFLICT DO NOTHING.
*/

INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('Goods Receipt Create', 'Create goods receipt notes against POs', 'Receiving', true),
  ('Goods Receipt View', 'View goods receipt notes', 'Receiving', true),
  ('Goods Receipt Confirm', 'Confirm goods receipts and update PO status', 'Receiving', true),
  ('Goods Receipt Cancel', 'Cancel goods receipts', 'Receiving', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.name IN ('Goods Receipt Create','Goods Receipt View','Goods Receipt Confirm','Goods Receipt Cancel')
ON CONFLICT DO NOTHING;
