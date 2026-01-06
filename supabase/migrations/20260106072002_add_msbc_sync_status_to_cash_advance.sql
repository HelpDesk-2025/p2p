/*
  # Add MSBC Sync Status to Cash Advance Requests

  1. Changes
    - Add `msbc_sync_status` column to cash_advance_requests (pending, syncing, synced, failed)
    - Add `msbc_sync_date` column to cash_advance_requests (when sync completed)
    - Add `msbc_sync_error` column to cash_advance_requests (error message if failed)
    - Add `msbc_journal_id` column to cash_advance_requests (ID from MSBC system)

  2. Field Details
    - Tracks the synchronization status with MSBC external system
    - Allows retry functionality for failed syncs
    - Records MSBC journal ID for reference
*/

-- Add MSBC sync fields to cash_advance_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'msbc_sync_status'
  ) THEN
    ALTER TABLE cash_advance_requests
    ADD COLUMN msbc_sync_status text DEFAULT 'pending' CHECK (msbc_sync_status IN ('pending', 'syncing', 'synced', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'msbc_sync_date'
  ) THEN
    ALTER TABLE cash_advance_requests
    ADD COLUMN msbc_sync_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'msbc_sync_error'
  ) THEN
    ALTER TABLE cash_advance_requests
    ADD COLUMN msbc_sync_error text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'msbc_journal_id'
  ) THEN
    ALTER TABLE cash_advance_requests
    ADD COLUMN msbc_journal_id text;
  END IF;
END $$;
