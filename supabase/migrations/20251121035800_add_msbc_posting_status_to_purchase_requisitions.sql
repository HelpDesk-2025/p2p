/*
  # Add MSBC Posting Status to Purchase Requisitions

  1. New Columns
    - `msbc_posting_status` (text, nullable)
      - Tracks the status of posting to MSBC API
      - Values: null (not posted), 'Pending', 'Success', 'Failed'
    
    - `msbc_posting_date` (timestamptz, nullable)
      - Records when the PR was successfully posted to MSBC
    
    - `msbc_journal_batch_id` (text, nullable)
      - Stores the journal batch ID returned from MSBC API
    
    - `msbc_error_message` (text, nullable)
      - Stores error details if posting fails
    
    - `merged_rfp_attachment_path` (text, nullable)
      - Stores path to the final merged PDF (RFP + attachments)

  2. Purpose
    - Enable tracking of automated MSBC API posting workflow
    - Provide visibility into posting status and errors
    - Allow retry mechanism for failed postings
*/

-- Add msbc_posting_status column
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS msbc_posting_status text;

-- Add msbc_posting_date column
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS msbc_posting_date timestamptz;

-- Add msbc_journal_batch_id column
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS msbc_journal_batch_id text;

-- Add msbc_error_message column
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS msbc_error_message text;

-- Add merged_rfp_attachment_path column
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS merged_rfp_attachment_path text;

-- Add comments for documentation
COMMENT ON COLUMN purchase_requisitions.msbc_posting_status IS 'Status of posting to MSBC API: null (not posted), Pending, Success, Failed';
COMMENT ON COLUMN purchase_requisitions.msbc_posting_date IS 'Timestamp when PR was successfully posted to MSBC';
COMMENT ON COLUMN purchase_requisitions.msbc_journal_batch_id IS 'Journal batch ID returned from MSBC API';
COMMENT ON COLUMN purchase_requisitions.msbc_error_message IS 'Error details if posting to MSBC fails';
COMMENT ON COLUMN purchase_requisitions.merged_rfp_attachment_path IS 'Path to merged PDF (RFP + attachments) in storage';