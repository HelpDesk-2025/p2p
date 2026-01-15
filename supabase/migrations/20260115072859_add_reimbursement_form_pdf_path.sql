/*
  # Add Reimbursement Form PDF Path to Reimbursement Requests

  1. Changes
    - Add `reimbursement_form_pdf_path` column to `reimbursement_requests` table to store the path to the generated approved reimbursement/liquidation form PDF

  2. Purpose
    - When a reimbursement/liquidation request is fully approved, a PDF form will be generated and stored
    - This PDF includes all request details, expense itemization, and all signatory information
    - Users can preview and download this form from the request details view

  3. Security
    - No RLS policy changes needed (existing policies cover this column)
*/

-- Add reimbursement_form_pdf_path column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'reimbursement_form_pdf_path'
  ) THEN
    ALTER TABLE reimbursement_requests ADD COLUMN reimbursement_form_pdf_path TEXT;
  END IF;
END $$;
