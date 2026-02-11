/*
  # Add Unique Constraint to Approval Ledger

  1. Changes
    - Add unique constraint to prevent duplicate approval entries
    - Ensures one approval entry per request + approver + sequence + action
    - Clean up any existing duplicates before adding constraint

  2. Security
    - Prevents data integrity issues
    - Ensures RFP generation works correctly
    - Prevents MSBC posting failures due to duplicate approvals
*/

-- First, let's identify and clean up any existing duplicates
-- Keep only the latest entry for each unique combination
DELETE FROM approval_ledger
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY request_id, approver_id, sequence, action 
        ORDER BY approval_date DESC, created_at DESC
      ) as rn
    FROM approval_ledger
    WHERE approver_id IS NOT NULL
  ) t
  WHERE rn > 1
);

-- Add unique constraint to prevent future duplicates
-- This ensures one approval entry per request + approver + sequence + action
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_ledger_unique_approval
ON approval_ledger (request_id, approver_id, sequence, action)
WHERE approver_id IS NOT NULL AND action IN ('Approved', 'Rejected');

-- Add comment explaining the constraint
COMMENT ON INDEX idx_approval_ledger_unique_approval IS 'Ensures only one approval/rejection entry per request + approver + sequence combination. Prevents duplicate approvals that can cause RFP generation and MSBC posting failures.';
