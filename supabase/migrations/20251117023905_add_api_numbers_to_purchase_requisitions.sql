/*
  # Add API Numbers to Purchase Requisitions

  1. Changes
    - Add `payee_number` column (text) to store the vendor number from MSBC API
    - This field will store the vendor's API number for Non-Purchase Order PRs
    - The existing `payee` field stores the vendor display name
    - The `payee_number` is required for posting to MSBC API when PR is approved

  2. Notes
    - The items jsonb array already exists and will be updated to include item_number
    - Item structure will be: { description, quantity, unit, unit_price, total_price, item_number }
    - Payee_number is nullable since it's only used for Non-Purchase Order type
*/

-- Add payee_number column for storing vendor API number
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS payee_number text;

-- Add comment to clarify the purpose
COMMENT ON COLUMN purchase_requisitions.payee_number IS 'Vendor number from MSBC API, required for posting approved PRs to BC';
