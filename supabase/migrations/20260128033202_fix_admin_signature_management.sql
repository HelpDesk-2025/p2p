/*
  # Fix Admin Signature Management

  1. Changes
    - Drop restrictive delete policy that only allows users to delete their own attachments
    - Create new delete policy that allows:
      - Users to delete their own attachments
      - Admins to delete any attachment
    - Ensure admins can update and delete signatures for any user

  2. Security
    - Maintains user ownership for regular users
    - Grants full access to admins (role = 'Admin')
*/

-- Drop the old restrictive delete policy
DROP POLICY IF EXISTS "Users can delete their own attachments" ON storage.objects;

-- Create new delete policy that allows admins to delete any attachment
CREATE POLICY "Users and admins can delete attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attachments' AND (
      owner = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'Admin'
      )
    )
  );
