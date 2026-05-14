/*
  # Add bank name and bank address to purchase orders

  1. Modified Tables
    - `purchase_orders`
      - Adds `vendor_bank_name` (text) - vendor's bank name
      - Adds `vendor_bank_address` (text) - vendor's bank address

  2. Notes
    - Both columns are nullable with empty string defaults; existing rows are unaffected.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_orders' AND column_name='vendor_bank_name') THEN
    ALTER TABLE purchase_orders ADD COLUMN vendor_bank_name text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_orders' AND column_name='vendor_bank_address') THEN
    ALTER TABLE purchase_orders ADD COLUMN vendor_bank_address text DEFAULT '';
  END IF;
END $$;