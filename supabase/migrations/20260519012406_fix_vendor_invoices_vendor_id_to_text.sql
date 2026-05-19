/*
  # Fix vendor_invoices vendor_id column type

  1. Problem
    - `vendor_invoices.vendor_id` is uuid but `purchase_orders.vendor_id` is text
    - Vendor IDs from MSBC are text codes (e.g. "JOHWIL"), not UUIDs
    - Inserting a vendor invoice fails with "invalid input syntax for type uuid"

  2. Changes
    - Alter `vendor_invoices.vendor_id` from uuid to text to match purchase_orders

  3. Notes
    - Table currently has no data so this is safe
*/

ALTER TABLE vendor_invoices ALTER COLUMN vendor_id TYPE text USING vendor_id::text;
