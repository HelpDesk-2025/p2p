/*
  # Create API Integrations configuration table

  1. New Table
    - `api_integrations`
      - `id` (uuid, primary key)
      - `name` (text, required) - label for the integration (e.g., "MSBC Production")
      - `provider` (text) - provider/system (e.g., "Microsoft Business Central")
      - `base_url` (text) - root URL of the API
      - `auth_type` (text) - one of 'none', 'api_key', 'bearer', 'basic', 'oauth2'
      - `api_key` (text) - stored secret value
      - `username` (text) - for basic auth
      - `password` (text) - for basic auth (sensitive)
      - `client_id` (text) - for oauth2
      - `client_secret` (text) - for oauth2
      - `tenant_id` (text) - optional tenant identifier
      - `headers` (jsonb) - additional default headers
      - `notes` (text) - free-form notes
      - `is_active` (boolean, default true)
      - `created_at`, `updated_at` timestamps

  2. Security
    - Enable RLS
    - Only admins and users with `config_roles_permissions` level access can manage.
      For simplicity and consistency with other config tables, admin-only writes,
      and authenticated read for users whose role has the
      "Config - API Integrations" permission (falls back to admin).
*/

CREATE TABLE IF NOT EXISTS public.api_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text DEFAULT '',
  base_url text DEFAULT '',
  auth_type text NOT NULL DEFAULT 'none',
  api_key text DEFAULT '',
  username text DEFAULT '',
  password text DEFAULT '',
  client_id text DEFAULT '',
  client_secret text DEFAULT '',
  tenant_id text DEFAULT '',
  headers jsonb DEFAULT '{}'::jsonb,
  notes text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.api_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view api integrations" ON public.api_integrations;
CREATE POLICY "Admins view api integrations"
  ON public.api_integrations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  );

DROP POLICY IF EXISTS "Admins insert api integrations" ON public.api_integrations;
CREATE POLICY "Admins insert api integrations"
  ON public.api_integrations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  );

DROP POLICY IF EXISTS "Admins update api integrations" ON public.api_integrations;
CREATE POLICY "Admins update api integrations"
  ON public.api_integrations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  );

DROP POLICY IF EXISTS "Admins delete api integrations" ON public.api_integrations;
CREATE POLICY "Admins delete api integrations"
  ON public.api_integrations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  );
