/*
  # Add MSBC Tracking Columns to Purchase Orders

  1. Modified Tables
    - `purchase_orders`
      - `msbc_sync_status` (text) - Tracks posting lifecycle: pending, syncing, synced, failed
      - `msbc_sync_date` (timestamptz) - Timestamp of successful MSBC posting
      - `msbc_sync_error` (text) - Error message if posting failed
      - `msbc_posting_status` (text) - Final status: Success, Failed, Pending
      - `msbc_posting_date` (timestamptz) - When posted to MSBC
      - `msbc_journal_batch_id` (text) - Journal batch ID returned by MSBC
      - `msbc_error_message` (text) - Detailed error information
      - `merged_pdf_path` (text) - Storage path to the merged PDF (PO Form + RFP + Canvass Summary + Quotation)

  2. Important Notes
    - These columns mirror the MSBC tracking pattern used in purchase_requisitions and canvass_requests
    - merged_pdf_path stores the combined PDF uploaded after final approval
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'msbc_sync_status'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN msbc_sync_status text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'msbc_sync_date'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN msbc_sync_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'msbc_sync_error'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN msbc_sync_error text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'msbc_posting_status'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN msbc_posting_status text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'msbc_posting_date'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN msbc_posting_date timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'msbc_journal_batch_id'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN msbc_journal_batch_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'msbc_error_message'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN msbc_error_message text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'merged_pdf_path'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN merged_pdf_path text;
  END IF;
END $$;
