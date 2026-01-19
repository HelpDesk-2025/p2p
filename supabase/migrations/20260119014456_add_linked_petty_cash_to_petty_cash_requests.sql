/*
  # Add Linked Petty Cash Fields to Petty Cash Requests

  1. Changes
    - Add `linked_petty_cash_id` UUID column to reference the petty cash advance being liquidated
    - Add `petty_cash_advance` numeric column to store the amount of the linked petty cash advance
    - Add foreign key constraint to link to petty_cash_requests table
    
  2. Purpose
    - Used when request_type is 'For Liquidation' to track which petty cash advance is being liquidated
    - Stores the advance amount for calculation of net amount (over for reimbursement or excess for deposit)
    
  3. Security
    - No changes to RLS policies (existing policies remain)
*/

-- Add linked_petty_cash_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'linked_petty_cash_id'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN linked_petty_cash_id UUID REFERENCES petty_cash_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add petty_cash_advance column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'petty_cash_advance'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN petty_cash_advance NUMERIC(10, 2) DEFAULT NULL;
  END IF;
END $$;
