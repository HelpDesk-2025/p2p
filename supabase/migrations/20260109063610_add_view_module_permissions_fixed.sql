/*
  # Add View Module Permissions

  1. New Permissions
    - Add view permissions for each module to enable menu access control
    - These permissions control which modules users can see in the navigation
    
  2. Permissions Added
    - view_purchase_requisition - View Purchase Requisition module
    - view_canvass - View Canvass module
    - view_cash_advance - View Cash Advance module
    - view_petty_cash - View Petty Cash module
    - view_reimbursement - View Reimbursement module
    - view_pr_approval - View PR Approval module
    - view_canvass_approval - View Canvass Approval module
    - view_cash_advance_approval - View Cash Advance Approval module
    - view_petty_cash_approval - View Petty Cash Approval module
    - view_reimbursement_approval - View Reimbursement Approval module
    - view_sme_approval - View SME Approval module
    - view_procurement_checking - View Procurement Checking module
    - view_approval_ledger - View Approval Ledger module
    - view_number_series_config - View Number Series Config module
    - view_approval_flow_config - View Approval Flow Config module
    - view_smtp_config - View SMTP Config module
    - view_roles_permissions_config - View Roles & Permissions Config module

  3. Security
    - Admins get all view permissions
    - Approvers get approval and procurement module permissions
    - Requesters get basic request module permissions
*/

-- Insert view permissions for modules
INSERT INTO permissions (name, description, module, is_active) VALUES
  -- Request module permissions
  ('view_purchase_requisition', 'Access Purchase Requisition module', 'purchase_requisition', true),
  ('view_canvass', 'Access Canvass module', 'canvass', true),
  ('view_cash_advance', 'Access Cash Advance module', 'cash_advance', true),
  ('view_petty_cash', 'Access Petty Cash module', 'petty_cash', true),
  ('view_reimbursement', 'Access Reimbursement module', 'reimbursement', true),
  
  -- Approval module permissions
  ('view_pr_approval', 'Access PR Approval module', 'approvals', true),
  ('view_canvass_approval', 'Access Canvass Approval module', 'approvals', true),
  ('view_cash_advance_approval', 'Access Cash Advance Approval module', 'approvals', true),
  ('view_petty_cash_approval', 'Access Petty Cash Approval module', 'approvals', true),
  ('view_reimbursement_approval', 'Access Reimbursement Approval module', 'approvals', true),
  ('view_sme_approval', 'Access SME Approval module', 'approvals', true),
  
  -- Procurement module permissions
  ('view_procurement_checking', 'Access Procurement Checking module', 'procurement', true),
  ('view_approval_ledger', 'Access Approval Ledger module', 'procurement', true),
  
  -- Configuration module permissions
  ('view_number_series_config', 'Access Number Series Config', 'configuration', true),
  ('view_approval_flow_config', 'Access Approval Flow Config', 'configuration', true),
  ('view_smtp_config', 'Access SMTP Config', 'configuration', true),
  ('view_roles_permissions_config', 'Access Roles & Permissions Config', 'configuration', true)
ON CONFLICT (name) DO NOTHING;

-- Grant all view permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.name LIKE 'view_%'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant approval and procurement view permissions to approver role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'approver'
  AND p.name IN (
    'view_pr_approval',
    'view_canvass_approval',
    'view_cash_advance_approval',
    'view_petty_cash_approval',
    'view_reimbursement_approval',
    'view_sme_approval',
    'view_procurement_checking',
    'view_approval_ledger'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant request module view permissions to requester role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'requester'
  AND p.name IN (
    'view_purchase_requisition',
    'view_canvass',
    'view_cash_advance',
    'view_petty_cash',
    'view_reimbursement'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;
