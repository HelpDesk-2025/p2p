/*
  # Add Line Names to Payment Modes

  1. Changes
    - Add `line_names` column to `payment_modes` table
      - Stores an array of objects with line name and is_required status
      - Structure: [{ name: string, is_required: boolean }]
  
  2. Notes
    - Uses JSONB type for flexible storage of line names configuration
    - Default value is empty array
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_modes' AND column_name = 'line_names'
  ) THEN
    ALTER TABLE payment_modes ADD COLUMN line_names JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;
