/*
  # Create Approval Flow Setups Table

  1. New Tables
    - `approval_flow_setups`
      - `id` (uuid, primary key) - Unique identifier for each approval flow setup
      - `name` (text, required) - Name/description of the approval flow setup
      - `company_id` (uuid, required) - Company this setup belongs to
      - `department_id` (uuid, optional) - Department this setup applies to (null for company-wide)
      - `is_active` (boolean) - Whether this setup is active
      - `created_at` (timestamptz) - When the setup was created
      - `updated_at` (timestamptz) - When the setup was last updated

  2. Changes
    - Add `approval_flow_setup_id` to `approval_flows` table to link steps to their setup
    - Keep existing `workflow_type` field (1=Unbudgeted, 2=Budgeted<Min, 3=Budgeted>Min)

  3. Security
    - Enable RLS on `approval_flow_setups` table
    - Add policies for authenticated users to read
    - Add policies for admins to manage setups

  4. Important Notes
    - Each approval_flow_setup represents one complete configuration
    - Each setup contains 3 workflow types (Unbudgeted, Budgeted<Min, Budgeted>Min)
    - Approval steps are linked to the setup via approval_flow_setup_id
*/

-- Create approval_flow_setups table
CREATE TABLE IF NOT EXISTS approval_flow_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add approval_flow_setup_id to approval_flows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_flows' AND column_name = 'approval_flow_setup_id'
  ) THEN
    ALTER TABLE approval_flows ADD COLUMN approval_flow_setup_id uuid REFERENCES approval_flow_setups(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE approval_flow_setups ENABLE ROW LEVEL SECURITY;

-- Create policies for approval_flow_setups
CREATE POLICY "Authenticated users can view approval flow setups"
  ON approval_flow_setups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert approval flow setups"
  ON approval_flow_setups FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update approval flow setups"
  ON approval_flow_setups FOR UPDATE
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

CREATE POLICY "Admins can delete approval flow setups"
  ON approval_flow_setups FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_approval_flow_setups_company ON approval_flow_setups(company_id);
CREATE INDEX IF NOT EXISTS idx_approval_flow_setups_department ON approval_flow_setups(department_id);
CREATE INDEX IF NOT EXISTS idx_approval_flows_setup_id ON approval_flows(approval_flow_setup_id);
