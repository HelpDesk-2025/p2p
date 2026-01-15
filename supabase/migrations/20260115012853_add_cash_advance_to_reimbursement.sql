/*
  # Add Cash Advance field to Reimbursement Requests

  1. Changes
    - Add `cash_advance` column to `reimbursement_requests` table to track cash advance deductions
    - This allows users to calculate net reimbursement: Total Expenditures - Cash Advance
    
  2. Default Value
    - Default to 0 for existing records
    
  3. Security
    - No changes to RLS policies (existing policies remain)
*/

-- Add cash_advance column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'cash_advance'
  ) THEN
    ALTER TABLE reimbursement_requests ADD COLUMN cash_advance numeric(15,2) DEFAULT 0;
  END IF;
END $$;
