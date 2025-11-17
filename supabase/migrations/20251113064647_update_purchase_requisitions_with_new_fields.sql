/*
  # Update Purchase Requisitions with New Fields

  1. Changes
    - Add document_no column (text) for auto-incremented PR number (PR000000001 format)
    - Add description column (text) for PR description
    - Rename purpose column if needed (already exists)
    - Add date_required column (date) for required/needed date
    - Add is_budgeted column (boolean) for budgeted/non-budgeted flag
    - Add purchase_type column (text) for Purchase Order or Non-Purchase Order
    - Add pr_checklist_id column (uuid, nullable) foreign key to pr_checklists
    - Add checklist_items column (jsonb) to store selected checklist items with values
    - Add payee column (text) for Non-Purchase Order payee
    - Add amount_net_vat column (numeric) for amount net of VAT
    - Add payment_mode_id column (uuid, nullable) foreign key to payment_modes
    - Add payment_mode_lines column (jsonb) to store payment mode line values

  2. Notes
    - Existing items field will be conditionally used based on purchase_type
    - All new fields are nullable to maintain compatibility with existing data
*/

-- Add document_no column with unique constraint
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS document_no text UNIQUE;

-- Add description column
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS description text;

-- Add date_required column (date_required instead of required_date for clarity)
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS date_required date;

-- Add is_budgeted column with default false
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS is_budgeted boolean DEFAULT false;

-- Add purchase_type column with constraint
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS purchase_type text CHECK (purchase_type IN ('Purchase Order', 'Non-Purchase Order'));

-- Add pr_checklist_id as foreign key
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS pr_checklist_id uuid REFERENCES pr_checklists(id);

-- Add checklist_items jsonb column
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS checklist_items jsonb DEFAULT '[]'::jsonb;

-- Add payee column for Non-Purchase Order
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS payee text;

-- Add amount_net_vat column
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS amount_net_vat numeric(12,2);

-- Add payment_mode_id as foreign key
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS payment_mode_id uuid REFERENCES payment_modes(id);

-- Add payment_mode_lines jsonb column
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS payment_mode_lines jsonb DEFAULT '[]'::jsonb;

-- Create function to generate next document number
CREATE OR REPLACE FUNCTION generate_pr_document_no()
RETURNS text AS $$
DECLARE
  next_num integer;
  doc_no text;
BEGIN
  -- Get the highest number from existing document_no values
  SELECT COALESCE(MAX(CAST(SUBSTRING(document_no FROM 3) AS integer)), 0) + 1
  INTO next_num
  FROM purchase_requisitions
  WHERE document_no ~ '^PR[0-9]{9}$';
  
  -- Format as PR000000001
  doc_no := 'PR' || LPAD(next_num::text, 9, '0');
  
  RETURN doc_no;
END;
$$ LANGUAGE plpgsql;

-- Create index on document_no for performance
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_document_no 
ON purchase_requisitions(document_no);
