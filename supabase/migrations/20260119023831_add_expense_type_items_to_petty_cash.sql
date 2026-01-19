/*
  # Add Expense Type Items to Petty Cash Requests

  1. Changes
    - Add `expense_type_items` column to `petty_cash_requests` table
      - JSONB array storing expense type selections with sub-items
      - Each item has: { expense_type_id, expense_type_name, sub_item_name, amount }
      
  2. Purpose
    - Allows categorizing petty cash expenses by type
    - Each expense type can have multiple sub-items with individual amounts
    - Example: Travel Expense -> Airfare: 1000, Hotel: 2000, Meals: 500
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'expense_type_items'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN expense_type_items JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;
