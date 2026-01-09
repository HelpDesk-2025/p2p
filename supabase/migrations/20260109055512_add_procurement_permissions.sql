/*
  # Add Procurement Module Permissions

  1. New Permissions
    - Add procurement module permissions:
      - `procurement.view` - View procurement checking page
      - `procurement.check` - Perform procurement checks
      - `procurement.manage` - Manage procurement settings

  2. Security
    - Uses existing RLS policies on permissions table
*/

-- Insert procurement permissions
INSERT INTO permissions (name, description, module, is_active)
VALUES
  ('procurement.view', 'View procurement checking page', 'procurement', true),
  ('procurement.check', 'Perform procurement checks on requests', 'procurement', true),
  ('procurement.manage', 'Manage procurement settings and configuration', 'procurement', true)
ON CONFLICT (name) DO NOTHING;