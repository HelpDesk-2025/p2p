/*
  # Fix Duplicate Storage Policies

  1. Changes
    - Remove duplicate UPDATE policies on storage.objects
    - Keep only one clear UPDATE policy that allows authenticated users to update attachments
    
  2. Security
    - Maintains proper access control for authenticated users
*/

-- Drop duplicate policies
DROP POLICY IF EXISTS "Users can update attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update attachments" ON storage.objects;

-- Create single clear update policy
CREATE POLICY "Authenticated users can update attachments"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'attachments')
  WITH CHECK (bucket_id = 'attachments');
