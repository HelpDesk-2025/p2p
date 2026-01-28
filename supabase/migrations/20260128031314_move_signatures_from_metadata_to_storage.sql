/*
  # Move E-Signatures from User Metadata to Storage

  1. Changes
    - Add `signature_path` column to `user_profiles` table to store signature file paths
    - This replaces the problematic approach of storing base64-encoded signatures in JWT tokens
    
  2. Security
    - RLS policies already exist for user_profiles table
    - Signature files will be stored in the existing 'attachments' storage bucket
    
  3. Important Notes
    - E-signatures were previously stored in `raw_user_meta_data` which gets included in JWT tokens
    - This caused HTTP 431 errors (Request Header Fields Too Large) for users with signatures
    - By storing only the file path in the database, JWT tokens remain small
    - Existing signatures in metadata will need to be manually migrated to storage
*/

-- Add signature_path column to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'signature_path'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN signature_path text;
  END IF;
END $$;

-- Add comment explaining the purpose
COMMENT ON COLUMN user_profiles.signature_path IS 'Path to user e-signature file in Supabase Storage (replaces e_sig in user metadata)';