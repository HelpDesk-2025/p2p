/*
  # Add shared API token for MSBC ingestion

  Adds a project-wide API token configuration so the MSBC developer can
  POST to a public Edge Function without needing a Supabase user session.

  1. Changes
    - New table `msbc_api_tokens` to hold one-or-more shared tokens
      - `id` (uuid, pk)
      - `name` (text) - label for the token
      - `token` (text, unique) - the secret value used in `x-msbc-api-key` header
      - `is_active` (boolean)
      - `created_at`, `updated_at`

  2. Security
    - RLS enabled
    - Only admins or holders of `Config - API Integrations` permission may
      view/manage tokens. The Edge Function itself uses the service role key
      and is not subject to RLS.
*/

CREATE TABLE IF NOT EXISTS public.msbc_api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'MSBC Integration',
  token text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.msbc_api_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View msbc tokens" ON public.msbc_api_tokens;
CREATE POLICY "View msbc tokens"
  ON public.msbc_api_tokens FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  );

DROP POLICY IF EXISTS "Insert msbc tokens" ON public.msbc_api_tokens;
CREATE POLICY "Insert msbc tokens"
  ON public.msbc_api_tokens FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  );

DROP POLICY IF EXISTS "Update msbc tokens" ON public.msbc_api_tokens;
CREATE POLICY "Update msbc tokens"
  ON public.msbc_api_tokens FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  );

DROP POLICY IF EXISTS "Delete msbc tokens" ON public.msbc_api_tokens;
CREATE POLICY "Delete msbc tokens"
  ON public.msbc_api_tokens FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  );
