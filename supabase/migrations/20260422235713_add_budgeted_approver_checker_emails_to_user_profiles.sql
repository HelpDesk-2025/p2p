/*
  # Split Approver/Checker Email into Budgeted and Non-Budgeted

  1. Purpose
    - Executive requestors now configure separate Approver Email and Checker
      Email for two request budget categories:
        - Non-Budgeted requests
        - Budgeted requests
    - The existing single `approver_email` / `checker_email` columns are
      retained for backwards compatibility. New code will prefer the
      category-specific columns.

  2. New Columns (all nullable text)
    - user_profiles.approver_email_non_budgeted
    - user_profiles.approver_email_budgeted
    - user_profiles.checker_email_non_budgeted
    - user_profiles.checker_email_budgeted

  3. Notes
    1. No data is destroyed. Legacy columns (`approver_email`,
       `checker_email`) remain intact.
    2. No RLS changes needed; existing user_profiles policies already cover
       these new columns.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles'
      AND column_name = 'approver_email_non_budgeted'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN approver_email_non_budgeted text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles'
      AND column_name = 'approver_email_budgeted'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN approver_email_budgeted text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles'
      AND column_name = 'checker_email_non_budgeted'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN checker_email_non_budgeted text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles'
      AND column_name = 'checker_email_budgeted'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN checker_email_budgeted text;
  END IF;
END $$;
