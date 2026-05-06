/*
  # Grant CRUD on configuration tables via role permissions

  1. Helper function
    - `public.user_has_permission(p_perm text)` returns true when the current
      user's role has `has_full_access = true`, the user is an admin, or has the
      named permission assigned via `role_permissions` -> `permissions`.

  2. Policies added
    - For each configuration table we add SELECT/INSERT/UPDATE/DELETE policies
      that allow any authenticated user whose role has the corresponding
      `config_*` permission to perform CRUD. Existing admin/accounting policies
      are left in place (Postgres RLS combines policies with OR).

  3. Tables covered
    payment_modes, smtp_configurations, pr_checklists, holidays, companies,
    number_series, expense_types, withholding_tax_rates, roles, permissions,
    role_permissions, approval_flows, approval_flow_setups, announcements,
    ad_hoc_approvers (approvers), user_profiles (users/view-as).

  4. Security
    - Function is SECURITY DEFINER so it can read roles/permissions regardless
      of caller RLS. It only returns a boolean; no data leakage.
    - Policies still require authenticated users; anon is untouched.
*/

CREATE OR REPLACE FUNCTION public.user_has_permission(p_perm text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    LEFT JOIN public.roles r ON lower(r.name) = lower(up.role)
    LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
    LEFT JOIN public.permissions p ON p.id = rp.permission_id
    WHERE up.id = v_uid
      AND (
        lower(up.role) = 'admin'
        OR r.has_full_access = true
        OR p.name = p_perm
      )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_permission(text) TO authenticated;

-- Helper to (re)create four policies per table for a given permission name
DO $$
DECLARE
  v_tbl text;
  v_perm text;
  v_mapping record;
  v_select_name text;
  v_insert_name text;
  v_update_name text;
  v_delete_name text;
BEGIN
  FOR v_mapping IN
    SELECT * FROM (VALUES
      ('payment_modes',         'config_payment_modes'),
      ('smtp_configurations',   'config_smtp_settings'),
      ('pr_checklists',         'config_pr_checklists'),
      ('holidays',              'config_holidays'),
      ('companies',             'config_companies'),
      ('number_series',         'config_number_series'),
      ('expense_types',         'config_expense_types'),
      ('withholding_tax_rates', 'config_tax_rates'),
      ('roles',                 'config_roles_permissions'),
      ('permissions',           'config_roles_permissions'),
      ('role_permissions',      'config_roles_permissions'),
      ('approval_flows',        'config_approval_flows'),
      ('approval_flow_setups',  'config_approval_flows'),
      ('announcements',         'config_roles_permissions'),
      ('ad_hoc_approvers',      'config_approvers')
    ) AS t(tablename, perm)
  LOOP
    v_tbl  := v_mapping.tablename;
    v_perm := v_mapping.perm;

    v_select_name := 'Perm ' || v_perm || ' can select';
    v_insert_name := 'Perm ' || v_perm || ' can insert';
    v_update_name := 'Perm ' || v_perm || ' can update';
    v_delete_name := 'Perm ' || v_perm || ' can delete';

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_select_name, v_tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_insert_name, v_tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_update_name, v_tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_delete_name, v_tbl);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_has_permission(%L))',
      v_select_name, v_tbl, v_perm
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_has_permission(%L))',
      v_insert_name, v_tbl, v_perm
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_has_permission(%L)) WITH CHECK (public.user_has_permission(%L))',
      v_update_name, v_tbl, v_perm, v_perm
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_has_permission(%L))',
      v_delete_name, v_tbl, v_perm
    );
  END LOOP;
END $$;

-- Special: user_profiles management via config_users permission (update/insert)
DROP POLICY IF EXISTS "Perm config_users can update profiles" ON public.user_profiles;
CREATE POLICY "Perm config_users can update profiles"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (public.user_has_permission('config_users'))
  WITH CHECK (public.user_has_permission('config_users'));
