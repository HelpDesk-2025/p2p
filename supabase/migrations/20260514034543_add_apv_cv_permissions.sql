/*
  # AP Voucher / Check Voucher Permissions
  Adds module permissions for the Accounting Posting & Payment Processing module.
*/

INSERT INTO permissions (name, module, description) VALUES
  ('AP Voucher Create', 'Accounts Payable', 'Create AP vouchers from matched invoices'),
  ('AP Voucher View', 'Accounts Payable', 'View AP vouchers'),
  ('AP Voucher Approve', 'Accounts Payable', 'Approve AP vouchers'),
  ('Check Voucher Create', 'Treasury', 'Create check vouchers from approved APVs'),
  ('Check Voucher View', 'Treasury', 'View check vouchers and payment status'),
  ('Check Voucher Approve', 'Treasury', 'Approve check vouchers'),
  ('Check Voucher Release', 'Treasury', 'Release approved check voucher payments'),
  ('Payment Schedule View', 'Treasury', 'View the treasury payment schedule'),
  ('Payment Reports View', 'Treasury', 'View aging, EWT, and payment reports'),
  ('PO Closure Manage', 'Procurement', 'Manage PO closure and view full lifecycle')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE r.name = 'admin' AND p.name IN (
   'AP Voucher Create','AP Voucher View','AP Voucher Approve',
   'Check Voucher Create','Check Voucher View','Check Voucher Approve','Check Voucher Release',
   'Payment Schedule View','Payment Reports View','PO Closure Manage'
 ) ON CONFLICT DO NOTHING;
