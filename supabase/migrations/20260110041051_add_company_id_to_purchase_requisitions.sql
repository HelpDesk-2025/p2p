/*
  # Add company_id to purchase_requisitions table

  1. Changes
    - Add company_id column to purchase_requisitions table
    - Add foreign key constraint to companies table
    - Add index for better query performance

  2. Security
    - No changes to RLS policies needed - existing policies will work with the new column
*/

-- Add company_id to purchase_requisitions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_requisitions' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE purchase_requisitions ADD COLUMN company_id uuid REFERENCES companies(id);
  END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_company_id ON purchase_requisitions(company_id);
