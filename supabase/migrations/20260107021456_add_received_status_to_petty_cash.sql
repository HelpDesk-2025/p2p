/*
  # Add received status to petty cash requests

  1. New Columns
    - `received_at` (timestamptz) - When the petty cash was received by requestor
    - `received_by` (uuid) - User ID who received the petty cash
    - `approved_petty_cash_pdf_path` (text) - Path to the generated approved petty cash PDF

  2. Changes
    - Add columns to petty_cash_requests table to track when cash is received
    - Add foreign key constraint for received_by
*/

-- Add new columns to petty_cash_requests
ALTER TABLE petty_cash_requests
ADD COLUMN IF NOT EXISTS received_at timestamptz,
ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_petty_cash_pdf_path text;
