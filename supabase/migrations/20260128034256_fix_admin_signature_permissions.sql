/*
  # Fix Admin Signature Permissions
  
  1. Changes
    - Drop all existing storage policies for attachments bucket
    - Create comprehensive policies that allow:
      - All authenticated users to upload to attachments bucket
      - All authenticated users to view attachments
      - Users to update their own attachments
      - Admins to update ANY attachment
      - Users to delete their own attachments  
      - Admins to delete ANY attachment
  
  2. Security
    - Maintains user ownership for regular users
    - Grants full CRUD access to admins on all attachments
    - Admin check uses user_profiles table role field
*/

-- Drop all existing policies for attachments bucket
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users and admins can delete attachments" ON storage.objects;

-- Policy: All authenticated users can upload to attachments bucket
CREATE POLICY "Authenticated users can upload attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'attachments');

-- Policy: All authenticated users can view attachments
CREATE POLICY "Users can view attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'attachments');

-- Policy: Users and admins can update attachments
CREATE POLICY "Users and admins can update attachments"
  ON storage.objects
  FOR UPDATE
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
  )
  WITH CHECK (
    bucket_id = 'attachments' AND (
      owner = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'Admin'
      )
    )
  );

-- Policy: Users and admins can delete attachments
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
