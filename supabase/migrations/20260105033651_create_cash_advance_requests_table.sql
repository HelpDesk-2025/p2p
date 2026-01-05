/*
  # Create Cash Advance Requests Table

  1. New Tables
    - `cash_advance_requests`
      - `id` (uuid, primary key)
      - `ca_number` (text, unique) - Cash advance number
      - `requester_id` (uuid) - References user_profiles
      - `company_id` (uuid) - References companies
      - `department` (text) - Requestor's department
      - `request_date` (date) - Date of request
      - `payee` (text) - Vendor/payee name
      - `payee_number` (text) - Vendor number from external system
      - `purpose` (text) - Purpose of cash advance
      - `amount` (numeric) - Requested amount
      - `date_needed` (date, nullable) - When the cash is needed
      - `budgeted` (boolean) - Whether request is budgeted
      - `payment_mode_id` (uuid, nullable) - References payment_modes
      - `status` (text) - Request status (draft, pending, approved, rejected, disbursed)
      - `current_approval_level` (integer) - Current step in approval process
      - `rfp_pdf_path` (text, nullable) - Path to generated RFP document
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record update timestamp

  2. Security
    - Enable RLS on `cash_advance_requests` table
    - Users can view their own requests
    - Users can create their own requests
    - Users can update their own draft requests
    - Admins can view and manage all requests
    - Approvers can view requests that need their approval
*/

-- Create cash_advance_requests table
CREATE TABLE IF NOT EXISTS cash_advance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_number text UNIQUE NOT NULL,
  requester_id uuid REFERENCES user_profiles(id) NOT NULL,
  company_id uuid REFERENCES companies(id),
  department text NOT NULL DEFAULT '',
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  payee text NOT NULL DEFAULT '',
  payee_number text,
  purpose text NOT NULL,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  date_needed date,
  budgeted boolean DEFAULT true,
  payment_mode_id uuid REFERENCES payment_modes(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'disbursed')),
  current_approval_level integer DEFAULT 0,
  rfp_pdf_path text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE cash_advance_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own cash advance requests
CREATE POLICY "Users can view own cash advance requests"
  ON cash_advance_requests FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

-- Users can create their own cash advance requests
CREATE POLICY "Users can create own cash advance requests"
  ON cash_advance_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Users can update their own draft cash advance requests
CREATE POLICY "Users can update own draft cash advance requests"
  ON cash_advance_requests FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid() AND status = 'draft')
  WITH CHECK (requester_id = auth.uid());

-- Admins can view all cash advance requests
CREATE POLICY "Admins can view all cash advance requests"
  ON cash_advance_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can manage all cash advance requests
CREATE POLICY "Admins can manage all cash advance requests"
  ON cash_advance_requests FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Approvers can view pending cash advance requests that need their approval
CREATE POLICY "Approvers can view pending cash advance requests"
  ON cash_advance_requests FOR SELECT
  TO authenticated
  USING (
    status = 'pending' AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'approver'
    )
  );

-- Approvers can update pending cash advance requests (for approval/rejection)
CREATE POLICY "Approvers can update pending cash advance requests"
  ON cash_advance_requests FOR UPDATE
  TO authenticated
  USING (
    status = 'pending' AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'approver'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'approver'
    )
  );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_cash_advance_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cash_advance_requests_updated_at
  BEFORE UPDATE ON cash_advance_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_cash_advance_requests_updated_at();
