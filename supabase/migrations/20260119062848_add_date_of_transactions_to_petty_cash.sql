/*
  # Add Date of Transactions to Petty Cash Requests

  1. Changes
    - Add `date_of_transactions` column to `petty_cash_requests` table
      - Type: date
      - Nullable: true (optional field)
      
  2. Purpose
    - Allow users to specify the date of transactions when creating petty cash requests
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'date_of_transactions'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN date_of_transactions date;
  END IF;
END $$;