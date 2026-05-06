/*
  # Add expense_category to petty_cash_requests

  1. Changes
    - Adds `expense_category` (text) column to `petty_cash_requests`
      - Allowed values: 'Department Expense', 'ManCom Expense'
      - Defaults to 'Department Expense'
    - Used to drive which approval workflow is selected for Petty Cash:
      - 'Department Expense' -> workflow_type 1
      - 'ManCom Expense'     -> workflow_type 2

  2. Notes
    - Existing rows are backfilled to 'Department Expense'
    - Non-destructive; no existing data is removed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'expense_category'
  ) THEN
    ALTER TABLE petty_cash_requests
      ADD COLUMN expense_category text NOT NULL DEFAULT 'Department Expense';
  END IF;
END $$;
