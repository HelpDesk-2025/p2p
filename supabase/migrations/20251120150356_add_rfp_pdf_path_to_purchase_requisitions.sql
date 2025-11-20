/*
  # Add RFP PDF path to purchase requisitions

  1. Changes
    - Add rfp_pdf_path column to purchase_requisitions table to store generated RFP PDF file path
    
  2. Security
    - No RLS changes needed
*/

ALTER TABLE purchase_requisitions 
  ADD COLUMN IF NOT EXISTS rfp_pdf_path TEXT;
