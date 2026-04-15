/*
  # Add Petty Cash and Cash Advance Limits to Companies

  1. Modified Tables
    - `companies`
      - `max_petty_cash_advance` (numeric, default 3000) - Maximum amount for petty cash advance requests
      - `min_cash_advance` (numeric, default 3001) - Minimum amount for cash advance requests

  2. Important Notes
    - These fields help enforce amount thresholds per company
    - Default values: max_petty_cash_advance = 3000, min_cash_advance = 3001
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'max_petty_cash_advance'
  ) THEN
    ALTER TABLE companies ADD COLUMN max_petty_cash_advance numeric DEFAULT 3000 NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'min_cash_advance'
  ) THEN
    ALTER TABLE companies ADD COLUMN min_cash_advance numeric DEFAULT 3001 NOT NULL;
  END IF;
END $$;
