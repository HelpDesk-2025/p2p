/*
  # Add MSBC Posting Status to Canvass Requests

  1. New Columns
    - `msbc_posting_status` (text, nullable)
      - Tracks the status of posting to MSBC API
      - Values: null (not posted), 'Pending', 'Success', 'Failed'
    
    - `msbc_posting_date` (timestamptz, nullable)
      - Records when the canvass was successfully posted to MSBC
    
    - `msbc_journal_batch_id` (text, nullable)
      - Stores the journal batch ID returned from MSBC API
    
    - `msbc_error_message` (text, nullable)
      - Stores error details if posting fails
    
    - `merged_rfp_attachment_path` (text, nullable)
      - Stores path to the final merged PDF (CVS + RFP + quotation)

  2. Purpose
    - Enable tracking of automated MSBC API posting workflow for canvass requests
    - Provide visibility into posting status and errors
    - Allow retry mechanism for failed postings
*/

-- Add msbc_posting_status column
ALTER TABLE canvass_requests 
ADD COLUMN IF NOT EXISTS msbc_posting_status text;

-- Add msbc_posting_date column
ALTER TABLE canvass_requests 
ADD COLUMN IF NOT EXISTS msbc_posting_date timestamptz;

-- Add msbc_journal_batch_id column
ALTER TABLE canvass_requests 
ADD COLUMN IF NOT EXISTS msbc_journal_batch_id text;

-- Add msbc_error_message column
ALTER TABLE canvass_requests 
ADD COLUMN IF NOT EXISTS msbc_error_message text;

-- Add merged_rfp_attachment_path column
ALTER TABLE canvass_requests 
ADD COLUMN IF NOT EXISTS merged_rfp_attachment_path text;

-- Add comments for documentation
COMMENT ON COLUMN canvass_requests.msbc_posting_status IS 'Status of posting to MSBC API: null (not posted), Pending, Success, Failed';
COMMENT ON COLUMN canvass_requests.msbc_posting_date IS 'Timestamp when canvass was successfully posted to MSBC';
COMMENT ON COLUMN canvass_requests.msbc_journal_batch_id IS 'Journal batch ID returned from MSBC API';
COMMENT ON COLUMN canvass_requests.msbc_error_message IS 'Error details if posting to MSBC fails';
COMMENT ON COLUMN canvass_requests.merged_rfp_attachment_path IS 'Path to merged PDF (CVS + RFP + quotation) in storage';