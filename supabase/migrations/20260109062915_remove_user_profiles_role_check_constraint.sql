/*
  # Remove Role Check Constraint from User Profiles

  1. Changes
    - Remove the CHECK constraint on user_profiles.role column
    - This allows the system to use any role name from the roles table
    - Previously limited to ('standard', 'approver', 'admin')

  2. Notes
    - The role field now references roles defined in the roles table
    - This provides flexibility to create custom roles with specific permissions
*/

-- Remove the check constraint that limits role values
ALTER TABLE user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_role_check;