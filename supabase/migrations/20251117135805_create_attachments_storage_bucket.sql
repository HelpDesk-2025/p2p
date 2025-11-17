/*
  # Create Attachments Storage Bucket

  1. Storage Setup
    - Creates 'attachments' bucket for storing PR/request attachments
    - Bucket is private (not publicly accessible)
  
  2. Security Policies
    - Authenticated users can upload attachments
    - Users can view attachments (will be restricted by company later)
    - Users can delete their own attachments
  
  3. Purpose
    - Replace base64 storage in database with proper file storage
    - Support larger file sizes (up to 50MB per file)
    - Improve performance and reduce database bloat
*/

-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: Authenticated users can upload attachments
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attachments');

-- Policy: Users can view attachments
DROP POLICY IF EXISTS "Users can view attachments" ON storage.objects;
CREATE POLICY "Users can view attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'attachments');

-- Policy: Users can delete their own attachments
DROP POLICY IF EXISTS "Users can delete their own attachments" ON storage.objects;
CREATE POLICY "Users can delete their own attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'attachments' AND owner = auth.uid());
