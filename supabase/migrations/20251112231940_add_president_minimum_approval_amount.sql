/*
  # Add President Minimum Approval Amount to Companies

  1. Changes to `companies` table
    - Add `president_min_amount` (numeric) - Minimum amount requiring president approval
      - Default: 0
      - Nullable to allow no minimum

  2. Notes
    - This field defines the threshold amount above which president approval is required
    - If null or 0, president approval may not be required based on amount
    - Used in approval flow logic to determine when president approval is needed
*/

-- Add president_min_amount column to companies table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'president_min_amount'
  ) THEN
    ALTER TABLE companies ADD COLUMN president_min_amount numeric(15,2) DEFAULT 0;
  END IF;
END $$;

-- Add check constraint to ensure non-negative values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'companies_president_min_amount_check'
  ) THEN
    ALTER TABLE companies
    ADD CONSTRAINT companies_president_min_amount_check
    CHECK (president_min_amount >= 0);
  END IF;
END $$;
