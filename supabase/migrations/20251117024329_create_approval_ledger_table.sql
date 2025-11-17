/*
  # Create Approval Ledger Table

  1. New Tables
    - `approval_ledger`
      - `id` (uuid, primary key)
      - `request_type` (text) - Type of request (PR, Canvass, Petty Cash, Reimbursement)
      - `request_id` (uuid) - ID of the request
      - `request_number` (text) - Document/Request number for easy reference
      - `approver_id` (uuid, references user_profiles)
      - `approver_name` (text) - Name of approver at time of approval
      - `approver_type` (text) - Type of approver (Department Head, Procurement, President, etc.)
      - `action` (text) - Action taken (Approved, Rejected, Returned)
      - `comments` (text) - Approver comments/notes
      - `approval_date` (timestamptz) - When the approval action was taken
      - `sequence` (integer) - Sequence number in approval flow
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on approval_ledger table
    - Admins and approvers can view all entries
    - Users can view entries related to their own requests

  3. Notes
    - This table serves as an audit trail for all approval activities
    - Records are immutable once created (no updates/deletes)
    - Used for reporting and tracking approval history
*/

-- Create approval_ledger table
CREATE TABLE IF NOT EXISTS approval_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN ('Purchase Requisition', 'Canvass', 'Petty Cash', 'Reimbursement')),
  request_id uuid NOT NULL,
  request_number text NOT NULL,
  approver_id uuid REFERENCES user_profiles(id) NOT NULL,
  approver_name text NOT NULL,
  approver_type text,
  action text NOT NULL CHECK (action IN ('Approved', 'Rejected', 'Returned', 'Submitted')),
  comments text,
  approval_date timestamptz NOT NULL DEFAULT now(),
  sequence integer,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE approval_ledger ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all entries
CREATE POLICY "Admins can view all approval ledger entries"
  ON approval_ledger
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Approvers can view all entries
CREATE POLICY "Approvers can view all approval ledger entries"
  ON approval_ledger
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'approver'
    )
  );

-- Policy: Users can view entries related to their requests
CREATE POLICY "Users can view approval ledger for own requests"
  ON approval_ledger
  FOR SELECT
  TO authenticated
  USING (
    request_id IN (
      SELECT id FROM purchase_requisitions WHERE requester_id = auth.uid()
      UNION
      SELECT id FROM canvass_requests WHERE requester_id = auth.uid()
      UNION
      SELECT id FROM petty_cash_requests WHERE requester_id = auth.uid()
      UNION
      SELECT id FROM reimbursement_requests WHERE requester_id = auth.uid()
    )
  );

-- Policy: System can insert entries (for approval process)
CREATE POLICY "Authenticated users can insert approval ledger entries"
  ON approval_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (
    approver_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'approver')
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_approval_ledger_request 
  ON approval_ledger(request_type, request_id);

CREATE INDEX IF NOT EXISTS idx_approval_ledger_approver 
  ON approval_ledger(approver_id);

CREATE INDEX IF NOT EXISTS idx_approval_ledger_date 
  ON approval_ledger(approval_date DESC);

-- Add comment
COMMENT ON TABLE approval_ledger IS 'Audit trail for all approval activities across all request types';
