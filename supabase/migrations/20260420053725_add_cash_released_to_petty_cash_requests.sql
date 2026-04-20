/*
  # Add Cash Released Gate to Petty Cash Requests

  1. Modified Tables
    - `petty_cash_requests`
      - `cash_released` (boolean, default false) - gate flag for cash advance release
      - `cash_released_at` (timestamptz) - when cash was released
      - `cash_released_by` (uuid) - who released the cash

  2. Notes
    - The cash_released flag acts as a gate between approval and requester acknowledgement
    - Only after cash_released = true can the requester click "Receive Cash"
    - cash_released_at and cash_released_by provide audit trail
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'cash_released'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN cash_released boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'cash_released_at'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN cash_released_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'cash_released_by'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN cash_released_by uuid REFERENCES auth.users(id);
  END IF;
END $$;