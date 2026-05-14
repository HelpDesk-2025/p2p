/*
  # Vendor Invoice Permissions

  Adds 6 permissions for the AP Invoice module and grants them to the admin role.
*/

INSERT INTO permissions (name, module, description)
VALUES
  ('Invoice Receipt Create', 'Accounts Payable', 'Create vendor invoices for 3-way matching'),
  ('Invoice Receipt View', 'Accounts Payable', 'View vendor invoices and matching results'),
  ('Invoice Receipt Resolve', 'Accounts Payable', 'Resolve invoice exceptions and apply overrides'),
  ('Invoice Receipt Override', 'Accounts Payable', 'Approve overrides exceeding tolerance threshold'),
  ('Invoice Receipt Post', 'Accounts Payable', 'Post matched invoices'),
  ('Invoice Receipt Cancel', 'Accounts Payable', 'Cancel vendor invoices'),
  ('Matching Tolerance Config', 'Configuration', 'Manage 3-way match tolerance settings')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE r.name = 'admin'
   AND p.name IN (
     'Invoice Receipt Create',
     'Invoice Receipt View',
     'Invoice Receipt Resolve',
     'Invoice Receipt Override',
     'Invoice Receipt Post',
     'Invoice Receipt Cancel',
     'Matching Tolerance Config'
   )
ON CONFLICT DO NOTHING;
