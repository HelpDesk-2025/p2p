/*
  # Add 'returned_to_maker' status to purchase_requisitions

  1. Modified Tables
    - `purchase_requisitions`
      - Adds 'returned_to_maker' as a valid status value
      - This status is used when a checker/validator returns a request
        back to the original requester for revision and resubmission

  2. Important Notes
    - The existing CHECK constraint on the status column is dropped and recreated
    - No data is modified; this only adds a new allowed value
    - The approval_ledger table already supports the 'Returned' action
*/

DO $$
BEGIN
  -- Drop the existing check constraint on status
  ALTER TABLE purchase_requisitions DROP CONSTRAINT IF EXISTS purchase_requisitions_status_check;

  -- Add the new constraint with 'returned_to_maker' included
  ALTER TABLE purchase_requisitions ADD CONSTRAINT purchase_requisitions_status_check
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'in_procurement', 'completed', 'returned_to_maker'));
END $$;
