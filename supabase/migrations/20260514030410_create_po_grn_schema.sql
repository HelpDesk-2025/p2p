/*
  # Purchase Order Goods Receipt Note (GRN) Module

  ## Overview
  Adds the Goods Receipt workflow against Purchase Orders. Tables are prefixed
  with `po_` to avoid colliding with the existing canvass-side `goods_receipts`
  table.

  ## New Tables
  1. `po_grns` - GR header (auto-numbered GR-YYYY-XXXXX, status, dates, etc.).
  2. `po_grn_items` - Per-line received / accepted / rejected quantities.
  3. `po_grn_attachments` - File metadata (DR scan, photos, inspection report).
  4. `po_grn_audit_logs` - Audit trail (created / confirmed / cancelled / edited).

  ## Functions
  - `generate_po_grn_number(p_company_id uuid)` - next GR-YYYY-XXXXX per year.
  - `recompute_po_receipt_status(p_po_id uuid)` - sets parent PO status to
    fully_received or partially_received based on confirmed accepted quantities.
  - `user_has_po_grn_full_access(uuid)` and `user_can_view_po_grn(uuid, uuid)`
    SECURITY DEFINER helpers used by RLS to avoid recursion against
    user_profiles.

  ## Security
  - RLS enabled on all four tables.
  - Full access roles: admin, procurement, accounting, finance, treasury,
    receiving. Creators / receivers / inspectors see their own GRs.
*/

CREATE TABLE IF NOT EXISTS po_grns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_number text UNIQUE NOT NULL,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  po_number text NOT NULL DEFAULT '',
  vendor_id text DEFAULT '',
  vendor_name text NOT NULL DEFAULT '',
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  inspected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  delivery_receipt_number text DEFAULT '',
  receipt_type text NOT NULL DEFAULT 'partial' CHECK (receipt_type IN ('full','partial')),
  overall_condition text NOT NULL DEFAULT 'good' CHECK (overall_condition IN ('good','damaged','mixed')),
  warehouse_location text DEFAULT '',
  remarks text DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','cancelled')),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_po_grns_po ON po_grns(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_grns_status ON po_grns(status);
CREATE INDEX IF NOT EXISTS idx_po_grns_received_by ON po_grns(received_by);
CREATE INDEX IF NOT EXISTS idx_po_grns_company ON po_grns(company_id);
CREATE INDEX IF NOT EXISTS idx_po_grns_receipt_date ON po_grns(receipt_date);

CREATE TABLE IF NOT EXISTS po_grn_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_grn_id uuid NOT NULL REFERENCES po_grns(id) ON DELETE CASCADE,
  po_item_id uuid NOT NULL REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
  item_description text NOT NULL DEFAULT '',
  unit_of_measure text DEFAULT '',
  ordered_quantity integer NOT NULL DEFAULT 0,
  previously_received_quantity integer NOT NULL DEFAULT 0,
  received_quantity integer NOT NULL DEFAULT 0,
  accepted_quantity integer NOT NULL DEFAULT 0,
  rejected_quantity integer NOT NULL DEFAULT 0,
  rejection_reason text DEFAULT '',
  condition text NOT NULL DEFAULT 'good'
    CHECK (condition IN ('good','damaged','defective','wrong_item','short_delivery')),
  remarks text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_grn_items_grn ON po_grn_items(po_grn_id);
CREATE INDEX IF NOT EXISTS idx_po_grn_items_po_item ON po_grn_items(po_item_id);

CREATE TABLE IF NOT EXISTS po_grn_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_grn_id uuid NOT NULL REFERENCES po_grns(id) ON DELETE CASCADE,
  file_name text NOT NULL DEFAULT '',
  file_path text NOT NULL DEFAULT '',
  file_type text DEFAULT '',
  file_size integer DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_grn_attachments_grn ON po_grn_attachments(po_grn_id);

