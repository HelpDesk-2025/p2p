/*
  # Add Liquidation to Approval Flow Setups

  ## Summary
  Allow creating Approval Flow Setups for the 'Liquidation' request type by
  relaxing the request_type check constraint on approval_flow_setups.

  ## Changes
  1. approval_flow_setups: CHECK constraint expanded to include 'Liquidation'.
*/

ALTER TABLE approval_flow_setups DROP CONSTRAINT IF EXISTS approval_flow_setups_request_type_check;

ALTER TABLE approval_flow_setups
  ADD CONSTRAINT approval_flow_setups_request_type_check
  CHECK (request_type IN ('Purchase Requisition', 'Canvass', 'Petty Cash', 'Reimbursement', 'Cash Advance', 'Liquidation'));
