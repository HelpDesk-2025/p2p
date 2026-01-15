/*
  # Add Expense Itemization to Reimbursement Requests

  1. Changes
    - Add `expense_items` JSONB column to store itemized expenses with date, description, and amount
    - Drop `expense_date` column (replaced by individual expense item dates)
    - Rename `receipts` column to `attachments` for clarity
    - Add `total_expenditures` computed from expense_items (stored as amount)
    
  2. Structure
    - expense_items will be an array of objects: [{date: 'YYYY-MM-DD', description: 'text', amount: number}]
    - attachments will store file paths and metadata: [{name: 'filename', path: 'storage/path', type: 'image/pdf'}]
    
  3. Security
    - No changes to RLS policies (existing policies remain)
*/

-- Add expense_items column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'expense_items'
  ) THEN
    ALTER TABLE reimbursement_requests ADD COLUMN expense_items JSONB DEFAULT '[]';
  END IF;
END $$;

-- Drop expense_date column if it exists (no longer needed with itemized expenses)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'expense_date'
  ) THEN
    ALTER TABLE reimbursement_requests DROP COLUMN expense_date;
  END IF;
END $$;

-- Rename receipts column to attachments for clarity
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'receipts'
  ) THEN
    ALTER TABLE reimbursement_requests RENAME COLUMN receipts TO attachments;
  END IF;
END $$;