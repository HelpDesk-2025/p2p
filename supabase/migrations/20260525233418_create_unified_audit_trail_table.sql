/*
  # Create Unified Audit Trail Table

  1. New Tables
    - `audit_trail`
      - `id` (uuid, primary key) - unique identifier
      - `table_name` (text, not null) - the affected database table
      - `record_id` (text, not null) - the ID of the affected record
      - `action` (text, not null) - CREATE, UPDATE, or DELETE
      - `module` (text, not null) - configuration, requests, approvals, or p2p
      - `description` (text) - human-readable summary of the change
      - `old_values` (jsonb, nullable) - previous field values (null for CREATE)
      - `new_values` (jsonb, nullable) - new field values (null for DELETE)
      - `performed_by` (uuid, not null) - user ID who performed the action
      - `performed_by_name` (text, not null) - cached user full name
      - `company_id` (uuid, nullable) - related company if applicable
      - `created_at` (timestamptz) - when the action occurred

  2. Indexes
    - `created_at DESC` for fast pagination
    - `table_name` for filtering by affected table
    - `module` for filtering by module category
    - `performed_by` for filtering by user

  3. Security
    - RLS enabled
    - Policy: authenticated users with admin/accounting/full_access can view
    - Insert policy: all authenticated users can insert audit entries
*/

CREATE TABLE IF NOT EXISTS audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
  module text NOT NULL CHECK (module IN ('configuration', 'requests', 'approvals', 'p2p')),
  description text DEFAULT '',
  old_values jsonb DEFAULT NULL,
  new_values jsonb DEFAULT NULL,
  performed_by uuid NOT NULL,
  performed_by_name text NOT NULL DEFAULT '',
  company_id uuid DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_table_name ON audit_trail (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_trail_module ON audit_trail (module);
CREATE INDEX IF NOT EXISTS idx_audit_trail_performed_by ON audit_trail (performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_trail_company_id ON audit_trail (company_id);

ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

-- All authenticated users can insert audit entries (logging should not fail)
CREATE POLICY "Authenticated users can insert audit entries"
  ON audit_trail
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = performed_by);

-- Select policy: users with appropriate roles/permissions can view
CREATE POLICY "Users with audit trail permission can view entries"
  ON audit_trail
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND (
        up.role = 'admin'
        OR EXISTS (
          SELECT 1 FROM roles r
          JOIN role_permissions rp ON rp.role_id = r.id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE r.name = up.role
          AND (p.name = 'config_audit_trail' OR r.has_full_access = true)
        )
      )
    )
  );