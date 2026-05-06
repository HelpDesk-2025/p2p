/*
  # Full-Access Roles and Company Page Permissions

  1. Changes
    - Add `has_full_access` boolean (default false) to `public.roles`. A role
      with this flag bypasses per-permission checks and grants access to all
      pages and subpages.
    - Create `public.company_page_permissions` to gate every page/subpage per
      company (supersedes `company_request_form_permissions` for the wider
      nav surface).
    - Seed all existing companies with every known page enabled so current
      behavior is preserved.

  2. Security
    - Enable RLS on `company_page_permissions`.
    - Authenticated users can SELECT (needed by Layout to filter sidebar).
    - Admins (user_profiles.role = 'admin') can INSERT, UPDATE, DELETE.
*/

-- 1. Full access flag on roles
ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS has_full_access boolean NOT NULL DEFAULT false;

-- 2. Company page permissions table
CREATE TABLE IF NOT EXISTS public.company_page_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  page_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, page_key)
);

CREATE INDEX IF NOT EXISTS idx_company_page_permissions_company
  ON public.company_page_permissions(company_id);

ALTER TABLE public.company_page_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read company page permissions" ON public.company_page_permissions;
CREATE POLICY "Authenticated users can read company page permissions"
  ON public.company_page_permissions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert company page permissions" ON public.company_page_permissions;
CREATE POLICY "Admins can insert company page permissions"
  ON public.company_page_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND lower(up.role) = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update company page permissions" ON public.company_page_permissions;
CREATE POLICY "Admins can update company page permissions"
  ON public.company_page_permissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND lower(up.role) = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND lower(up.role) = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete company page permissions" ON public.company_page_permissions;
CREATE POLICY "Admins can delete company page permissions"
  ON public.company_page_permissions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND lower(up.role) = 'admin'
    )
  );

-- 3. Seed every company with every known page enabled
DO $$
DECLARE
  v_page text;
  v_pages text[] := ARRAY[
    'dashboard',
    'pr-request',
    'canvass-request',
    'petty-cash-request',
    'cash-advance-request',
    'reimbursement-request',
    'pr-approval',
    'canvass-approval',
    'petty-cash-approval',
    'cash-advance-approval',
    'reimbursement-approval',
    'sme-approval',
    'petty-cash-release',
    'procurement-checking',
    'approval-ledger',
    'approved-rejected',
    'config-approvers',
    'config-users',
    'config-impersonation',
    'config-checklists',
    'config-payment-modes',
    'config-holidays',
    'config-companies',
    'config-approval-flows',
    'config-number-series',
    'config-vendors-items',
    'config-smtp',
    'config-expense-types',
    'config-withholding-tax-rates',
    'config-roles-permissions',
    'config-announcements'
  ];
BEGIN
  FOREACH v_page IN ARRAY v_pages LOOP
    INSERT INTO public.company_page_permissions (company_id, page_key, enabled)
    SELECT c.id, v_page, true
    FROM public.companies c
    ON CONFLICT (company_id, page_key) DO NOTHING;
  END LOOP;
END $$;

-- 4. Mirror existing company_request_form_permissions into new table
INSERT INTO public.company_page_permissions (company_id, page_key, enabled)
SELECT
  crfp.company_id,
  CASE crfp.form_type
    WHEN 'purchase_requisition' THEN 'pr-request'
    WHEN 'canvass' THEN 'canvass-request'
    WHEN 'petty_cash' THEN 'petty-cash-request'
    WHEN 'cash_advance' THEN 'cash-advance-request'
    WHEN 'reimbursement' THEN 'reimbursement-request'
    ELSE NULL
  END AS page_key,
  crfp.enabled
FROM public.company_request_form_permissions crfp
WHERE CASE crfp.form_type
    WHEN 'purchase_requisition' THEN 'pr-request'
    WHEN 'canvass' THEN 'canvass-request'
    WHEN 'petty_cash' THEN 'petty-cash-request'
    WHEN 'cash_advance' THEN 'cash-advance-request'
    WHEN 'reimbursement' THEN 'reimbursement-request'
    ELSE NULL
  END IS NOT NULL
ON CONFLICT (company_id, page_key) DO UPDATE
SET enabled = EXCLUDED.enabled,
    updated_at = now();
