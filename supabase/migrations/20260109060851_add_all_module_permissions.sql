/*
  # Add Comprehensive Module Permissions

  1. New Permissions
    - Add permissions for all system modules:
      - Purchase Requisition (view, create, edit, delete, approve)
      - Canvass (view, create, edit, delete, approve)
      - Petty Cash (view, create, edit, delete, approve)
      - Cash Advance (view, create, edit, delete, approve)
      - Reimbursement (view, create, edit, delete, approve)
      - PR Approval (view, approve, reject)
      - Canvass Approval (view, approve, reject)
      - Petty Cash Approval (view, approve, reject)
      - Cash Advance Approval (view, approve, reject)
      - Reimbursement Approval (view, approve, reject)
      - SME Approval (view, approve, reject)
      - Procurement Checking (view, check, manage)
      - Approval Ledger (view, export)
      - Configuration (view, manage)

  2. Security
    - Uses existing RLS policies on permissions table
*/

-- Purchase Requisition permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('purchase_requisition.view', 'View purchase requisitions', 'purchase_requisition', true),
  ('purchase_requisition.create', 'Create new purchase requisitions', 'purchase_requisition', true),
  ('purchase_requisition.edit', 'Edit purchase requisitions', 'purchase_requisition', true),
  ('purchase_requisition.delete', 'Delete purchase requisitions', 'purchase_requisition', true)
ON CONFLICT (name) DO NOTHING;

-- Canvass permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('canvass.view', 'View canvass requests', 'canvass', true),
  ('canvass.create', 'Create new canvass requests', 'canvass', true),
  ('canvass.edit', 'Edit canvass requests', 'canvass', true),
  ('canvass.delete', 'Delete canvass requests', 'canvass', true)
ON CONFLICT (name) DO NOTHING;

-- Petty Cash permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('petty_cash.view', 'View petty cash requests', 'petty_cash', true),
  ('petty_cash.create', 'Create new petty cash requests', 'petty_cash', true),
  ('petty_cash.edit', 'Edit petty cash requests', 'petty_cash', true),
  ('petty_cash.delete', 'Delete petty cash requests', 'petty_cash', true)
ON CONFLICT (name) DO NOTHING;

-- Cash Advance permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('cash_advance.view', 'View cash advance requests', 'cash_advance', true),
  ('cash_advance.create', 'Create new cash advance requests', 'cash_advance', true),
  ('cash_advance.edit', 'Edit cash advance requests', 'cash_advance', true),
  ('cash_advance.delete', 'Delete cash advance requests', 'cash_advance', true)
ON CONFLICT (name) DO NOTHING;

-- Reimbursement permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('reimbursement.view', 'View reimbursement requests', 'reimbursement', true),
  ('reimbursement.create', 'Create new reimbursement requests', 'reimbursement', true),
  ('reimbursement.edit', 'Edit reimbursement requests', 'reimbursement', true),
  ('reimbursement.delete', 'Delete reimbursement requests', 'reimbursement', true)
ON CONFLICT (name) DO NOTHING;

-- PR Approval permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('pr_approval.view', 'View PR approval requests', 'pr_approval', true),
  ('pr_approval.approve', 'Approve purchase requisitions', 'pr_approval', true),
  ('pr_approval.reject', 'Reject purchase requisitions', 'pr_approval', true)
ON CONFLICT (name) DO NOTHING;

-- Canvass Approval permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('canvass_approval.view', 'View canvass approval requests', 'canvass_approval', true),
  ('canvass_approval.approve', 'Approve canvass requests', 'canvass_approval', true),
  ('canvass_approval.reject', 'Reject canvass requests', 'canvass_approval', true)
ON CONFLICT (name) DO NOTHING;

-- Petty Cash Approval permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('petty_cash_approval.view', 'View petty cash approval requests', 'petty_cash_approval', true),
  ('petty_cash_approval.approve', 'Approve petty cash requests', 'petty_cash_approval', true),
  ('petty_cash_approval.reject', 'Reject petty cash requests', 'petty_cash_approval', true)
ON CONFLICT (name) DO NOTHING;

-- Cash Advance Approval permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('cash_advance_approval.view', 'View cash advance approval requests', 'cash_advance_approval', true),
  ('cash_advance_approval.approve', 'Approve cash advance requests', 'cash_advance_approval', true),
  ('cash_advance_approval.reject', 'Reject cash advance requests', 'cash_advance_approval', true)
ON CONFLICT (name) DO NOTHING;

-- Reimbursement Approval permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('reimbursement_approval.view', 'View reimbursement approval requests', 'reimbursement_approval', true),
  ('reimbursement_approval.approve', 'Approve reimbursement requests', 'reimbursement_approval', true),
  ('reimbursement_approval.reject', 'Reject reimbursement requests', 'reimbursement_approval', true)
ON CONFLICT (name) DO NOTHING;

-- SME Approval permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('sme_approval.view', 'View SME approval requests', 'sme_approval', true),
  ('sme_approval.approve', 'Approve SME requests', 'sme_approval', true),
  ('sme_approval.reject', 'Reject SME requests', 'sme_approval', true)
ON CONFLICT (name) DO NOTHING;

-- Procurement Checking permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('procurement_checking.view', 'View procurement checking page', 'procurement_checking', true),
  ('procurement_checking.check', 'Perform procurement checks', 'procurement_checking', true),
  ('procurement_checking.manage', 'Manage procurement settings', 'procurement_checking', true)
ON CONFLICT (name) DO NOTHING;

-- Approval Ledger permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('approval_ledger.view', 'View approval ledger', 'approval_ledger', true),
  ('approval_ledger.export', 'Export approval ledger data', 'approval_ledger', true)
ON CONFLICT (name) DO NOTHING;

-- Configuration permissions (keep existing ones)
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('configuration.view', 'View configuration settings', 'configuration', true),
  ('configuration.manage', 'Manage all configuration settings', 'configuration', true)
ON CONFLICT (name) DO NOTHING;