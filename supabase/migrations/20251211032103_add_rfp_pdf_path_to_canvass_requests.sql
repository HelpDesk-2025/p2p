/*
  # Add RFP PDF Path to Canvass Requests

  1. Changes
    - Add `rfp_pdf_path` column to `canvass_requests` table
    - This will store the path to the generated RFP PDF after canvass approval
    - Add `is_budgeted` column to store budgeted status from the linked PR
*/

-- Add rfp_pdf_path column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvass_requests' AND column_name = 'rfp_pdf_path'
  ) THEN
    ALTER TABLE canvass_requests ADD COLUMN rfp_pdf_path text;
  END IF;
END $$;

-- Add is_budgeted column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvass_requests' AND column_name = 'is_budgeted'
  ) THEN
    ALTER TABLE canvass_requests ADD COLUMN is_budgeted boolean;
  END IF;
END $$;
