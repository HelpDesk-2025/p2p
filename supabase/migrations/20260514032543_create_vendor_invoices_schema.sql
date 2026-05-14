/*
  # Vendor Invoice & 3-Way Matching Schema

  ## New Tables
  1. `vendor_invoices` - Header records for AP invoices, linked to PO and vendor
  2. `vendor_invoice_items` - Per-line invoice data with PO/GR comparison fields
  3. `vendor_invoice_attachments` - Supporting documents (SI, OR, BIR 2307)
  4. `matching_tolerance_settings` - Configurable tolerances for 3-way matching
  5. `invoice_audit_logs` - Full audit trail of invoice state transitions

  ## Functions
  - `generate_vendor_invoice_number(company_id)` - INV-YYYY-XXXXX per-year sequence
  - `compute_invoice_match(invoice_id)` - Evaluates each line against tolerances and updates header
  - `user_has_invoice_full_access(user_id)` - SECURITY DEFINER role check
  - `user_can_view_invoice(invoice_id, user_id)` - SECURITY DEFINER access check

  ## Security
  - RLS enabled on all five tables
  - Consolidated SELECT/INSERT/UPDATE/DELETE policies via SECURITY DEFINER helpers
  - Avoids RLS recursion against user_profiles
*/

-- =========================================================================
-- TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS vendor_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_ref_number text NOT NULL,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  po_number text NOT NULL DEFAULT '',
  goods_receipt_id uuid REFERENCES po_grns(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  vendor_id uuid,
  vendor_name text NOT NULL DEFAULT '',
  vendor_tin text NOT NULL DEFAULT '',
  invoice_number text NOT NULL DEFAULT '',
  invoice_date date,
  received_date date,
  due_date date,
  payment_terms text NOT NULL DEFAULT '',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  ewt_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  net_payable numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'PHP',
  match_status text NOT NULL DEFAULT 'pending_review' CHECK (match_status IN ('matched','mismatched','pending_review','resolved')),
  match_score numeric(5,2),
  resolution_notes text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_matching','matched','exception','posted','cancelled')),
  posted_at timestamptz,
  cancelled_at timestamptz,
  external_reference_id text,
  posted_payload jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (invoice_ref_number)
);

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_po ON vendor_invoices(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_status ON vendor_invoices(status);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_company ON vendor_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_vendor ON vendor_invoices(vendor_id);

CREATE TABLE IF NOT EXISTS vendor_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_invoice_id uuid NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
  po_item_id uuid REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  gr_item_id uuid REFERENCES po_grn_items(id) ON DELETE SET NULL,
  item_description text NOT NULL DEFAULT '',
  unit_of_measure text NOT NULL DEFAULT '',
  po_quantity numeric(14,4) NOT NULL DEFAULT 0,
  gr_accepted_quantity numeric(14,4) NOT NULL DEFAULT 0,
  previously_invoiced_quantity numeric(14,4) NOT NULL DEFAULT 0,
  invoiced_quantity numeric(14,4) NOT NULL DEFAULT 0,
  po_unit_price numeric(14,4) NOT NULL DEFAULT 0,
  invoiced_unit_price numeric(14,4) NOT NULL DEFAULT 0,
  invoiced_total_price numeric(14,2) NOT NULL DEFAULT 0,
  qty_match text NOT NULL DEFAULT 'match' CHECK (qty_match IN ('match','over','under','mismatch')),
  price_match text NOT NULL DEFAULT 'match' CHECK (price_match IN ('match','over','under','mismatch')),
  price_variance_amount numeric(14,4) NOT NULL DEFAULT 0,
  price_variance_percentage numeric(8,4) NOT NULL DEFAULT 0,
  qty_variance numeric(14,4) NOT NULL DEFAULT 0,
  item_match_status text NOT NULL DEFAULT 'matched' CHECK (item_match_status IN ('matched','mismatched')),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_invoice_items_invoice ON vendor_invoice_items(vendor_invoice_id);

CREATE TABLE IF NOT EXISTS vendor_invoice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_invoice_id uuid NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL DEFAULT '',
  file_size integer NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_invoice_attachments_invoice ON vendor_invoice_attachments(vendor_invoice_id);

CREATE TABLE IF NOT EXISTS matching_tolerance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tolerance_type text NOT NULL CHECK (tolerance_type IN ('price','quantity','override_threshold')),
  tolerance_percentage numeric(8,4) NOT NULL DEFAULT 0,
  tolerance_amount numeric(14,2),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_invoice_id uuid NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created','submitted','matched','exception_flagged','resolved','overridden','posted','cancelled','updated')),
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  remarks text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_audit_logs_invoice ON invoice_audit_logs(vendor_invoice_id);

-- Seed default tolerance rows if not present
INSERT INTO matching_tolerance_settings (tolerance_type, tolerance_percentage, tolerance_amount, is_active)
SELECT 'price', 5.00, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM matching_tolerance_settings WHERE tolerance_type = 'price');

INSERT INTO matching_tolerance_settings (tolerance_type, tolerance_percentage, tolerance_amount, is_active)
SELECT 'quantity', 0.00, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM matching_tolerance_settings WHERE tolerance_type = 'quantity');

