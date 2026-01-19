/*
  # Revert Expense Type Items from Petty Cash

  1. Changes
    - Remove `expense_type_items` column from `petty_cash_requests` table
      
  2. Purpose
    - Reverting the expense type items feature
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'expense_type_items'
  ) THEN
    ALTER TABLE petty_cash_requests DROP COLUMN expense_type_items;
  END IF;
END $$;
