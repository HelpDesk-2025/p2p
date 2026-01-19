/*
  # Revert No. of Pax from Petty Cash

  1. Changes
    - Remove `no_of_pax` column from `petty_cash_requests` table
      
  2. Purpose
    - Reverting the no. of pax feature
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'no_of_pax'
  ) THEN
    ALTER TABLE petty_cash_requests DROP COLUMN no_of_pax;
  END IF;
END $$;
