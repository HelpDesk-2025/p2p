/*
  # Add MSBC Sync Status to Request Tables

  1. Changes
    - Add `msbc_sync_status` column to purchase_requisitions
    - Add `msbc_sync_date` column to purchase_requisitions
    - Add `msbc_sync_error` column to purchase_requisitions
    - Add same fields to other request tables for consistency

  2. Field Details
    - `msbc_sync_status` (text) - pending, syncing, synced, failed
    - `msbc_sync_date` (timestamptz) - When the sync was completed
    - `msbc_sync_error` (text) - Error message if sync failed
*/

-- Add MSBC sync fields to purchase_requisitions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_requisitions' AND column_name = 'msbc_sync_status'
  ) THEN
    ALTER TABLE purchase_requisitions 
    ADD COLUMN msbc_sync_status text DEFAULT 'pending' CHECK (msbc_sync_status IN ('pending', 'syncing', 'synced', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_requisitions' AND column_name = 'msbc_sync_date'
  ) THEN
    ALTER TABLE purchase_requisitions 
    ADD COLUMN msbc_sync_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_requisitions' AND column_name = 'msbc_sync_error'
  ) THEN
    ALTER TABLE purchase_requisitions 
    ADD COLUMN msbc_sync_error text;
  END IF;
END $$;

-- Add MSBC sync fields to canvass_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvass_requests' AND column_name = 'msbc_sync_status'
  ) THEN
    ALTER TABLE canvass_requests 
    ADD COLUMN msbc_sync_status text DEFAULT 'pending' CHECK (msbc_sync_status IN ('pending', 'syncing', 'synced', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvass_requests' AND column_name = 'msbc_sync_date'
  ) THEN
    ALTER TABLE canvass_requests 
    ADD COLUMN msbc_sync_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvass_requests' AND column_name = 'msbc_sync_error'
  ) THEN
    ALTER TABLE canvass_requests 
    ADD COLUMN msbc_sync_error text;
  END IF;
END $$;

-- Add MSBC sync fields to petty_cash_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'msbc_sync_status'
  ) THEN
    ALTER TABLE petty_cash_requests 
    ADD COLUMN msbc_sync_status text DEFAULT 'pending' CHECK (msbc_sync_status IN ('pending', 'syncing', 'synced', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'msbc_sync_date'
  ) THEN
    ALTER TABLE petty_cash_requests 
    ADD COLUMN msbc_sync_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'msbc_sync_error'
  ) THEN
    ALTER TABLE petty_cash_requests 
    ADD COLUMN msbc_sync_error text;
  END IF;
END $$;

-- Add MSBC sync fields to reimbursement_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'msbc_sync_status'
  ) THEN
    ALTER TABLE reimbursement_requests 
    ADD COLUMN msbc_sync_status text DEFAULT 'pending' CHECK (msbc_sync_status IN ('pending', 'syncing', 'synced', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'msbc_sync_date'
  ) THEN
    ALTER TABLE reimbursement_requests 
    ADD COLUMN msbc_sync_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'msbc_sync_error'
  ) THEN
    ALTER TABLE reimbursement_requests 
    ADD COLUMN msbc_sync_error text;
  END IF;
END $$;