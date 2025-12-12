/*
  # Fix Canvass Approver Recommendations Foreign Key

  1. Problem
    - The `canvass_approver_recommendations` table references `auth.users` but the query tries to join with `user_profiles`
    - This causes PostgREST to fail finding the relationship
    - We need to change the foreign key to reference `user_profiles` instead

  2. Changes
    - Drop the existing foreign key constraint
    - Add a new foreign key constraint referencing `user_profiles(id)`
    - This allows the PostgREST query to properly join with user_profiles
*/

-- Drop the existing foreign key constraint
ALTER TABLE canvass_approver_recommendations
DROP CONSTRAINT IF EXISTS canvass_approver_recommendations_approver_id_fkey;

-- Add new foreign key constraint referencing user_profiles
ALTER TABLE canvass_approver_recommendations
ADD CONSTRAINT canvass_approver_recommendations_approver_id_fkey
FOREIGN KEY (approver_id) REFERENCES user_profiles(id) ON DELETE CASCADE;