/*
  # Add 'reviewed' Status to SME Requests

  1. Changes
    - Modify the status constraint on `sme_requests` table to include 'reviewed'
    - The 'reviewed' status indicates that the SME has completed their review and marked the PR as ready for canvass
  
  2. Valid Status Values
    - pending: Initial state, awaiting SME review
    - reviewed: SME has reviewed and marked as ready for canvass
    - approved: (legacy/alternative status)
    - rejected: SME declined the request
*/

-- Drop the existing constraint
ALTER TABLE sme_requests DROP CONSTRAINT IF EXISTS sme_requests_status_check;

-- Add the updated constraint with 'reviewed' included
ALTER TABLE sme_requests ADD CONSTRAINT sme_requests_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'reviewed'));
