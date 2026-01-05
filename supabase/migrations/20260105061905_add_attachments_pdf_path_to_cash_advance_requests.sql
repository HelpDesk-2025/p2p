/*
  # Add Attachments PDF Path to Cash Advance Requests

  1. Changes
    - Add `attachments_pdf_path` column to `cash_advance_requests` table
      - Stores the path to the merged PDF of all attachments (images converted to PDF and merged with other PDFs)
      - Nullable field as attachments are optional

  2. Notes
    - This field will store the Supabase storage path to the merged attachments PDF
    - Images will be converted to PDF before merging
    - All attachments will be merged into a single PDF for easy viewing and downloading
*/

-- Add attachments_pdf_path column to cash_advance_requests table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'attachments_pdf_path'
  ) THEN
    ALTER TABLE cash_advance_requests ADD COLUMN attachments_pdf_path text;
  END IF;
END $$;