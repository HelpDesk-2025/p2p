/*
  # Add Approver and Checker Email Fields to User Profiles

  1. Changes
    - Add `approver_email` column to user_profiles table
    - Add `checker_email` column to user_profiles table
    - These fields are for Executive requestor types only
  
  2. Details
    - Both columns are nullable (only used for Executive requestor type)
    - Store email addresses for designated approver and checker
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'approver_email'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN approver_email text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'checker_email'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN checker_email text;
  END IF;
END $$;
