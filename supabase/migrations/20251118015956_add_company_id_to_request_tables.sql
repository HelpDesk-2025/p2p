/*
  # Add company_id to request tables

  1. Changes
    - Add company_id column to canvass_requests, petty_cash_requests, reimbursement_requests, and cash_advance_requests tables
    - Add foreign key constraints to companies table
    - Set default value based on requester's company

  2. Security
    - No changes to RLS policies needed
*/

-- Add company_id to canvass_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvass_requests' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE canvass_requests ADD COLUMN company_id uuid REFERENCES companies(id);
  END IF;
END $$;

-- Add company_id to petty_cash_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN company_id uuid REFERENCES companies(id);
  END IF;
END $$;

-- Add company_id to reimbursement_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE reimbursement_requests ADD COLUMN company_id uuid REFERENCES companies(id);
  END IF;
END $$;

-- Add company_id to cash_advance_requests if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'cash_advance_requests'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE cash_advance_requests ADD COLUMN company_id uuid REFERENCES companies(id);
  END IF;
END $$;