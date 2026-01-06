/*
  # Add Payment Mode Lines to Cash Advance Requests

  1. Changes
    - Add `payment_mode_lines` column to `cash_advance_requests` table
      - JSONB field to store array of payment mode line values
      - Each line has: name (text), value (text), is_required (boolean)

  2. Purpose
    - Store payment mode line item values for cash advance requests
    - Similar to purchase_requisitions payment_mode_lines structure
*/

-- Add payment_mode_lines column to cash_advance_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'payment_mode_lines'
  ) THEN
    ALTER TABLE cash_advance_requests ADD COLUMN payment_mode_lines jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;
