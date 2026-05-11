/*
  # Add Payment Vendors with Terms

  1. New Table
    - `payment_vendors`
      - `id` (uuid, pk)
      - `name` (text, unique) - vendor name
      - `terms` (text) - payment terms e.g. "Net 30", "Net 15", "COD"
      - `notes` (text) - optional notes
      - `created_at`, `created_by`

  2. Modified Table
    - `payments`: added `vendor_id`, `vendor_name`, `vendor_terms` columns to capture
      the selected vendor and their terms at payment time.

  3. Security
    - RLS enabled on `payment_vendors`
    - Authenticated users can read and insert vendors
    - Only admins can update/delete vendors
*/

CREATE TABLE IF NOT EXISTS payment_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  terms text NOT NULL DEFAULT 'Net 30',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE payment_vendors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payment_vendors' AND policyname='Authenticated can read vendors') THEN
    CREATE POLICY "Authenticated can read vendors" ON payment_vendors FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payment_vendors' AND policyname='Authenticated can insert vendors') THEN
    CREATE POLICY "Authenticated can insert vendors" ON payment_vendors FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payment_vendors' AND policyname='Admins can update vendors') THEN
    CREATE POLICY "Admins can update vendors" ON payment_vendors FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payment_vendors' AND policyname='Admins can delete vendors') THEN
    CREATE POLICY "Admins can delete vendors" ON payment_vendors FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='vendor_id') THEN
    ALTER TABLE payments ADD COLUMN vendor_id uuid REFERENCES payment_vendors(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='vendor_name') THEN
    ALTER TABLE payments ADD COLUMN vendor_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='vendor_terms') THEN
    ALTER TABLE payments ADD COLUMN vendor_terms text;
  END IF;
END $$;
