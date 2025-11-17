/*
  # Add Additional User Profile Fields

  1. Changes
    - Add `company` column (text)
    - Add `approver_type` column (text) - e.g., 'primary', 'secondary', 'final'
    - Add `sequence` column (integer) - approval sequence order
    - Add `days_of_approval` column (integer) - number of days to approve
    - Add `e_sig` column (text) - electronic signature

  2. Notes
    - All new fields are optional to maintain backward compatibility
    - Default values provided where appropriate
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'company'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN company TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'approver_type'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN approver_type TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'sequence'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN sequence INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'days_of_approval'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN days_of_approval INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'e_sig'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN e_sig TEXT;
  END IF;
END $$;
