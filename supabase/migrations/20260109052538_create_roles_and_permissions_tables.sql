/*
  # Create Roles and Permissions Tables

  1. New Tables
    - `roles`
      - `id` (uuid, primary key)
      - `name` (text, unique) - Role name (e.g., 'admin', 'approver', 'requester')
      - `description` (text) - Role description
      - `is_active` (boolean) - Whether the role is active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `permissions`
      - `id` (uuid, primary key)
      - `name` (text, unique) - Permission name (e.g., 'create_pr', 'approve_pr')
      - `description` (text) - Permission description
      - `module` (text) - Module/category (e.g., 'purchase_requisition', 'canvass', 'petty_cash')
      - `is_active` (boolean) - Whether the permission is active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `role_permissions`
      - `id` (uuid, primary key)
      - `role_id` (uuid, foreign key to roles)
      - `permission_id` (uuid, foreign key to permissions)
      - `created_at` (timestamptz)
      - Unique constraint on (role_id, permission_id)
  
  2. Security
    - Enable RLS on all tables
    - Add policies for admin users to manage roles and permissions
    - Add policies for authenticated users to read active roles and permissions
  
  3. Initial Data
    - Insert default roles (admin, approver, requester)
    - Insert default permissions for each module
    - Assign permissions to default roles
*/

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  module text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

-- Enable RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for roles table
CREATE POLICY "Admins can manage roles"
  ON roles FOR ALL
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

CREATE POLICY "Authenticated users can read active roles"
  ON roles FOR SELECT
  TO authenticated
  USING (is_active = true);

-- RLS Policies for permissions table
CREATE POLICY "Admins can manage permissions"
  ON permissions FOR ALL
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

CREATE POLICY "Authenticated users can read active permissions"
  ON permissions FOR SELECT
  TO authenticated
  USING (is_active = true);

-- RLS Policies for role_permissions table
CREATE POLICY "Admins can manage role permissions"
  ON role_permissions FOR ALL
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

CREATE POLICY "Authenticated users can read role permissions"
  ON role_permissions FOR SELECT
  TO authenticated
  USING (true);

-- Insert default roles
INSERT INTO roles (name, description, is_active) VALUES
  ('admin', 'System administrator with full access', true),
  ('approver', 'User who can approve requests', true),
  ('requester', 'User who can create and submit requests', true)
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions
INSERT INTO permissions (name, description, module, is_active) VALUES
  -- Purchase Requisition permissions
  ('create_pr', 'Create purchase requisitions', 'purchase_requisition', true),
  ('view_pr', 'View purchase requisitions', 'purchase_requisition', true),
  ('edit_pr', 'Edit purchase requisitions', 'purchase_requisition', true),
  ('delete_pr', 'Delete purchase requisitions', 'purchase_requisition', true),
  ('approve_pr', 'Approve purchase requisitions', 'purchase_requisition', true),
  
  -- Canvass permissions
  ('create_canvass', 'Create canvass requests', 'canvass', true),
  ('view_canvass', 'View canvass requests', 'canvass', true),
  ('edit_canvass', 'Edit canvass requests', 'canvass', true),
  ('delete_canvass', 'Delete canvass requests', 'canvass', true),
  ('approve_canvass', 'Approve canvass requests', 'canvass', true),
  
  -- Petty Cash permissions
  ('create_petty_cash', 'Create petty cash requests', 'petty_cash', true),
  ('view_petty_cash', 'View petty cash requests', 'petty_cash', true),
  ('edit_petty_cash', 'Edit petty cash requests', 'petty_cash', true),
  ('delete_petty_cash', 'Delete petty cash requests', 'petty_cash', true),
  ('approve_petty_cash', 'Approve petty cash requests', 'petty_cash', true),
  
  -- Reimbursement permissions
  ('create_reimbursement', 'Create reimbursement requests', 'reimbursement', true),
  ('view_reimbursement', 'View reimbursement requests', 'reimbursement', true),
  ('edit_reimbursement', 'Edit reimbursement requests', 'reimbursement', true),
  ('delete_reimbursement', 'Delete reimbursement requests', 'reimbursement', true),
  ('approve_reimbursement', 'Approve reimbursement requests', 'reimbursement', true),
  
  -- Cash Advance permissions
  ('create_cash_advance', 'Create cash advance requests', 'cash_advance', true),
  ('view_cash_advance', 'View cash advance requests', 'cash_advance', true),
  ('edit_cash_advance', 'Edit cash advance requests', 'cash_advance', true),
  ('delete_cash_advance', 'Delete cash advance requests', 'cash_advance', true),
  ('approve_cash_advance', 'Approve cash advance requests', 'cash_advance', true),
  
  -- Configuration permissions
  ('manage_users', 'Manage user accounts', 'configuration', true),
  ('manage_companies', 'Manage companies', 'configuration', true),
  ('manage_approval_flows', 'Manage approval flows', 'configuration', true),
  ('manage_roles_permissions', 'Manage roles and permissions', 'configuration', true)
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign permissions to approver role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'approver'
  AND p.name IN (
    'view_pr', 'approve_pr',
    'view_canvass', 'approve_canvass',
    'view_petty_cash', 'approve_petty_cash',
    'view_reimbursement', 'approve_reimbursement',
    'view_cash_advance', 'approve_cash_advance'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign permissions to requester role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  r.id,
  p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'requester'
  AND p.name IN (
    'create_pr', 'view_pr', 'edit_pr',
    'create_canvass', 'view_canvass', 'edit_canvass',
    'create_petty_cash', 'view_petty_cash', 'edit_petty_cash',
    'create_reimbursement', 'view_reimbursement', 'edit_reimbursement',
    'create_cash_advance', 'view_cash_advance', 'edit_cash_advance'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;
