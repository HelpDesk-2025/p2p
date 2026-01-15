/*
  # Fix Reimbursement Linked Request Foreign Key Constraint

  1. Changes
    - Drop foreign key constraint on `linked_cash_advance_id` to allow linking to either cash_advance_requests or petty_cash_requests
    - Add `cash_advance_type` column to track which table is referenced ('Cash Advance' or 'Petty Cash')
    - This allows liquidation of both Cash Advance and Petty Cash requests
    
  2. Reason
    - The foreign key constraint only pointed to cash_advance_requests table
    - Users need to liquidate both Cash Advance and Petty Cash requests
    - Using a type column allows application-level validation while maintaining flexibility
    
  3. Security
    - No changes to RLS policies (existing policies remain)
*/

-- Drop the foreign key constraint on linked_cash_advance_id
ALTER TABLE reimbursement_requests 
DROP CONSTRAINT IF EXISTS reimbursement_requests_linked_cash_advance_id_fkey;

-- Add cash_advance_type column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'cash_advance_type'
  ) THEN
    ALTER TABLE reimbursement_requests 
    ADD COLUMN cash_advance_type text CHECK (cash_advance_type IN ('Cash Advance', 'Petty Cash'));
  END IF;
END $$;
