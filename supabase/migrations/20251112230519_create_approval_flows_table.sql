/*
  # Create Approval Flows Table

  1. New Tables
    - `approval_flows`
      - `id` (uuid, primary key)
      - `company_id` (uuid, foreign key) - Reference to companies table
      - `department_id` (uuid, foreign key, nullable) - Reference to departments table (null for whole company)
      - `approver_type` (text, required) - Type of approver (Procurement Head, Department Head, President, etc.)
      - `sequence` (integer, required) - Order in approval flow
      - `days_to_approve` (integer) - Number of days allowed for approval
      - `is_required` (boolean) - Whether this approval step is required
      - `is_active` (boolean) - Whether this flow is active
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Indexes
    - Index on company_id for faster queries
    - Index on department_id for faster queries
    - Composite index on (company_id, department_id, sequence) for flow ordering

  3. Security
    - Enable RLS on `approval_flows` table
    - Add policy for authenticated users to read approval flows
    - Add policy for admin users to manage approval flows

  4. Notes
    - Approval flows define the sequence of approvals required
    - Can be company-wide (department_id is null) or department-specific
    - Sequence determines the order of approvals
    - Days to approve sets the deadline for each approval step
*/

-- Create approval_flows table
CREATE TABLE IF NOT EXISTS approval_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  approver_type text NOT NULL,
  sequence integer NOT NULL,
  days_to_approve integer DEFAULT 3,
  is_required boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_approval_flows_company_id ON approval_flows(company_id);
CREATE INDEX IF NOT EXISTS idx_approval_flows_department_id ON approval_flows(department_id);
CREATE INDEX IF NOT EXISTS idx_approval_flows_company_dept_seq ON approval_flows(company_id, department_id, sequence);

-- Add check constraint to ensure valid approver types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'approval_flows_approver_type_check'
  ) THEN
    ALTER TABLE approval_flows
    ADD CONSTRAINT approval_flows_approver_type_check
    CHECK (approver_type IN ('Requestor', 'Department Head', 'Procurement', 'Procurement Head', 'President'));
  END IF;
END $$;

-- Add check constraint to ensure positive values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'approval_flows_sequence_check'
  ) THEN
    ALTER TABLE approval_flows
    ADD CONSTRAINT approval_flows_sequence_check
    CHECK (sequence > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'approval_flows_days_check'
  ) THEN
    ALTER TABLE approval_flows
    ADD CONSTRAINT approval_flows_days_check
    CHECK (days_to_approve > 0);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE approval_flows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for approval_flows
CREATE POLICY "Authenticated users can read approval flows"
  ON approval_flows
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin users can insert approval flows"
  ON approval_flows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can update approval flows"
  ON approval_flows
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can delete approval flows"
  ON approval_flows
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );
