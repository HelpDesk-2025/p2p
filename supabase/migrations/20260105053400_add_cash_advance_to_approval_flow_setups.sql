/*
  # Add Cash Advance to Approval Flow Setups Request Type Constraint

  1. Changes
    - Update the check constraint on `approval_flow_setups` table to include 'Cash Advance'
    - This allows creating approval flow setups for Cash Advance requests

  2. Important Notes
    - Cash Advance requests will use workflow type 1 (Unbudgeted) by default
    - This enables the approval flow setup to work with Cash Advance request type
*/

-- Drop the existing constraint
ALTER TABLE approval_flow_setups DROP CONSTRAINT IF EXISTS approval_flow_setups_request_type_check;

-- Add the updated constraint with Cash Advance included
ALTER TABLE approval_flow_setups
ADD CONSTRAINT approval_flow_setups_request_type_check
CHECK (request_type IN ('Purchase Requisition', 'Canvass', 'Petty Cash', 'Reimbursement', 'Cash Advance'));