/*
  # Add MSBC Invoice ID to Canvass Requests

  1. Changes
    - Add `msbc_invoice_id` column to `canvass_requests` table to store the invoice ID returned from MSBC API
  
  2. Purpose
    - Track which MSBC invoice corresponds to each canvass request
    - Enable lookup and reference of MSBC invoices from canvass records
*/

-- Add msbc_invoice_id column to canvass_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvass_requests' AND column_name = 'msbc_invoice_id'
  ) THEN
    ALTER TABLE canvass_requests 
    ADD COLUMN msbc_invoice_id text;
    
    COMMENT ON COLUMN canvass_requests.msbc_invoice_id IS 'Purchase invoice ID returned from MSBC API after successful posting';
  END IF;
END $$;