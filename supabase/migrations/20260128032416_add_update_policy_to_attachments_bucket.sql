/*
  # Add UPDATE Policy to Attachments Bucket

  1. Changes
    - Add UPDATE policy to storage.objects for attachments bucket
    - Allows authenticated users to update their uploaded files
    - Enables upsert functionality for signature uploads

  2. Security
    - Restricted to authenticated users only
    - Only applies to attachments bucket
*/

-- Policy: Authenticated users can update attachments
DROP POLICY IF EXISTS "Authenticated users can update attachments" ON storage.objects;
CREATE POLICY "Authenticated users can update attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'attachments')
WITH CHECK (bucket_id = 'attachments');
