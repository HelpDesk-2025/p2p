/*
  # Fix document number unique constraint for multi-company support
  
  1. Changes
    - Drop global unique constraint on `document_no` in `purchase_requisitions`
    - Add composite unique constraint on (`company_id`, `document_no`)
    - This allows different companies to use the same document numbers
  
  2. Security
    - No security changes needed
    - Existing RLS policies remain in effect
*/

-- Drop the global unique constraint on document_no
ALTER TABLE purchase_requisitions 
DROP CONSTRAINT IF EXISTS purchase_requisitions_document_no_key;

-- Add composite unique constraint for company_id + document_no
ALTER TABLE purchase_requisitions 
ADD CONSTRAINT purchase_requisitions_company_document_no_key 
UNIQUE (company_id, document_no);
