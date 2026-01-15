/*
  # Remove payment mode from reimbursement requests

  1. Changes
    - Drop `payment_mode_id` column from `reimbursement_requests` table
    
  2. Reason
    - Payment mode is not needed for reimbursement/liquidation requests
    - Simplifies the reimbursement request form and data model
*/

-- Remove payment_mode_id column from reimbursement_requests
ALTER TABLE reimbursement_requests 
DROP COLUMN IF EXISTS payment_mode_id;

-- Drop the index if it exists
DROP INDEX IF EXISTS idx_reimbursement_requests_payment_mode_id;
