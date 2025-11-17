/*
  # Make company_id nullable in approval_flows

  1. Changes
    - Make company_id nullable in approval_flows table since we now use approval_flow_setup_id
    - Make department_id nullable (it already is, but being explicit)
    - The new structure uses approval_flow_setup_id to link to the parent setup
    - Old flows without approval_flow_setup_id can still have company_id/department_id

  2. Important Notes
    - This allows the new approval flow setup system to work without company_id
    - Legacy flows can still exist with company_id for backwards compatibility
*/

-- Make company_id nullable in approval_flows table
DO $$
BEGIN
  ALTER TABLE approval_flows ALTER COLUMN company_id DROP NOT NULL;
END $$;
