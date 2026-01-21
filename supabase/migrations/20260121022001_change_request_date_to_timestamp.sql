/*
  # Change request_date from date to timestamptz

  1. Changes
    - Alter `request_date` column type from `date` to `timestamp with time zone` in all request tables:
      - purchase_requisitions
      - canvass_requests
      - petty_cash_requests
      - cash_advance_requests
      - reimbursement_requests
    - This allows storing both date AND time of submission
    - Existing date-only values will be preserved (with time defaulting to midnight UTC)

  2. Impact
    - No data loss - dates are preserved
    - Future requests will store full timestamp including time
    - UI will display accurate submission times
*/

-- Convert request_date from date to timestamptz for all request tables
ALTER TABLE purchase_requisitions 
  ALTER COLUMN request_date TYPE timestamptz USING request_date::timestamptz;

ALTER TABLE canvass_requests 
  ALTER COLUMN request_date TYPE timestamptz USING request_date::timestamptz;

ALTER TABLE petty_cash_requests 
  ALTER COLUMN request_date TYPE timestamptz USING request_date::timestamptz;

ALTER TABLE cash_advance_requests 
  ALTER COLUMN request_date TYPE timestamptz USING request_date::timestamptz;

ALTER TABLE reimbursement_requests 
  ALTER COLUMN request_date TYPE timestamptz USING request_date::timestamptz;