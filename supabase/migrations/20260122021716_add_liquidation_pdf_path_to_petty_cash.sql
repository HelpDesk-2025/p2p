/*
  # Add Liquidation PDF Path to Petty Cash Requests

  1. Changes
    - Add `liquidation_pdf_path` column to `petty_cash_requests` table
    - This column stores the storage path to the generated liquidation report PDF
    - Only applicable for petty cash requests with request_type = 'For Liquidation'

  2. Notes
    - The liquidation PDF is generated when a 'For Liquidation' petty cash request is fully approved
    - This PDF contains expense details, amounts, and approval signatures
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'liquidation_pdf_path'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN liquidation_pdf_path text;
  END IF;
END $$;
