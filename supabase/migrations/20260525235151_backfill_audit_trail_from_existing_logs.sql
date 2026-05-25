/*
  # Backfill Audit Trail from Existing Logs

  1. Changes
    - Migrates existing records from `approval_ledger` into `audit_trail`
    - Migrates existing records from `p2p_audit_logs` into `audit_trail`
    - Migrates existing records from `po_audit_logs` into `audit_trail`
    - Migrates existing records from `po_grn_audit_logs` into `audit_trail`
    - Migrates existing records from `invoice_audit_logs` into `audit_trail`

  2. Notes
    - This is a one-time backfill to bring historical data into the unified table
    - The old tables are kept intact for backwards compatibility
    - Future entries will be written directly to `audit_trail` by the application
    - approval_ledger entries are mapped to module='approvals'
    - p2p/po/grn/invoice logs are mapped to module='p2p'
*/

-- Backfill from approval_ledger
INSERT INTO audit_trail (table_name, record_id, action, module, description, old_values, new_values, performed_by, performed_by_name, company_id, created_at)
SELECT
  CASE
    WHEN request_type = 'Purchase Requisition' THEN 'purchase_requisitions'
    WHEN request_type = 'Canvass' THEN 'canvass_requests'
    WHEN request_type = 'Petty Cash' THEN 'petty_cash_requests'
    WHEN request_type = 'Cash Advance' THEN 'cash_advance_requests'
    WHEN request_type = 'Reimbursement' THEN 'reimbursement_requests'
    WHEN request_type = 'Liquidation' THEN 'petty_cash_requests'
    WHEN request_type = 'Purchase Order' THEN 'purchase_orders'
    ELSE 'unknown'
  END as table_name,
  request_id::text as record_id,
  'UPDATE' as action,
  'approvals' as module,
  COALESCE(action, 'pending') || ' ' || COALESCE(request_type, '') || ' ' || COALESCE(request_number, '') as description,
  NULL as old_values,
  jsonb_build_object(
    'action', action,
    'approver_type', approver_type,
    'sequence', sequence,
    'comments', comments,
    'for_checking', for_checking
  ) as new_values,
  COALESCE(approver_id, '00000000-0000-0000-0000-000000000000') as performed_by,
  COALESCE(approver_name, 'System') as performed_by_name,
  company_id,
  COALESCE(approval_date, created_at) as created_at
FROM approval_ledger
WHERE request_id IS NOT NULL;

-- Backfill from p2p_audit_logs
INSERT INTO audit_trail (table_name, record_id, action, module, description, old_values, new_values, performed_by, performed_by_name, created_at)
SELECT
  LOWER(COALESCE(document_type, 'unknown')) as table_name,
  document_id::text as record_id,
  'UPDATE' as action,
  'p2p' as module,
  COALESCE(action, '') || ' ' || COALESCE(document_type, '') as description,
  CASE WHEN from_status IS NOT NULL AND from_status != '' THEN jsonb_build_object('status', from_status) ELSE NULL END as old_values,
  CASE WHEN to_status IS NOT NULL AND to_status != '' THEN jsonb_build_object('status', to_status, 'comments', COALESCE(comments, '')) ELSE jsonb_build_object('action', action) END as new_values,
  COALESCE(acted_by_user_id, '00000000-0000-0000-0000-000000000000') as performed_by,
  COALESCE((SELECT full_name FROM user_profiles WHERE id = acted_by_user_id), 'Unknown') as performed_by_name,
  acted_at as created_at
FROM p2p_audit_logs;

-- Backfill from po_audit_logs
INSERT INTO audit_trail (table_name, record_id, action, module, description, old_values, new_values, performed_by, performed_by_name, created_at)
SELECT
  'purchase_orders' as table_name,
  purchase_order_id::text as record_id,
  'UPDATE' as action,
  'p2p' as module,
  COALESCE(action, '') || ' purchase order' as description,
  old_values,
  COALESCE(new_values, jsonb_build_object('action', action, 'remarks', remarks)) as new_values,
  COALESCE(performed_by, '00000000-0000-0000-0000-000000000000') as performed_by,
  COALESCE((SELECT full_name FROM user_profiles WHERE id = performed_by), 'Unknown') as performed_by_name,
  created_at
FROM po_audit_logs;

-- Backfill from po_grn_audit_logs
INSERT INTO audit_trail (table_name, record_id, action, module, description, old_values, new_values, performed_by, performed_by_name, created_at)
SELECT
  'po_grns' as table_name,
  po_grn_id::text as record_id,
  'UPDATE' as action,
  'p2p' as module,
  COALESCE(action, '') || ' goods receipt' as description,
  old_values,
  COALESCE(new_values, jsonb_build_object('action', action, 'remarks', remarks)) as new_values,
  COALESCE(performed_by, '00000000-0000-0000-0000-000000000000') as performed_by,
  COALESCE((SELECT full_name FROM user_profiles WHERE id = performed_by), 'Unknown') as performed_by_name,
  created_at
FROM po_grn_audit_logs;

-- Backfill from invoice_audit_logs
INSERT INTO audit_trail (table_name, record_id, action, module, description, old_values, new_values, performed_by, performed_by_name, created_at)
SELECT
  'vendor_invoices' as table_name,
  vendor_invoice_id::text as record_id,
  'UPDATE' as action,
  'p2p' as module,
  COALESCE(action, '') || ' vendor invoice' as description,
  old_values,
  COALESCE(new_values, jsonb_build_object('action', action, 'remarks', remarks)) as new_values,
  COALESCE(performed_by, '00000000-0000-0000-0000-000000000000') as performed_by,
  COALESCE((SELECT full_name FROM user_profiles WHERE id = performed_by), 'Unknown') as performed_by_name,
  created_at
FROM invoice_audit_logs;