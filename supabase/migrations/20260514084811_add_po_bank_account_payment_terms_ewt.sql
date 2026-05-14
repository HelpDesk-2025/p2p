/*
  # Add bank account, custom payment terms, and EWT to purchase orders

  1. Modified Tables
    - `purchase_orders`
      - Adds `vendor_bank_account` (text) - vendor bank account info
      - Adds `payment_terms_custom` (text) - custom payment terms (free-text override)
    - `purchase_order_items`
      - Adds `ewt_amount` (numeric) - expanded withholding tax per line, defaults to 0

  2. Notes
    - All new columns are nullable / defaulted; existing rows are unaffected.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_orders' AND column_name='vendor_bank_account') THEN
    ALTER TABLE purchase_orders ADD COLUMN vendor_bank_account text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_orders' AND column_name='payment_terms_custom') THEN
    ALTER TABLE purchase_orders ADD COLUMN payment_terms_custom text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_order_items' AND column_name='ewt_amount') THEN
    ALTER TABLE purchase_order_items ADD COLUMN ewt_amount numeric DEFAULT 0;
  END IF;
END $$;