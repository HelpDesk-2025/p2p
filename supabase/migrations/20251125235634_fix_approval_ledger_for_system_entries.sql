/*
  # Fix Approval Ledger for System Entries

  1. Changes
    - Make `approver_id` nullable to support system-generated entries
    - Add 'Auto-Rejected' to allowed action values
    - Update RLS policies to allow system entries

  2. Notes
    - System entries will have null approver_id
    - These are created when a request is rejected and remaining approvers are auto-rejected
*/

-- Make approver_id nullable
ALTER TABLE approval_ledger 
  ALTER COLUMN approver_id DROP NOT NULL;

-- Drop existing constraint and recreate with Auto-Rejected
ALTER TABLE approval_ledger 
  DROP CONSTRAINT IF EXISTS approval_ledger_action_check;

ALTER TABLE approval_ledger
  ADD CONSTRAINT approval_ledger_action_check 
  CHECK (action IN ('Approved', 'Rejected', 'Returned', 'Submitted', 'Auto-Rejected'));

-- Update insert policy to allow null approver_id for system entries
DROP POLICY IF EXISTS "Authenticated users can insert approval ledger entries" ON approval_ledger;

CREATE POLICY "Authenticated users can insert approval ledger entries"
  ON approval_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (
    approver_id IS NULL OR
    approver_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'approver')
    )
  );