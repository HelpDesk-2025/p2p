/*
  # Add Cash Advance to Request Type Constraint

  1. Changes
    - Drop existing check constraint on `approval_flow_setups.request_type`
    - Add new check constraint that includes 'Cash Advance' as a valid request type
    
  2. Updated Valid Request Types
    - 'Purchase Requisition'
    - 'Canvass'
    - 'Petty Cash'
    - 'Reimbursement'
    - 'Cash Advance' (newly added)

  3. Important Notes
    - This allows approval flow setups to be created for Cash Advance requests
    - Existing setups for other request types are not affected
*/

-- Drop the existing constraint
ALTER TABLE approval_flow_setups
DROP CONSTRAINT IF EXISTS approval_flow_setups_request_type_check;

-- Add new constraint that includes Cash Advance
ALTER TABLE approval_flow_setups
ADD CONSTRAINT approval_flow_setups_request_type_check
CHECK (request_type IN ('Purchase Requisition', 'Canvass', 'Petty Cash', 'Reimbursement', 'Cash Advance'));
