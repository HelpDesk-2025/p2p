/*
  # Add maximum petty cash reimbursement to companies

  1. Schema changes
    - Add `max_petty_cash_reimbursement` (numeric) to `companies` with a
      default of 5000. This is the maximum amount allowed when a petty cash
      request has request_type = 'For Reimbursement'.

  2. Notes
    - Column is added only if missing.
    - Existing rows are backfilled with the default 5000 value.
    - No RLS changes; companies already has its policies.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'max_petty_cash_reimbursement'
  ) THEN
    ALTER TABLE companies
      ADD COLUMN max_petty_cash_reimbursement numeric NOT NULL DEFAULT 5000;
  END IF;
END $$;

UPDATE companies
SET max_petty_cash_reimbursement = 5000
WHERE max_petty_cash_reimbursement IS NULL;
