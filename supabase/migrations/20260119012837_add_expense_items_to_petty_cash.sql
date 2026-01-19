/*
  # Add Expense Itemization to Petty Cash Requests

  1. Changes
    - Add `expense_items` JSONB column to petty_cash_requests table
    - This will store itemized expenses for "For Liquidation" type petty cash requests
    
  2. Structure
    - expense_items will be an array of objects: [{date: 'YYYY-MM-DD', description: 'text', amount: number}]
    - Only used when request_type is 'For Liquidation'
    - Total expenditures will be calculated from expense_items and stored in the amount column
    
  3. Security
    - No changes to RLS policies (existing policies remain)
*/

-- Add expense_items column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'expense_items'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN expense_items JSONB DEFAULT NULL;
  END IF;
END $$;
