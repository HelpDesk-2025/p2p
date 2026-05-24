/*
  # Add company_id to approval_ledger

  1. Changes
    - Add `company_id` (uuid) column to `approval_ledger` table
    - Backfill company_id from associated request tables (purchase_requisitions, canvass_requests, petty_cash_requests, reimbursement_requests, cash_advance_requests, purchase_orders)
    - Add index on company_id for fast filtering

  2. Notes
    - This enables filtering approval ledger entries by company
    - Existing entries are backfilled from their linked request's company_id
*/

-- Add company_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_ledger' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE approval_ledger ADD COLUMN company_id uuid;
  END IF;
END $$;

-- Backfill from purchase_requisitions
UPDATE approval_ledger al
SET company_id = pr.company_id
FROM purchase_requisitions pr
WHERE al.request_id = pr.id
  AND al.request_type = 'Purchase Requisition'
  AND al.company_id IS NULL;

-- Backfill from canvass_requests
UPDATE approval_ledger al
SET company_id = cr.company_id
FROM canvass_requests cr
WHERE al.request_id = cr.id
  AND al.request_type = 'Canvass'
  AND al.company_id IS NULL;

-- Backfill from petty_cash_requests
UPDATE approval_ledger al
SET company_id = pcr.company_id
FROM petty_cash_requests pcr
WHERE al.request_id = pcr.id
  AND al.request_type = 'Petty Cash'
  AND al.company_id IS NULL;

-- Backfill from reimbursement_requests
UPDATE approval_ledger al
SET company_id = rr.company_id
FROM reimbursement_requests rr
WHERE al.request_id = rr.id
  AND al.request_type = 'Reimbursement'
  AND al.company_id IS NULL;

-- Backfill from cash_advance_requests
UPDATE approval_ledger al
SET company_id = car.company_id
FROM cash_advance_requests car
WHERE al.request_id = car.id
  AND al.request_type = 'Cash Advance'
  AND al.company_id IS NULL;

-- Backfill from purchase_orders
UPDATE approval_ledger al
SET company_id = po.company_id
FROM purchase_orders po
WHERE al.request_id = po.id
  AND al.request_type = 'Purchase Order'
  AND al.company_id IS NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_approval_ledger_company_id
  ON approval_ledger(company_id);
