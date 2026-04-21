/*
  # Add exported tracking to petty_cash_requests

  1. New Columns
    - `exported_at` (timestamptz, nullable) - timestamp when the request was last exported in a release bundle
    - `exported_by` (uuid, nullable) - references the user who performed the export

  2. Purpose
    - Track which petty cash release rows have been included in an exported PDF bundle
    - Enables the UI to show an "Exported" column and avoid re-exporting rows unnecessarily

  3. Notes
    - Columns are nullable with no default; a null value means the row has never been exported
    - No RLS changes; existing policies on petty_cash_requests already govern access
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'exported_at'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN exported_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'petty_cash_requests' AND column_name = 'exported_by'
  ) THEN
    ALTER TABLE petty_cash_requests ADD COLUMN exported_by uuid REFERENCES auth.users(id);
  END IF;
END $$;
