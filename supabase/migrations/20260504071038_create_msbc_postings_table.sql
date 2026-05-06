/*
  # Create MSBC postings table

  Stores records posted from Microsoft Business Central (MSBC) into P2P.
  Used by the API Integration page's "MSBC to P2P" setup.

  1. New table
    - `msbc_postings`
      - `id` (uuid, primary key)
      - `msbc_document_no` (text, required) - Document number from MSBC
      - `external_document_no` (text) - External document reference
      - `payment_type` (text) - Type of payment (e.g., Check, Cash, Wire)
      - `date_posted` (timestamptz) - Posting date/time
      - `notes` (text) - Optional free-text notes
      - `created_by` (uuid, FK auth.users)
      - `created_at`, `updated_at` timestamps

  2. Security
    - Enable RLS
    - Access restricted to admins or users holding the `config_api_integrations` permission
*/

CREATE TABLE IF NOT EXISTS public.msbc_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  msbc_document_no text NOT NULL,
  external_document_no text DEFAULT '',
  payment_type text DEFAULT '',
  date_posted timestamptz DEFAULT now(),
  notes text DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msbc_postings_document_no ON public.msbc_postings(msbc_document_no);
CREATE INDEX IF NOT EXISTS idx_msbc_postings_date_posted ON public.msbc_postings(date_posted DESC);

ALTER TABLE public.msbc_postings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View msbc postings" ON public.msbc_postings;
CREATE POLICY "View msbc postings"
  ON public.msbc_postings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  );

DROP POLICY IF EXISTS "Insert msbc postings" ON public.msbc_postings;
CREATE POLICY "Insert msbc postings"
  ON public.msbc_postings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  );

DROP POLICY IF EXISTS "Update msbc postings" ON public.msbc_postings;
CREATE POLICY "Update msbc postings"
  ON public.msbc_postings FOR UPDATE
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

DROP POLICY IF EXISTS "Delete msbc postings" ON public.msbc_postings;
CREATE POLICY "Delete msbc postings"
  ON public.msbc_postings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.is_active = true
        AND (up.role = 'admin' OR public.user_has_permission('Config - API Integrations'))
    )
  );
