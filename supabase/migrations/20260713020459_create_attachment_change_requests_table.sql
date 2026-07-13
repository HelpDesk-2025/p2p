/*
# Create Attachment Change Requests Table

## Purpose
Allows approvers to request that a requestor replace specific attachments on a request
that is currently in the approval process, without affecting the approval flow.

## New Tables
- `attachment_change_requests`
  - `id` (uuid, PK) - Unique identifier
  - `request_type` (text) - Type of request (Purchase Requisition, Cash Advance, etc.)
  - `request_id` (uuid) - Reference to the request record
  - `request_number` (text) - Human-readable document number
  - `requested_by` (uuid) - Approver who requested the change
  - `requested_by_name` (text) - Name of the approver
  - `requester_id` (uuid) - The original requestor who must replace the attachment
  - `company_id` (uuid, nullable) - Company context
  - `attachments_to_replace` (jsonb) - Array of attachment objects with name/index
  - `remarks` (text) - Reason for attachment change
  - `status` (text) - pending or completed
  - `completed_at` (timestamptz) - When the requestor completed the replacement
  - `created_at` (timestamptz) - When the change was requested

## Security
- RLS enabled
- Authenticated users can insert (approvers creating change requests)
- Users can select rows where they are the requester or the one who requested
- Only the requester can update (to mark as completed)

## Constraints
- Only one pending change request per request_id (partial unique index)
- Status must be 'pending' or 'completed'

## Important Notes
1. This table does NOT affect approval flow - no ledger entries are created
2. The partial unique index ensures only one active change request per document
3. Both approver and requestor can view the change request records
*/

CREATE TABLE IF NOT EXISTS attachment_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL,
  request_id uuid NOT NULL,
  request_number text NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by_name text NOT NULL,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid,
  attachments_to_replace jsonb NOT NULL DEFAULT '[]'::jsonb,
  remarks text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'completed'))
);

-- Partial unique index: only one pending change request per request
CREATE UNIQUE INDEX IF NOT EXISTS idx_attachment_change_one_pending_per_request
  ON attachment_change_requests (request_id) WHERE status = 'pending';

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_attachment_change_requester
  ON attachment_change_requests (requester_id, status);
CREATE INDEX IF NOT EXISTS idx_attachment_change_request_id
  ON attachment_change_requests (request_id, status);

-- Enable RLS
ALTER TABLE attachment_change_requests ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert (approvers creating change requests)
DROP POLICY IF EXISTS "insert_attachment_change_requests" ON attachment_change_requests;
CREATE POLICY "insert_attachment_change_requests" ON attachment_change_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = requested_by);

-- Users can view change requests where they are involved
DROP POLICY IF EXISTS "select_attachment_change_requests" ON attachment_change_requests;
CREATE POLICY "select_attachment_change_requests" ON attachment_change_requests FOR SELECT
  TO authenticated USING (auth.uid() = requester_id OR auth.uid() = requested_by);

-- Only the requester can update (mark as completed)
DROP POLICY IF EXISTS "update_attachment_change_requests" ON attachment_change_requests;
CREATE POLICY "update_attachment_change_requests" ON attachment_change_requests FOR UPDATE
  TO authenticated USING (auth.uid() = requester_id) WITH CHECK (auth.uid() = requester_id);

-- No delete policy - records are kept for audit purposes
