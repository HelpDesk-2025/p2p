/*
  # Add For Checking Flag to Approval Flows

  1. Changes to approval_flows table
    - Add `for_checking` column (boolean, default false)
      - Indicates if this approver is only for checking/review purposes
      - Users marked as "for checking" will not be included in PDF signatories
      - They still need to approve/reject but won't sign documents
  
  2. Purpose
    - Allow certain approval steps to be review-only without signing authority
    - Keep approval process intact while excluding from signature requirements
    - Useful for advisory or checking roles that don't need to formally sign
*/

-- Add for_checking column to approval_flows table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_flows' AND column_name = 'for_checking'
  ) THEN
    ALTER TABLE approval_flows ADD COLUMN for_checking boolean DEFAULT false;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN approval_flows.for_checking IS 'If true, this approver is for checking/review only and will not be included in PDF signatories';