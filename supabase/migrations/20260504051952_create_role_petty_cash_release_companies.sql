/*
  # Role Petty Cash Release Company Scope

  1. New Table
    - `role_petty_cash_release_companies`
      - `id` (uuid, PK)
      - `role_id` (uuid, FK roles)
      - `company_id` (uuid, FK companies)
      - `created_at` (timestamptz)
      - Unique (role_id, company_id)

  2. Purpose
    - For roles that have the "Petty Cash Release" permission, this table
      defines which companies users assigned to that role can see/release
      petty cash requests for.

  3. Security
    - RLS enabled.
    - All authenticated users can SELECT (needed by client-side filter).
    - Only users with `config_roles_permissions` permission can INSERT/UPDATE/DELETE.
*/

CREATE TABLE IF NOT EXISTS public.role_petty_cash_release_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, company_id)
);

ALTER TABLE public.role_petty_cash_release_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read role pcr companies" ON public.role_petty_cash_release_companies;
CREATE POLICY "Authenticated can read role pcr companies"
  ON public.role_petty_cash_release_companies
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Perm config_roles_permissions can insert role pcr" ON public.role_petty_cash_release_companies;
CREATE POLICY "Perm config_roles_permissions can insert role pcr"
  ON public.role_petty_cash_release_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_permission('config_roles_permissions'));

DROP POLICY IF EXISTS "Perm config_roles_permissions can update role pcr" ON public.role_petty_cash_release_companies;
CREATE POLICY "Perm config_roles_permissions can update role pcr"
  ON public.role_petty_cash_release_companies
  FOR UPDATE
  TO authenticated
  USING (public.user_has_permission('config_roles_permissions'))
  WITH CHECK (public.user_has_permission('config_roles_permissions'));

DROP POLICY IF EXISTS "Perm config_roles_permissions can delete role pcr" ON public.role_petty_cash_release_companies;
CREATE POLICY "Perm config_roles_permissions can delete role pcr"
  ON public.role_petty_cash_release_companies
  FOR DELETE
  TO authenticated
  USING (public.user_has_permission('config_roles_permissions'));

CREATE INDEX IF NOT EXISTS idx_role_pcr_companies_role_id
  ON public.role_petty_cash_release_companies(role_id);
