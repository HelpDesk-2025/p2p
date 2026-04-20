/*
  # Add request_type column to cash_advance_requests

  1. Modified Tables
    - `cash_advance_requests`
      - `request_type` (text) - Stores the type of cash advance request: 'EOS' or 'OTHERS'
      - Defaults to 'OTHERS' for backward compatibility with existing records

  2. Important Notes
    - EOS requests have specific purpose checkboxes and no attachment uploads
    - OTHERS requests follow the existing flow with attachment uploads
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'request_type'
  ) THEN
    ALTER TABLE cash_advance_requests ADD COLUMN request_type text DEFAULT 'OTHERS';
  END IF;
END $$;
