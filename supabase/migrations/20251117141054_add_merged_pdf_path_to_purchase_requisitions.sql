/*
  # Add merged_pdf_path to Purchase Requisitions

  1. Changes
    - Add merged_pdf_path column to store the path of the merged PDF in storage
    - This replaces the base64 merged_pdf approach with storage-based approach
  
  2. Benefits
    - Much better performance for large PDFs
    - No more stack overflow errors
    - Support for files up to 50MB
*/

-- Add merged_pdf_path column
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS merged_pdf_path text;

-- Add comment
COMMENT ON COLUMN purchase_requisitions.merged_pdf_path IS 
'Path to merged PDF in Supabase Storage (attachments bucket)';