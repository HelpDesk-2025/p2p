/*
  # Add No. of Pax to Petty Cash Requests

  1. Changes
    - Add `no_of_pax` column to `petty_cash_requests` table
      - Integer field to track number of people
      - Optional field (can be NULL)
      
  2. Purpose
    - Track the number of people associated with petty cash expenses
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'no_of_pax'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN no_of_pax INTEGER;
  END IF;
END $$;
