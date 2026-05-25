/*
  # Add Audit Trail permission

  1. Changes
    - Adds a new `config_audit_trail` permission to the `permissions` table
    - Module: configuration
    - Allows access to the Audit Trail subpage under Configuration

  2. Notes
    - Only users with this permission (or full access roles) can view the audit trail
*/

INSERT INTO permissions (id, name, description, module, is_active)
VALUES (
  gen_random_uuid(),
  'config_audit_trail',
  'Access to view audit trail / activity logs',
  'configuration',
  true
)
ON CONFLICT DO NOTHING;