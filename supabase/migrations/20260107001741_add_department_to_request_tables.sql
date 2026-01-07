/*
  # Add department column to request tables

  1. Changes
    - Add department column to petty_cash_requests table
    - Add department column to reimbursement_requests table
    - Add department column to canvass_requests table
    - Set default value to empty string for consistency with cash_advance_requests
    - This column stores the department of the requester at the time of request submission

  2. Notes
    - Department is denormalized from user_profiles to maintain historical accuracy
    - Even if a user changes departments later, the request will still show the department at submission time
    - This is important for approval flow tracking and reporting
*/

-- Add department to petty_cash_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'department'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN department text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Add department to reimbursement_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'department'
  ) THEN
    ALTER TABLE reimbursement_requests ADD COLUMN department text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Add department to canvass_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvass_requests' AND column_name = 'department'
  ) THEN
    ALTER TABLE canvass_requests ADD COLUMN department text NOT NULL DEFAULT '';
  END IF;
END $$;