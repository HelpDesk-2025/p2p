/*
  # Add Merged PDF Path to Reimbursement Requests

  1. Changes
    - Add `merged_pdf_path` column to `reimbursement_requests` table
    - This column will store the path to the merged PDF containing all attachments
    - The merged PDF includes all image and PDF attachments converted and combined into a single document
    
  2. Purpose
    - Allows approvers to view all reimbursement attachments in a single consolidated PDF
    - Images are automatically converted to PDF pages during the merge process
    
  3. Security
    - No changes to RLS policies (existing policies remain)
*/

-- Add merged_pdf_path column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'merged_pdf_path'
  ) THEN
    ALTER TABLE reimbursement_requests ADD COLUMN merged_pdf_path text;
  END IF;
END $$;