/*
  # Purchase Order Permissions

  ## Changes
  Inserts the four Purchase Order permission rows used by the new module:
    - Purchase Order Request   (po.create)
    - Purchase Order Approval  (po.approve)
    - Purchase Order View      (po.view)
    - Purchase Order Dispatch  (po.dispatch)

  ## Security
  No RLS changes. The permissions table already has RLS configured. Inserts use
  ON CONFLICT DO NOTHING to be idempotent.
*/

INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('Purchase Order Request', 'Create and manage purchase orders', 'Requests', true),
  ('Purchase Order Approval', 'Approve purchase orders', 'Approvals', true),
  ('Purchase Order View', 'View purchase order list', 'Requests', true),
  ('Purchase Order Dispatch', 'Dispatch purchase orders to vendors', 'Procurement', true)
ON CONFLICT (name) DO NOTHING;

-- Grant the new PO permissions to admin role automatically
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.name IN ('Purchase Order Request','Purchase Order Approval','Purchase Order View','Purchase Order Dispatch')
ON CONFLICT DO NOTHING;
