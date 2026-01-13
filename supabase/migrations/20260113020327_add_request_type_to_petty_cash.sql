/*
  # Add request type to petty cash requests

  1. Changes
    - Add `request_type` column to `petty_cash_requests` table
    - Values: 'For Cash Advance' or 'For Reimbursement/Liquidation'
    - Default value: 'For Cash Advance'

  2. Notes
    - This helps categorize petty cash requests based on their purpose
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'request_type'
  ) THEN
    ALTER TABLE petty_cash_requests 
    ADD COLUMN request_type text DEFAULT 'For Cash Advance' 
    CHECK (request_type IN ('For Cash Advance', 'For Reimbursement/Liquidation'));
  END IF;
END $$;