INSERT INTO matching_tolerance_settings (tolerance_type, tolerance_percentage, tolerance_amount, is_active)
SELECT 'override_threshold', 5.00, 1000.00, true
WHERE NOT EXISTS (SELECT 1 FROM matching_tolerance_settings WHERE tolerance_type = 'override_threshold');

-- =========================================================================
-- HELPER FUNCTIONS
-- =========================================================================

CREATE OR REPLACE FUNCTION user_has_invoice_full_access(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM user_profiles WHERE id = p_user_id;
  RETURN v_role IN ('admin','accounting','finance','treasury','procurement');
END;
$$;

CREATE OR REPLACE FUNCTION user_can_view_invoice(p_invoice_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
BEGIN
  IF user_has_invoice_full_access(p_user_id) THEN
    RETURN true;
  END IF;
  SELECT created_by INTO v_creator FROM vendor_invoices WHERE id = p_invoice_id;
  RETURN v_creator = p_user_id;
END;
$$;

-- =========================================================================
-- AUTO-NUMBER FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION generate_vendor_invoice_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_seq int;
  v_ref text;
BEGIN
  SELECT COALESCE(MAX(CAST(split_part(invoice_ref_number, '-', 3) AS int)), 0) + 1
    INTO v_seq
    FROM vendor_invoices
    WHERE invoice_ref_number LIKE 'INV-' || v_year || '-%';

  v_ref := 'INV-' || v_year || '-' || lpad(v_seq::text, 5, '0');
  RETURN v_ref;
END;
$$;

-- =========================================================================
-- 3-WAY MATCH ENGINE
-- =========================================================================

CREATE OR REPLACE FUNCTION compute_invoice_match(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price_tol numeric;
  v_qty_tol numeric;
  v_total int := 0;
  v_matched int := 0;
  v_score numeric;
  v_has_mismatch boolean := false;
  r RECORD;
  v_qty_status text;
  v_price_status text;
  v_price_var_pct numeric;
  v_item_status text;
BEGIN
  SELECT COALESCE(tolerance_percentage, 0) INTO v_price_tol
    FROM matching_tolerance_settings WHERE tolerance_type = 'price' AND is_active = true LIMIT 1;
  v_price_tol := COALESCE(v_price_tol, 5.0);

  SELECT COALESCE(tolerance_percentage, 0) INTO v_qty_tol
    FROM matching_tolerance_settings WHERE tolerance_type = 'quantity' AND is_active = true LIMIT 1;
  v_qty_tol := COALESCE(v_qty_tol, 0.0);

  FOR r IN SELECT * FROM vendor_invoice_items WHERE vendor_invoice_id = p_invoice_id LOOP
    v_total := v_total + 1;

    -- Quantity check vs GR accepted (less previously invoiced)
    DECLARE
      v_target_qty numeric := GREATEST(r.gr_accepted_quantity - r.previously_invoiced_quantity, 0);
      v_qty_diff numeric := r.invoiced_quantity - v_target_qty;
      v_qty_diff_pct numeric := CASE WHEN v_target_qty > 0 THEN ABS(v_qty_diff) / v_target_qty * 100 ELSE CASE WHEN r.invoiced_quantity > 0 THEN 100 ELSE 0 END END;
    BEGIN
      IF v_qty_diff_pct <= v_qty_tol THEN
        v_qty_status := 'match';
      ELSIF v_qty_diff > 0 THEN
        v_qty_status := 'over';
      ELSE
        v_qty_status := 'under';
      END IF;
    END;

    -- Price check
    IF r.po_unit_price > 0 THEN
      v_price_var_pct := ABS(r.invoiced_unit_price - r.po_unit_price) / r.po_unit_price * 100;
    ELSE
      v_price_var_pct := CASE WHEN r.invoiced_unit_price > 0 THEN 100 ELSE 0 END;
    END IF;

    IF v_price_var_pct <= v_price_tol THEN
      v_price_status := 'match';
    ELSIF r.invoiced_unit_price > r.po_unit_price THEN
      v_price_status := 'over';
    ELSE
      v_price_status := 'under';
    END IF;

    IF v_qty_status = 'match' AND v_price_status = 'match' THEN
      v_item_status := 'matched';
      v_matched := v_matched + 1;
    ELSE
      v_item_status := 'mismatched';
      v_has_mismatch := true;
    END IF;

    UPDATE vendor_invoice_items
       SET qty_match = v_qty_status,
           price_match = v_price_status,
           qty_variance = r.invoiced_quantity - GREATEST(r.gr_accepted_quantity - r.previously_invoiced_quantity, 0),
           price_variance_amount = r.invoiced_unit_price - r.po_unit_price,
           price_variance_percentage = v_price_var_pct,
           item_match_status = v_item_status,
           updated_at = now()
     WHERE id = r.id;
  END LOOP;

  v_score := CASE WHEN v_total > 0 THEN (v_matched::numeric / v_total::numeric) * 100 ELSE 0 END;

  UPDATE vendor_invoices
     SET match_score = v_score,
         match_status = CASE WHEN v_has_mismatch THEN 'mismatched' ELSE 'matched' END,
         status = CASE
                    WHEN status IN ('posted','cancelled') THEN status
                    WHEN v_has_mismatch THEN 'exception'
                    ELSE 'matched'
                  END,
         updated_at = now()
   WHERE id = p_invoice_id;
END;
$$;

-- =========================================================================
-- RLS
-- =========================================================================

ALTER TABLE vendor_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_invoice_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_tolerance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_audit_logs ENABLE ROW LEVEL SECURITY;

-- vendor_invoices
DROP POLICY IF EXISTS "vi_select" ON vendor_invoices;
CREATE POLICY "vi_select" ON vendor_invoices FOR SELECT TO authenticated
  USING (user_has_invoice_full_access(auth.uid()) OR created_by = auth.uid());

DROP POLICY IF EXISTS "vi_insert" ON vendor_invoices;
CREATE POLICY "vi_insert" ON vendor_invoices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "vi_update" ON vendor_invoices;
CREATE POLICY "vi_update" ON vendor_invoices FOR UPDATE TO authenticated
  USING (user_has_invoice_full_access(auth.uid()) OR created_by = auth.uid())
  WITH CHECK (user_has_invoice_full_access(auth.uid()) OR created_by = auth.uid());

DROP POLICY IF EXISTS "vi_delete" ON vendor_invoices;
CREATE POLICY "vi_delete" ON vendor_invoices FOR DELETE TO authenticated
  USING (user_has_invoice_full_access(auth.uid()));

-- vendor_invoice_items
DROP POLICY IF EXISTS "vii_select" ON vendor_invoice_items;
CREATE POLICY "vii_select" ON vendor_invoice_items FOR SELECT TO authenticated
  USING (user_can_view_invoice(vendor_invoice_id, auth.uid()));

DROP POLICY IF EXISTS "vii_insert" ON vendor_invoice_items;
CREATE POLICY "vii_insert" ON vendor_invoice_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "vii_update" ON vendor_invoice_items;
CREATE POLICY "vii_update" ON vendor_invoice_items FOR UPDATE TO authenticated
  USING (user_can_view_invoice(vendor_invoice_id, auth.uid()))
  WITH CHECK (user_can_view_invoice(vendor_invoice_id, auth.uid()));

DROP POLICY IF EXISTS "vii_delete" ON vendor_invoice_items;
CREATE POLICY "vii_delete" ON vendor_invoice_items FOR DELETE TO authenticated
  USING (user_can_view_invoice(vendor_invoice_id, auth.uid()));

-- vendor_invoice_attachments
DROP POLICY IF EXISTS "via_select" ON vendor_invoice_attachments;
CREATE POLICY "via_select" ON vendor_invoice_attachments FOR SELECT TO authenticated
  USING (user_can_view_invoice(vendor_invoice_id, auth.uid()));

DROP POLICY IF EXISTS "via_insert" ON vendor_invoice_attachments;
CREATE POLICY "via_insert" ON vendor_invoice_attachments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "via_update" ON vendor_invoice_attachments;
CREATE POLICY "via_update" ON vendor_invoice_attachments FOR UPDATE TO authenticated
  USING (user_can_view_invoice(vendor_invoice_id, auth.uid()))
  WITH CHECK (user_can_view_invoice(vendor_invoice_id, auth.uid()));

DROP POLICY IF EXISTS "via_delete" ON vendor_invoice_attachments;
CREATE POLICY "via_delete" ON vendor_invoice_attachments FOR DELETE TO authenticated
  USING (user_can_view_invoice(vendor_invoice_id, auth.uid()));

-- matching_tolerance_settings
DROP POLICY IF EXISTS "mts_select" ON matching_tolerance_settings;
CREATE POLICY "mts_select" ON matching_tolerance_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "mts_insert" ON matching_tolerance_settings;
CREATE POLICY "mts_insert" ON matching_tolerance_settings FOR INSERT TO authenticated
  WITH CHECK (user_has_invoice_full_access(auth.uid()));

DROP POLICY IF EXISTS "mts_update" ON matching_tolerance_settings;
CREATE POLICY "mts_update" ON matching_tolerance_settings FOR UPDATE TO authenticated
  USING (user_has_invoice_full_access(auth.uid()))
  WITH CHECK (user_has_invoice_full_access(auth.uid()));

DROP POLICY IF EXISTS "mts_delete" ON matching_tolerance_settings;
CREATE POLICY "mts_delete" ON matching_tolerance_settings FOR DELETE TO authenticated
  USING (user_has_invoice_full_access(auth.uid()));

-- invoice_audit_logs
DROP POLICY IF EXISTS "ial_select" ON invoice_audit_logs;
CREATE POLICY "ial_select" ON invoice_audit_logs FOR SELECT TO authenticated
  USING (user_can_view_invoice(vendor_invoice_id, auth.uid()));

DROP POLICY IF EXISTS "ial_insert" ON invoice_audit_logs;
CREATE POLICY "ial_insert" ON invoice_audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
