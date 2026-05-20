/*
  # Add Lock Columns to po_grns

  1. Modified Tables
    - `po_grns`
      - `locked_at` (timestamptz, nullable) - when the GR was locked
      - `locked_by` (uuid, nullable) - who locked it

  2. Notes
    - Locked GRs cannot be edited or cancelled
    - Only confirmed GRs can be locked
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'po_grns' AND column_name = 'locked_at'
  ) THEN
    ALTER TABLE po_grns ADD COLUMN locked_at timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'po_grns' AND column_name = 'locked_by'
  ) THEN
    ALTER TABLE po_grns ADD COLUMN locked_by uuid DEFAULT NULL;
  END IF;
END $$;
