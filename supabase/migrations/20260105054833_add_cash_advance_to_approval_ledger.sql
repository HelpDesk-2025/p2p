/*
  # Add Cash Advance to Approval Ledger

  1. Changes
    - Update request_type check constraint to include 'Cash Advance'
    - Update SELECT policy to include cash_advance_requests
  
  2. Security
    - Maintains existing RLS policies
    - Ensures users can view approval ledger for their cash advance requests
*/

-- Drop the existing constraint
ALTER TABLE approval_ledger 
DROP CONSTRAINT IF EXISTS approval_ledger_request_type_check;

-- Add the new constraint with Cash Advance included
ALTER TABLE approval_ledger 
ADD CONSTRAINT approval_ledger_request_type_check 
CHECK (request_type IN ('Purchase Requisition', 'Canvass', 'Petty Cash', 'Reimbursement', 'Cash Advance'));

-- Drop and recreate the policy to include cash_advance_requests
DROP POLICY IF EXISTS "Users can view approval ledger for own requests" ON approval_ledger;

CREATE POLICY "Users can view approval ledger for own requests"
  ON approval_ledger
  FOR SELECT
  TO authenticated
  USING (
    request_id IN (
      SELECT id FROM purchase_requisitions WHERE requester_id = auth.uid()
      UNION
      SELECT id FROM canvass_requests WHERE requester_id = auth.uid()
      UNION
      SELECT id FROM petty_cash_requests WHERE requester_id = auth.uid()
      UNION
      SELECT id FROM reimbursement_requests WHERE requester_id = auth.uid()
      UNION
      SELECT id FROM cash_advance_requests WHERE requester_id = auth.uid()
    )
  );
