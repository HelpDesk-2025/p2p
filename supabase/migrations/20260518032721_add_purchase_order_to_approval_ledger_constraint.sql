/*
  # Add 'Purchase Order' to approval_ledger request_type constraint

  ## Summary
  The approval_ledger table had a CHECK constraint limiting request_type to only
  5 values. This migration adds 'Purchase Order' as a valid request_type so that
  PO approvals can use the standard approval ledger system.

  ## Changes
  1. Drop existing request_type check constraint
  2. Re-create it with 'Purchase Order' included

  ## Security
  - No RLS changes
  - Constraint-only modification
*/

ALTER TABLE approval_ledger DROP CONSTRAINT IF EXISTS approval_ledger_request_type_check;

ALTER TABLE approval_ledger ADD CONSTRAINT approval_ledger_request_type_check
  CHECK (request_type = ANY (ARRAY[
    'Purchase Requisition'::text,
    'Canvass'::text,
    'Petty Cash'::text,
    'Reimbursement'::text,
    'Cash Advance'::text,
    'Purchase Order'::text
  ]));