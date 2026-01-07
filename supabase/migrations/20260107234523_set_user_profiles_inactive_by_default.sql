/*
  # Set User Profiles to Inactive by Default

  1. Changes
    - Change the default value of `is_active` column from `true` to `false`
    - New user signups will be inactive until an admin activates them

  2. Security
    - Existing users remain unchanged
    - Only new signups will default to inactive status
    - Admins can still manually activate/deactivate users
*/

-- Change the default value of is_active to false
ALTER TABLE user_profiles 
  ALTER COLUMN is_active SET DEFAULT false;
