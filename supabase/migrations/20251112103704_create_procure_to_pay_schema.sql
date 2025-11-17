/*
  # Procure to Pay System Database Schema

  ## Overview
  Complete database schema for a Procure to Pay web application with request management,
  approval workflows, procurement checking, and configuration management.

  ## New Tables

  ### 1. User Management
    - `user_profiles` - Extended user information with roles
      - `id` (uuid, references auth.users)
      - `email` (text)
      - `full_name` (text)
      - `role` (text) - standard, approver, admin
      - `department` (text)
      - `is_active` (boolean)
      - `created_at`, `updated_at` (timestamptz)

  ### 2. Configuration Tables
    - `approvers` - List of approvers and their configuration
      - `id` (uuid, primary key)
      - `user_id` (uuid, references user_profiles)
      - `approval_type` (text) - purchase_requisition, canvass, petty_cash, reimbursement
      - `approval_level` (integer) - order of approval
      - `max_amount` (numeric) - maximum amount they can approve
      - `is_active` (boolean)

    - `pr_checklists` - Purchase Requisition checklist items
      - `id` (uuid, primary key)
      - `item_name` (text)
      - `description` (text)
      - `is_required` (boolean)
      - `order_index` (integer)
      - `is_active` (boolean)

    - `payment_modes` - Payment methods
      - `id` (uuid, primary key)
      - `mode_name` (text)
      - `description` (text)
      - `is_active` (boolean)

    - `holidays` - Company holidays
      - `id` (uuid, primary key)
      - `holiday_date` (date)
      - `holiday_name` (text)
      - `is_recurring` (boolean)

  ### 3. Request Tables
    - `purchase_requisitions` - PR requests
      - `id` (uuid, primary key)
      - `pr_number` (text, unique)
      - `requester_id` (uuid, references user_profiles)
      - `department` (text)
      - `request_date` (date)
      - `required_date` (date)
      - `purpose` (text)
      - `total_amount` (numeric)
      - `status` (text) - draft, pending, approved, rejected, in_procurement
      - `current_approval_level` (integer)
      - `items` (jsonb) - array of items with details
      - `attachments` (jsonb) - array of file references
      - `checklist_status` (jsonb) - checklist completion status

    - `canvass_requests` - Canvass requests
      - `id` (uuid, primary key)
      - `canvass_number` (text, unique)
      - `requester_id` (uuid, references user_profiles)
      - `pr_id` (uuid, references purchase_requisitions, nullable)
      - `request_date` (date)
      - `required_date` (date)
      - `items` (jsonb) - items to canvass
      - `suppliers` (jsonb) - supplier quotes
      - `status` (text) - draft, pending, approved, rejected
      - `current_approval_level` (integer)
      - `total_amount` (numeric)

    - `petty_cash_requests` - Petty cash requests
      - `id` (uuid, primary key)
      - `pc_number` (text, unique)
      - `requester_id` (uuid, references user_profiles)
      - `request_date` (date)
      - `purpose` (text)
      - `amount` (numeric)
      - `payment_mode_id` (uuid, references payment_modes)
      - `status` (text) - draft, pending, approved, rejected, disbursed
      - `current_approval_level` (integer)
      - `attachments` (jsonb)

    - `reimbursement_requests` - Reimbursement requests
      - `id` (uuid, primary key)
      - `reimb_number` (text, unique)
      - `requester_id` (uuid, references user_profiles)
      - `request_date` (date)
      - `expense_date` (date)
      - `purpose` (text)
      - `amount` (numeric)
      - `payment_mode_id` (uuid, references payment_modes)
      - `status` (text) - draft, pending, approved, rejected, reimbursed
      - `current_approval_level` (integer)
      - `receipts` (jsonb)

  ### 4. Approval History
    - `approval_history` - Tracks all approval actions
      - `id` (uuid, primary key)
      - `request_type` (text) - purchase_requisition, canvass, petty_cash, reimbursement
      - `request_id` (uuid)
      - `approver_id` (uuid, references user_profiles)
      - `approval_level` (integer)
      - `action` (text) - approved, rejected
      - `comments` (text)
      - `action_date` (timestamptz)

    - `procurement_checks` - Procurement checking records
      - `id` (uuid, primary key)
      - `pr_id` (uuid, references purchase_requisitions)
      - `checker_id` (uuid, references user_profiles)
      - `check_date` (timestamptz)
      - `items_verified` (jsonb)
      - `status` (text) - in_progress, completed
      - `notes` (text)

  ## Security
    - Enable RLS on all tables
    - Policies for role-based access control
    - Standard users can create and view own requests
    - Approvers can view and approve assigned requests
    - Admins have full access to all data and configurations
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'standard' CHECK (role IN ('standard', 'approver', 'admin')),
  department text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all active profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles"
  ON user_profiles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create approvers configuration table
CREATE TABLE IF NOT EXISTS approvers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  approval_type text NOT NULL CHECK (approval_type IN ('purchase_requisition', 'canvass', 'petty_cash', 'reimbursement')),
  approval_level integer NOT NULL DEFAULT 1,
  max_amount numeric(15,2),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE approvers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view active approvers"
  ON approvers FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage approvers"
  ON approvers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create PR checklists table
CREATE TABLE IF NOT EXISTS pr_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  description text,
  is_required boolean DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE pr_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view active checklists"
  ON pr_checklists FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage checklists"
  ON pr_checklists FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create payment_modes table
CREATE TABLE IF NOT EXISTS payment_modes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode_name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_modes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view active payment modes"
  ON payment_modes FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage payment modes"
  ON payment_modes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create holidays table
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  holiday_name text NOT NULL,
  is_recurring boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view holidays"
  ON holidays FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage holidays"
  ON holidays FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create purchase_requisitions table
CREATE TABLE IF NOT EXISTS purchase_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number text UNIQUE NOT NULL,
  requester_id uuid REFERENCES user_profiles(id) NOT NULL,
  department text NOT NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  required_date date NOT NULL,
  purpose text NOT NULL,
  total_amount numeric(15,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'in_procurement', 'completed')),
  current_approval_level integer DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]',
  attachments jsonb DEFAULT '[]',
  checklist_status jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_requisitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchase requisitions"
  ON purchase_requisitions FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "Approvers can view pending requisitions"
  ON purchase_requisitions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  );

CREATE POLICY "Users can create own purchase requisitions"
  ON purchase_requisitions FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update own draft requisitions"
  ON purchase_requisitions FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid() AND status = 'draft')
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Approvers can update requisition status"
  ON purchase_requisitions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  );

-- Create canvass_requests table
CREATE TABLE IF NOT EXISTS canvass_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canvass_number text UNIQUE NOT NULL,
  requester_id uuid REFERENCES user_profiles(id) NOT NULL,
  pr_id uuid REFERENCES purchase_requisitions(id),
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  required_date date NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',
  suppliers jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  current_approval_level integer DEFAULT 0,
  total_amount numeric(15,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE canvass_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own canvass requests"
  ON canvass_requests FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "Approvers can view pending canvass requests"
  ON canvass_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  );

CREATE POLICY "Users can create own canvass requests"
  ON canvass_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update own draft canvass"
  ON canvass_requests FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid() AND status = 'draft')
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Approvers can update canvass status"
  ON canvass_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  );

-- Create petty_cash_requests table
CREATE TABLE IF NOT EXISTS petty_cash_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pc_number text UNIQUE NOT NULL,
  requester_id uuid REFERENCES user_profiles(id) NOT NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  purpose text NOT NULL,
  amount numeric(15,2) NOT NULL,
  payment_mode_id uuid REFERENCES payment_modes(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'disbursed')),
  current_approval_level integer DEFAULT 0,
  attachments jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE petty_cash_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own petty cash requests"
  ON petty_cash_requests FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "Approvers can view pending petty cash"
  ON petty_cash_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  );

CREATE POLICY "Users can create own petty cash requests"
  ON petty_cash_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update own draft petty cash"
  ON petty_cash_requests FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid() AND status = 'draft')
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Approvers can update petty cash status"
  ON petty_cash_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  );

-- Create reimbursement_requests table
CREATE TABLE IF NOT EXISTS reimbursement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reimb_number text UNIQUE NOT NULL,
  requester_id uuid REFERENCES user_profiles(id) NOT NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  expense_date date NOT NULL,
  purpose text NOT NULL,
  amount numeric(15,2) NOT NULL,
  payment_mode_id uuid REFERENCES payment_modes(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'reimbursed')),
  current_approval_level integer DEFAULT 0,
  receipts jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE reimbursement_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reimbursement requests"
  ON reimbursement_requests FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "Approvers can view pending reimbursements"
  ON reimbursement_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  );

CREATE POLICY "Users can create own reimbursement requests"
  ON reimbursement_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update own draft reimbursements"
  ON reimbursement_requests FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid() AND status = 'draft')
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Approvers can update reimbursement status"
  ON reimbursement_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  );

-- Create approval_history table
CREATE TABLE IF NOT EXISTS approval_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN ('purchase_requisition', 'canvass', 'petty_cash', 'reimbursement')),
  request_id uuid NOT NULL,
  approver_id uuid REFERENCES user_profiles(id) NOT NULL,
  approval_level integer NOT NULL,
  action text NOT NULL CHECK (action IN ('approved', 'rejected')),
  comments text,
  action_date timestamptz DEFAULT now()
);

ALTER TABLE approval_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view approval history for own requests"
  ON approval_history FOR SELECT
  TO authenticated
  USING (
    CASE request_type
      WHEN 'purchase_requisition' THEN EXISTS (
        SELECT 1 FROM purchase_requisitions WHERE id = request_id AND requester_id = auth.uid()
      )
      WHEN 'canvass' THEN EXISTS (
        SELECT 1 FROM canvass_requests WHERE id = request_id AND requester_id = auth.uid()
      )
      WHEN 'petty_cash' THEN EXISTS (
        SELECT 1 FROM petty_cash_requests WHERE id = request_id AND requester_id = auth.uid()
      )
      WHEN 'reimbursement' THEN EXISTS (
        SELECT 1 FROM reimbursement_requests WHERE id = request_id AND requester_id = auth.uid()
      )
    END
  );

CREATE POLICY "Approvers can view all approval history"
  ON approval_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  );

CREATE POLICY "Approvers can create approval history"
  ON approval_history FOR INSERT
  TO authenticated
  WITH CHECK (
    approver_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  );

-- Create procurement_checks table
CREATE TABLE IF NOT EXISTS procurement_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid REFERENCES purchase_requisitions(id) NOT NULL,
  checker_id uuid REFERENCES user_profiles(id) NOT NULL,
  check_date timestamptz DEFAULT now(),
  items_verified jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE procurement_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and approvers can view procurement checks"
  ON procurement_checks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  );

CREATE POLICY "Admins and approvers can manage procurement checks"
  ON procurement_checks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('approver', 'admin')
    )
  );

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pr_requester ON purchase_requisitions(requester_id);
CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_canvass_requester ON canvass_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_canvass_status ON canvass_requests(status);
CREATE INDEX IF NOT EXISTS idx_pc_requester ON petty_cash_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_pc_status ON petty_cash_requests(status);
CREATE INDEX IF NOT EXISTS idx_reimb_requester ON reimbursement_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_reimb_status ON reimbursement_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_history_request ON approval_history(request_type, request_id);

-- Insert default payment modes
INSERT INTO payment_modes (mode_name, description) VALUES
  ('Cash', 'Cash payment'),
  ('Check', 'Check payment'),
  ('Bank Transfer', 'Electronic bank transfer'),
  ('Credit Card', 'Credit card payment')
ON CONFLICT DO NOTHING;