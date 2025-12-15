/*
  # Add winning_vendor_number to canvass_requests

  1. Changes
    - Add `winning_vendor_number` column to `canvass_requests` table
      - Stores the vendor number of the winning supplier selected during approval
      - Required for MSBC purchaseInvoices API integration
      - Text type to accommodate various vendor numbering formats
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvass_requests' AND column_name = 'winning_vendor_number'
  ) THEN
    ALTER TABLE canvass_requests ADD COLUMN winning_vendor_number text;
  END IF;
END $$;
