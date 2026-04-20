/*
  # Add Petty Cash Release permission

  1. New Data
    - Adds 'Petty Cash Release' permission to the `permissions` table
    - Module: `petty_cash_release`
    - This permission controls access to the Petty Cash Release page
      where treasury/accounting users can release approved petty cash requests

  2. Important Notes
    - This permission must be assigned to appropriate roles via the
      Roles & Permissions configuration page
    - The page shows all fully-approved petty cash requests that have not
      yet been released (received_at is null)
*/

INSERT INTO permissions (name, description, module, is_active)
SELECT 'Petty Cash Release', 'Access to release approved petty cash requests', 'petty_cash_release', true
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE name = 'Petty Cash Release'
);
