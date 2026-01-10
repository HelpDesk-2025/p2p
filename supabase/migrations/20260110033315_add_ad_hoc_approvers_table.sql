/*
  # Add Ad-Hoc Approvers Table

  ## Summary
  Creates a table to track ad-hoc approvers that can be added to requests independently of the approval flow setup.

  1. New Tables
    - `ad_hoc_approvers`
      - `id` (uuid, primary key) - Unique identifier
      - `request_type` (text) - Type of request (Purchase Requisition, Canvass, Petty Cash, Reimbursement, Cash Advance)
      - `request_id` (uuid) - ID of the request
      - `user_id` (uuid, references user_profiles) - User who will approve
      - `approver_name` (text) - Name of the approver
      - `approver_type` (text) - Type label for the approver
      - `sequence` (integer) - Position in approval flow
      - `status` (text) - Status: pending, approved, rejected
      - `added_by` (uuid, references user_profiles) - User who added this approver
      - `added_at` (timestamptz) - When the approver was added
      - `company_id` (uuid, references companies) - Company ID for multi-company support
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on ad_hoc_approvers table
    - Admins and approvers can insert and view entries
    - Users can view ad-hoc approvers for their own requests

  3. Notes
    - Ad-hoc approvers are inserted dynamically into the approval flow
    - They don't need to be predefined in approval_flow_setups
    - Can be added at any point in the approval process
*/

-- Create ad_hoc_approvers table
CREATE TABLE IF NOT EXISTS ad_hoc_approvers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN ('Purchase Requisition', 'Canvass', 'Petty Cash', 'Reimbursement', 'Cash Advance')),
  request_id uuid NOT NULL,
  user_id uuid REFERENCES user_profiles(id),
  approver_name text NOT NULL,
  approver_type text NOT NULL DEFAULT 'Ad-hoc Approver',
  sequence integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  added_by uuid REFERENCES user_profiles(id) NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid REFERENCES companies(id),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE ad_hoc_approvers ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all ad-hoc approvers
CREATE POLICY "Admins can view all ad-hoc approvers"
  ON ad_hoc_approvers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Approvers can view all ad-hoc approvers
CREATE POLICY "Approvers can view all ad-hoc approvers"
  ON ad_hoc_approvers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'procurement')
    )
  );

-- Policy: Users can view ad-hoc approvers for their own requests
CREATE POLICY "Users can view ad-hoc approvers for own requests"
  ON ad_hoc_approvers
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
      UNION
      SELECT id FROM cash_advance_requests WHERE requester_id = auth.uid()
    )
  );

-- Policy: Users who are ad-hoc approvers can view their assignments
CREATE POLICY "Ad-hoc approvers can view their assignments"
  ON ad_hoc_approvers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Admins and approvers can insert ad-hoc approvers
CREATE POLICY "Admins and approvers can add ad-hoc approvers"
  ON ad_hoc_approvers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'approver', 'procurement')
    )
  );

-- Policy: Admins and approvers can update ad-hoc approvers status
CREATE POLICY "Admins and approvers can update ad-hoc approvers"
  ON ad_hoc_approvers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'approver', 'procurement')
    ) OR user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'approver', 'procurement')
    ) OR user_id = auth.uid()
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ad_hoc_approvers_request 
  ON ad_hoc_approvers(request_type, request_id);

CREATE INDEX IF NOT EXISTS idx_ad_hoc_approvers_user 
  ON ad_hoc_approvers(user_id);

CREATE INDEX IF NOT EXISTS idx_ad_hoc_approvers_status 
  ON ad_hoc_approvers(status);

CREATE INDEX IF NOT EXISTS idx_ad_hoc_approvers_sequence 
  ON ad_hoc_approvers(request_id, sequence);

-- Add comment
COMMENT ON TABLE ad_hoc_approvers IS 'Ad-hoc approvers that can be added to requests independently of the approval flow setup';
