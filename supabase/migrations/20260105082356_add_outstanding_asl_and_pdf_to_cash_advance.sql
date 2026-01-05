/*
  # Add Outstanding ASL and Approved PDF to Cash Advance Requests

  1. Changes
    - Add `outstanding_asl` (text, nullable) to `cash_advance_requests`
      - Can be an amount or text, input by the last approver
    - Add `remarks` (text, nullable) to `cash_advance_requests`
      - Remarks input by the last approver (Accounting)
    - Add `approved_ca_pdf_path` (text, nullable) to `cash_advance_requests`
      - Path to the generated approved cash advance form PDF
  
  2. Purpose
    - Support generation of approved cash advance form PDF
    - Capture Outstanding ASL and remarks from the last approver
*/

-- Add outstanding_asl field for accounting to fill out
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'outstanding_asl'
  ) THEN
    ALTER TABLE cash_advance_requests ADD COLUMN outstanding_asl text;
  END IF;
END $$;

-- Add remarks field for accounting to fill out
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'remarks'
  ) THEN
    ALTER TABLE cash_advance_requests ADD COLUMN remarks text;
  END IF;
END $$;

-- Add approved_ca_pdf_path field to store generated PDF
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'approved_ca_pdf_path'
  ) THEN
    ALTER TABLE cash_advance_requests ADD COLUMN approved_ca_pdf_path text;
  END IF;
END $$;