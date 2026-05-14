/*
  # Remove APV/CV/Payment Schedule/Payment Reports Module

  This module is being removed because the workflow will be handled
  by Microsoft Business Central (MSBC) instead.

  1. Drops new tables created for the module:
     - payment_audit_logs, payment_schedule
     - cv_approval_logs, cv_apv_links, check_vouchers
     - apv_approval_logs, ewt_rate_options, chart_of_accounts
  2. Drops helper/RPC functions:
     - release_check_voucher, void_check_voucher, try_close_po
     - generate_cv_number, generate_apv_number
     - user_has_treasury_access, user_has_apv_access
  3. Reverts additive columns previously added to ap_vouchers
     (preserves the original pre-existing table & rows).
  4. Removes the 10 permissions seeded for AP/CV/Payment Schedule/
     Payment Reports/PO Closure (and their role grants).
*/

-- 1. Drop new tables (children first)
DROP TABLE IF EXISTS payment_audit_logs CASCADE;
DROP TABLE IF EXISTS payment_schedule CASCADE;
DROP TABLE IF EXISTS cv_approval_logs CASCADE;
DROP TABLE IF EXISTS cv_apv_links CASCADE;
DROP TABLE IF EXISTS check_vouchers CASCADE;
DROP TABLE IF EXISTS apv_approval_logs CASCADE;
DROP TABLE IF EXISTS ewt_rate_options CASCADE;
DROP TABLE IF EXISTS chart_of_accounts CASCADE;

-- 2. Drop functions
DROP FUNCTION IF EXISTS release_check_voucher(uuid, text, text, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS release_check_voucher(uuid) CASCADE;
DROP FUNCTION IF EXISTS void_check_voucher(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS void_check_voucher(uuid) CASCADE;
DROP FUNCTION IF EXISTS try_close_po(uuid) CASCADE;
DROP FUNCTION IF EXISTS generate_cv_number() CASCADE;
DROP FUNCTION IF EXISTS generate_apv_number() CASCADE;
DROP FUNCTION IF EXISTS user_has_treasury_access(uuid) CASCADE;
DROP FUNCTION IF EXISTS user_has_apv_access(uuid) CASCADE;

-- 3. Revert additive columns on ap_vouchers (keep original schema intact)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ap_vouchers') THEN
    ALTER TABLE ap_vouchers
      DROP COLUMN IF EXISTS vendor_invoice_id,
      DROP COLUMN IF EXISTS purchase_order_id,
      DROP COLUMN IF EXISTS po_number,
      DROP COLUMN IF EXISTS invoice_number,
      DROP COLUMN IF EXISTS vendor_id,
      DROP COLUMN IF EXISTS vendor_name,
      DROP COLUMN IF EXISTS vendor_tin,
      DROP COLUMN IF EXISTS vendor_address,
      DROP COLUMN IF EXISTS company_id,
      DROP COLUMN IF EXISTS gl_account_code,
      DROP COLUMN IF EXISTS gl_account_name,
      DROP COLUMN IF EXISTS cost_center,
      DROP COLUMN IF EXISTS department,
      DROP COLUMN IF EXISTS expense_category,
      DROP COLUMN IF EXISTS invoice_amount,
      DROP COLUMN IF EXISTS vat_amount,
      DROP COLUMN IF EXISTS ewt_rate,
      DROP COLUMN IF EXISTS ewt_amount,
      DROP COLUMN IF EXISTS other_deductions,
      DROP COLUMN IF EXISTS other_deductions_description,
      DROP COLUMN IF EXISTS payment_terms,
      DROP COLUMN IF EXISTS current_approver_id,
      DROP COLUMN IF EXISTS current_approval_level,
      DROP COLUMN IF EXISTS approved_at,
      DROP COLUMN IF EXISTS rejected_at,
      DROP COLUMN IF EXISTS remarks,
      DROP COLUMN IF EXISTS updated_by,
      DROP COLUMN IF EXISTS deleted_at;
  END IF;
END $$;

-- 4. Remove permissions seeded for the module (role grants cascade)
DELETE FROM permissions WHERE name IN (
  'AP Voucher View',
  'AP Voucher Create',
  'AP Voucher Approve',
  'Check Voucher View',
  'Check Voucher Create',
  'Check Voucher Approve',
  'Check Voucher Release',
  'Payment Schedule View',
  'Payment Reports View',
  'PO Closure Manage'
);
