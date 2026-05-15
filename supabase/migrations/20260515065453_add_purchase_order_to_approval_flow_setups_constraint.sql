/*
  # Add Purchase Order to approval_flow_setups request_type constraint

  1. Changes
    - Drop existing request_type check constraint
    - Re-create it with "Purchase Order" added to the allowed values

  2. Notes
    - This allows creating approval flow setups for Purchase Order request type
*/

ALTER TABLE approval_flow_setups DROP CONSTRAINT IF EXISTS approval_flow_setups_request_type_check;

ALTER TABLE approval_flow_setups ADD CONSTRAINT approval_flow_setups_request_type_check
  CHECK (request_type = ANY (ARRAY['Purchase Requisition'::text, 'Canvass'::text, 'Purchase Order'::text, 'Petty Cash'::text, 'Reimbursement'::text, 'Cash Advance'::text, 'Liquidation'::text]));
