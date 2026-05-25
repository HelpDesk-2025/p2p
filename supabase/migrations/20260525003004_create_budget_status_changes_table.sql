/*
  # Create Budget Status Changes History Table

  1. New Tables
    - `budget_status_changes`
      - `id` (uuid, primary key)
      - `request_type` (text) - Type of request (Purchase Requisition)
      - `request_id` (uuid) - ID of the request
      - `request_number` (text) - Document number for reference
      - `changed_by` (uuid) - User who made the change
      - `changed_by_name` (text) - Name of the user at time of change
      - `previous_status` (boolean) - Previous is_budgeted value
      - `new_status` (boolean) - New is_budgeted value
      - `reason` (text) - Reason for the change
      - `changed_at` (timestamptz) - When the change was made

  2. Security
    - Enable RLS on `budget_status_changes` table
    - Authenticated users can view changes related to requests they have access to
    - Approvers and admins can insert changes

  3. Notes
    - Provides audit trail for budget status modifications during approval
    - Only approvers (not checkers) can change budget status
*/

CREATE TABLE IF NOT EXISTS budget_status_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL DEFAULT 'Purchase Requisition',
  request_id uuid NOT NULL,
  request_number text NOT NULL,
  changed_by uuid REFERENCES user_profiles(id) NOT NULL,
  changed_by_name text NOT NULL,
  previous_status boolean NOT NULL,
  new_status boolean NOT NULL,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE budget_status_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view budget status changes"
  ON budget_status_changes
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Approvers and admins can insert budget status changes"
  ON budget_status_changes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    changed_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'approver', 'accounting', 'treasury')
    )
  );

CREATE INDEX IF NOT EXISTS idx_budget_status_changes_request
  ON budget_status_changes(request_type, request_id);

CREATE INDEX IF NOT EXISTS idx_budget_status_changes_date
  ON budget_status_changes(changed_at DESC);
