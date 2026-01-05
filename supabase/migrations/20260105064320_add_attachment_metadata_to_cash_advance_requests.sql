/*
  # Add Attachment Metadata to Cash Advance Requests

  1. Changes
    - Add `attachment_metadata` column to `cash_advance_requests` table
      - Stores JSON array of attachment information including filenames
      - Format: [{"name": "filename.pdf", "type": "application/pdf", "size": 12345}]
      - Nullable field as attachments are optional

  2. Purpose
    - Store original filenames of uploaded attachments
    - Allow displaying attachment filenames in approval views
    - Track attachment details without needing to parse file paths
*/

-- Add attachment_metadata column to cash_advance_requests table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_advance_requests' AND column_name = 'attachment_metadata'
  ) THEN
    ALTER TABLE cash_advance_requests ADD COLUMN attachment_metadata jsonb;
  END IF;
END $$;

-- Add comment explaining the field
COMMENT ON COLUMN cash_advance_requests.attachment_metadata IS 
'JSON array of attachment metadata. Format: [{"name": "filename.pdf", "type": "application/pdf", "size": 12345}]';
