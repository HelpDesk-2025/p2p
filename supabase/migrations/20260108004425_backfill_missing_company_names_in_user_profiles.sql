/*
  # Backfill Missing Company Names in User Profiles

  1. Changes
    - Update existing user_profiles records that have company_id but missing company name
    - Lookup and populate the company name from the companies table
    
  2. Notes
    - This fixes existing users who registered but show "-" for company
    - Only affects records where company_id exists but company is null or empty
*/

-- Update user_profiles where company_id exists but company is missing
UPDATE user_profiles up
SET company = c.name
FROM companies c
WHERE up.company_id = c.id
  AND (up.company IS NULL OR up.company = '');