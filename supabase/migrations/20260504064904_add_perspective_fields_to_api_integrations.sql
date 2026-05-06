/*
  # Add perspective classification to api_integrations

  Adds fields to classify an API integration using the Perspective matrix:
    - perspective: 'consuming' or 'providing'
    - action: the specific action (Using/Calling, Exposing/Providing/Serving)
    - role: Consumer or Producer/Provider
    - direction: Pull (Request-Response) or Push (Webhook/Event-Driven)

  All fields are text and optional, with sensible defaults so existing rows remain valid.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_integrations' AND column_name = 'perspective'
  ) THEN
    ALTER TABLE public.api_integrations ADD COLUMN perspective text DEFAULT 'consuming';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_integrations' AND column_name = 'action'
  ) THEN
    ALTER TABLE public.api_integrations ADD COLUMN action text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_integrations' AND column_name = 'role_type'
  ) THEN
    ALTER TABLE public.api_integrations ADD COLUMN role_type text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_integrations' AND column_name = 'direction'
  ) THEN
    ALTER TABLE public.api_integrations ADD COLUMN direction text DEFAULT '';
  END IF;
END $$;