CREATE TABLE IF NOT EXISTS po_grn_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_grn_id uuid NOT NULL REFERENCES po_grns(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created','confirmed','cancelled','edited')),
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  remarks text DEFAULT '',
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_grn_audit_grn ON po_grn_audit_logs(po_grn_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_po_grns_updated_at') THEN
    CREATE TRIGGER trg_po_grns_updated_at BEFORE UPDATE ON po_grns
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_po_grn_items_updated_at') THEN
    CREATE TRIGGER trg_po_grn_items_updated_at BEFORE UPDATE ON po_grn_items
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION generate_po_grn_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_prefix text := 'GR-' || v_year || '-';
  v_max integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(gr_number, '^GR-\d{4}-', ''), '')::integer), 0)
  INTO v_max
  FROM po_grns
  WHERE gr_number LIKE v_prefix || '%'
    AND (p_company_id IS NULL OR company_id = p_company_id);
  RETURN v_prefix || lpad((v_max + 1)::text, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION generate_po_grn_number(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION recompute_po_receipt_status(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all boolean;
  v_any boolean;
  v_status text;
BEGIN
  SELECT status INTO v_status FROM purchase_orders WHERE id = p_po_id;
  IF v_status IN ('cancelled','rejected','closed') THEN
    RETURN;
  END IF;

  SELECT bool_and(received_total >= ordered_qty), bool_or(received_total > 0)
    INTO v_all, v_any
  FROM (
    SELECT poi.id,
           poi.quantity::int AS ordered_qty,
           COALESCE((
             SELECT SUM(gri.accepted_quantity)::int
             FROM po_grn_items gri
             JOIN po_grns g ON g.id = gri.po_grn_id
             WHERE gri.po_item_id = poi.id AND g.status = 'confirmed'
           ), 0) AS received_total
    FROM purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
  ) t;

  IF v_all THEN
    UPDATE purchase_orders SET status = 'fully_received' WHERE id = p_po_id;
  ELSIF v_any THEN
    UPDATE purchase_orders SET status = 'partially_received' WHERE id = p_po_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_po_receipt_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION user_has_po_grn_full_access(p_user uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = p_user
      AND role IN ('admin','procurement','accounting','finance','treasury','receiving')
  );
$$;

GRANT EXECUTE ON FUNCTION user_has_po_grn_full_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION user_can_view_po_grn(p_grn_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match boolean;
BEGIN
  IF p_user IS NULL THEN RETURN false; END IF;
  IF user_has_po_grn_full_access(p_user) THEN RETURN true; END IF;
  SELECT EXISTS (
    SELECT 1 FROM po_grns g
    WHERE g.id = p_grn_id
      AND (g.created_by = p_user OR g.received_by = p_user OR g.inspected_by = p_user)
  ) INTO v_match;
  RETURN COALESCE(v_match, false);
END;
$$;

GRANT EXECUTE ON FUNCTION user_can_view_po_grn(uuid, uuid) TO authenticated;

ALTER TABLE po_grns ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_grn_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_grn_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_grn_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_grns select"
  ON po_grns FOR SELECT TO authenticated
  USING (user_can_view_po_grn(id, auth.uid()));

CREATE POLICY "po_grns insert for full access"
  ON po_grns FOR INSERT TO authenticated
  WITH CHECK (user_has_po_grn_full_access(auth.uid()));

CREATE POLICY "po_grns update for creator while draft"
  ON po_grns FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status = 'draft')
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "po_grns update for full access"
  ON po_grns FOR UPDATE TO authenticated
  USING (user_has_po_grn_full_access(auth.uid()))
  WITH CHECK (user_has_po_grn_full_access(auth.uid()));

CREATE POLICY "po_grns delete for full access"
  ON po_grns FOR DELETE TO authenticated
  USING (user_has_po_grn_full_access(auth.uid()));

CREATE POLICY "po_grn_items select via parent"
  ON po_grn_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM po_grns g
      WHERE g.id = po_grn_items.po_grn_id
        AND user_can_view_po_grn(g.id, auth.uid())
    )
  );

CREATE POLICY "po_grn_items insert for full access"
  ON po_grn_items FOR INSERT TO authenticated
  WITH CHECK (user_has_po_grn_full_access(auth.uid()));

CREATE POLICY "po_grn_items update for full access"
  ON po_grn_items FOR UPDATE TO authenticated
  USING (user_has_po_grn_full_access(auth.uid()))
  WITH CHECK (user_has_po_grn_full_access(auth.uid()));

CREATE POLICY "po_grn_items delete for full access"
  ON po_grn_items FOR DELETE TO authenticated
  USING (user_has_po_grn_full_access(auth.uid()));

CREATE POLICY "po_grn_att select via parent"
  ON po_grn_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM po_grns g
      WHERE g.id = po_grn_attachments.po_grn_id
        AND user_can_view_po_grn(g.id, auth.uid())
    )
  );

CREATE POLICY "po_grn_att insert for authenticated"
  ON po_grn_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() OR user_has_po_grn_full_access(auth.uid()));

CREATE POLICY "po_grn_att update for full access"
  ON po_grn_attachments FOR UPDATE TO authenticated
  USING (user_has_po_grn_full_access(auth.uid()))
  WITH CHECK (user_has_po_grn_full_access(auth.uid()));

CREATE POLICY "po_grn_att delete for full access"
  ON po_grn_attachments FOR DELETE TO authenticated
  USING (user_has_po_grn_full_access(auth.uid()));

CREATE POLICY "po_grn_audit select via parent"
  ON po_grn_audit_logs FOR SELECT TO authenticated
  USING (
    user_has_po_grn_full_access(auth.uid())
    OR performed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM po_grns g
      WHERE g.id = po_grn_audit_logs.po_grn_id
        AND user_can_view_po_grn(g.id, auth.uid())
    )
  );

CREATE POLICY "po_grn_audit insert for authenticated"
  ON po_grn_audit_logs FOR INSERT TO authenticated
  WITH CHECK (performed_by = auth.uid() OR user_has_po_grn_full_access(auth.uid()));
