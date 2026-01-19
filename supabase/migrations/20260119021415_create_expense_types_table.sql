/*
  # Create Expense Types Table

  1. New Tables
    - `expense_types`
      - `id` (uuid, primary key)
      - `name` (text, unique) - Name of the expense type
      - `description` (text) - Description of the expense type
      - `is_active` (boolean) - Whether the expense type is active
      - `company_id` (uuid) - Reference to company
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      
  2. Security
    - Enable RLS on `expense_types` table
    - Add policies for authenticated users to read active expense types
    - Add policies for admins to manage expense types
    
  3. Purpose
    - Used for categorizing expenses in Petty Cash, Reimbursement, and other expense requests
    - Similar structure to PR Checklists configuration
*/

CREATE TABLE IF NOT EXISTS expense_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, company_id)
);

ALTER TABLE expense_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read active expense types"
  ON expense_types
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage expense types"
  ON expense_types
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND (user_profiles.company_id = expense_types.company_id OR expense_types.company_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND (user_profiles.company_id = expense_types.company_id OR expense_types.company_id IS NULL)
    )
  );

CREATE INDEX IF NOT EXISTS idx_expense_types_company_id ON expense_types(company_id);
CREATE INDEX IF NOT EXISTS idx_expense_types_is_active ON expense_types(is_active);
