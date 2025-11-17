/*
  # Add merged_pdf column to purchase_requisitions

  1. Changes
    - Add `merged_pdf` column to `purchase_requisitions` table
      - Type: text (stores base64-encoded PDF data)
      - Nullable: true (for backward compatibility with existing records)

  2. Purpose
    - Store a single merged PDF file containing all checklist attachments
    - Simplifies attachment viewing and downloading for approvers
    - Consolidates multiple PDFs and images into one document
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_requisitions' AND column_name = 'merged_pdf'
  ) THEN
    ALTER TABLE purchase_requisitions ADD COLUMN merged_pdf text;
  END IF;
END $$;
