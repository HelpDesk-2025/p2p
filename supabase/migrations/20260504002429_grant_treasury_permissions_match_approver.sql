/*
  # Grant Treasury Role Permissions Similar to Approver

  1. Changes
    - Insert missing role_permissions for the 'treasury' role so it mirrors
      the 'approver' role's access (canvass_approval, pr_approval).
    - This also gives treasury users the same permission scope used by
      signature-related features (viewing approval records / approving flows)
      that approvers have.

  2. Security
    - Idempotent via ON CONFLICT DO NOTHING.
    - RLS on role_permissions remains unchanged.
*/

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'treasury'
  AND p.module IN ('canvass_approval', 'pr_approval')
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
