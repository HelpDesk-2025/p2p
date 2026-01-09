/*
  # Add RFP PDF path to Cash Advance Requests

  1. Changes
    - Add `rfp_pdf_path` column to store the RFP form PDF separately
    - This allows the MSBC posting function to merge RFP, approved form, and attachments
  
  2. Notes
    - This field stores the path to the RFP (Request for Payment) form in Supabase storage
    - The MSBC posting function expects this field to exist
*/

-- Add rfp_pdf_path field to cash_advance_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'rfp_pdf_path'
  ) THEN
    ALTER TABLE cash_advance_requests ADD COLUMN rfp_pdf_path text;
  END IF;
END $$;

-- Add comment explaining the field
COMMENT ON COLUMN cash_advance_requests.rfp_pdf_path IS 
'Path to the RFP (Request for Payment) form PDF in Supabase storage';