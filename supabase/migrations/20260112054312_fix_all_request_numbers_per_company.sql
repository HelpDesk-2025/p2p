/*
  # Fix all request number unique constraints for multi-company support
  
  1. Changes
    - Update all request tables to use composite unique constraints
    - Drop global unique constraints on request numbers
    - Add composite unique constraints on (company_id, request_number)
    - This allows different companies to use the same request numbers independently
  
  2. Tables Updated
    - purchase_requisitions: pr_number → (company_id, pr_number)
    - canvass_requests: canvass_number → (company_id, canvass_number)
    - cash_advance_requests: ca_number → (company_id, ca_number)
    - petty_cash_requests: pc_number → (company_id, pc_number)
    - reimbursement_requests: reimb_number → (company_id, reimb_number)
  
  3. Security
    - No security changes needed
    - Existing RLS policies remain in effect
*/

-- Purchase Requisitions: pr_number
ALTER TABLE purchase_requisitions 
DROP CONSTRAINT IF EXISTS purchase_requisitions_pr_number_key;

ALTER TABLE purchase_requisitions 
ADD CONSTRAINT purchase_requisitions_company_pr_number_key 
UNIQUE (company_id, pr_number);

-- Canvass Requests: canvass_number
ALTER TABLE canvass_requests 
DROP CONSTRAINT IF EXISTS canvass_requests_canvass_number_key;

ALTER TABLE canvass_requests 
ADD CONSTRAINT canvass_requests_company_canvass_number_key 
UNIQUE (company_id, canvass_number);

-- Cash Advance Requests: ca_number
ALTER TABLE cash_advance_requests 
DROP CONSTRAINT IF EXISTS cash_advance_requests_ca_number_key;

ALTER TABLE cash_advance_requests 
ADD CONSTRAINT cash_advance_requests_company_ca_number_key 
UNIQUE (company_id, ca_number);

-- Petty Cash Requests: pc_number
ALTER TABLE petty_cash_requests 
DROP CONSTRAINT IF EXISTS petty_cash_requests_pc_number_key;

ALTER TABLE petty_cash_requests 
ADD CONSTRAINT petty_cash_requests_company_pc_number_key 
UNIQUE (company_id, pc_number);

-- Reimbursement Requests: reimb_number
ALTER TABLE reimbursement_requests 
DROP CONSTRAINT IF EXISTS reimbursement_requests_reimb_number_key;

ALTER TABLE reimbursement_requests 
ADD CONSTRAINT reimbursement_requests_company_reimb_number_key 
UNIQUE (company_id, reimb_number);
