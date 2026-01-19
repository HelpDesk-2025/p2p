/*
  # Fix Petty Cash Request Type Constraint
  
  1. Changes
    - Drop and recreate the check constraint on `petty_cash_requests.request_type`
    - Update allowed values to match the UI options:
      - 'For Cash Advance'
      - 'For Reimbursement'
      - 'For Liquidation'
      
  2. Notes
    - The UI presents three distinct options but the constraint only allowed two values
    - This fixes the constraint violation error when submitting petty cash requests
*/

-- Drop the existing constraint
ALTER TABLE petty_cash_requests
DROP CONSTRAINT IF EXISTS petty_cash_requests_request_type_check;

-- Add the updated constraint with all three request types
ALTER TABLE petty_cash_requests
ADD CONSTRAINT petty_cash_requests_request_type_check
CHECK (request_type IN ('For Cash Advance', 'For Reimbursement', 'For Liquidation'));
