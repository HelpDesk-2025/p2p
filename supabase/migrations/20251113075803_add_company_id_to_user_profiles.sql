/*
  # Add company_id to user_profiles

  1. Changes
    - Add `company_id` column to `user_profiles` table as a UUID foreign key reference to `companies`
    - Create an index on `company_id` for better query performance
    - Update existing records to match company names with company IDs
  
  2. Notes
    - Existing `company` text column is kept for backward compatibility
    - The `company_id` should be used for new functionality
*/

-- Add company_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN company_id uuid REFERENCES companies(id);
  END IF;
END $$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_company_id ON user_profiles(company_id);

-- Update existing records to link company names to company IDs
UPDATE user_profiles
SET company_id = companies.id
FROM companies
WHERE user_profiles.company = companies.name
  AND user_profiles.company_id IS NULL;
