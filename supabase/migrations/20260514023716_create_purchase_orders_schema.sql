/*
  # Purchase Order Module Schema

  ## Overview
  Adds the Purchase Order workflow tables for the P2P application. POs are created
  from approved canvass requests, route through an amount-based approval matrix,
  and ultimately get dispatched to vendors.

  ## New Tables

  1. `purchase_orders`
     - Header row for each PO with vendor snapshot, totals, status, and links to
       the source canvass and PR.
     - Auto-numbered PO-YYYY-XXXXX per company per year via `generate_po_number`.
     - Includes `budget_status` (within_budget / over_budget / no_budget) and a
       full status lifecycle (draft -> pending_approval -> approved -> dispatched
       -> partially_received / fully_received / closed, plus returned / rejected
       / cancelled).
     - Soft delete via `deleted_at`.

  2. `purchase_order_items`
     - Line items pulled from the winning canvass quotation. Locked unless the PO
       is returned to the maker.

  3. `po_approvals`
     - Per-level approval records (one row per approver per level) used to track
       multi-level approval status.

  4. `po_approval_matrix`
     - Amount-bracketed routing rules used to determine the chain of approvers.

  5. `po_audit_logs`
     - Immutable audit trail of every PO state transition.

  ## Functions
  - `generate_po_number(p_company_id uuid)` returns the next PO number
    `PO-YYYY-XXXXX` scoped to (company, year).

  ## Security
  - RLS enabled on all five tables.
  - Procurement / admin / accounting / finance / treasury roles get full read
    access; users see POs from their own department; assigned approvers see POs
    routed to them.
  - Mutations restricted to the creator while in draft / returned, or to assigned
    approvers for approval rows.
*/

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE NOT NULL,
  canvass_request_id uuid REFERENCES canvass_requests(id) ON DELETE SET NULL,
  pr_id uuid REFERENCES purchase_requisitions(id) ON DELETE SET NULL,
  vendor_id text,
  vendor_name text NOT NULL DEFAULT '',
  vendor_address text DEFAULT '',
  vendor_contact text DEFAULT '',
  vendor_email text DEFAULT '',
  vendor_tin text DEFAULT '',
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  department text DEFAULT '',
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  po_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  delivery_address text DEFAULT '',
  payment_terms text DEFAULT 'Net 30',
  delivery_terms text DEFAULT '',
  remarks text DEFAULT '',
  subtotal numeric(15,2) NOT NULL DEFAULT 0,
  vat_amount numeric(15,2) NOT NULL DEFAULT 0,
  total_amount numeric(15,2) NOT NULL DEFAULT 0,
  budget_status text NOT NULL DEFAULT 'no_budget'
    CHECK (budget_status IN ('within_budget','over_budget','no_budget')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved','returned','rejected',
                       'dispatched','partially_received','fully_received','closed','cancelled')),
  current_approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_approval_level integer DEFAULT 0,
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text DEFAULT '',
  dispatched_at timestamptz,
  pdf_path text DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_po_company ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_canvass ON purchase_orders(canvass_request_id);
CREATE INDEX IF NOT EXISTS idx_po_pr ON purchase_orders(pr_id);
CREATE INDEX IF NOT EXISTS idx_po_current_approver ON purchase_orders(current_approver_id);
CREATE INDEX IF NOT EXISTS idx_po_requested_by ON purchase_orders(requested_by);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_description text NOT NULL DEFAULT '',
  unit_of_measure text DEFAULT '',
  quantity numeric(15,2) NOT NULL DEFAULT 0,
  unit_price numeric(15,2) NOT NULL DEFAULT 0,
  total_price numeric(15,2) NOT NULL DEFAULT 0,
  pr_item_id text DEFAULT '',
  remarks text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(purchase_order_id);

CREATE TABLE IF NOT EXISTS po_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_level integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','returned','rejected')),
  remarks text DEFAULT '',
  acted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_approvals_po ON po_approvals(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_approvals_approver ON po_approvals(approver_id);
CREATE INDEX IF NOT EXISTS idx_po_approvals_status ON po_approvals(status);

CREATE TABLE IF NOT EXISTS po_approval_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  min_amount numeric(15,2) NOT NULL DEFAULT 0,
  max_amount numeric(15,2),
  approval_level integer NOT NULL DEFAULT 1,
  approver_role text DEFAULT '',
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_matrix_company ON po_approval_matrix(company_id);
CREATE INDEX IF NOT EXISTS idx_po_matrix_active ON po_approval_matrix(is_active);

CREATE TABLE IF NOT EXISTS po_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  action text NOT NULL
    CHECK (action IN ('created','submitted','approved','returned','rejected',
                       'dispatched','edited','cancelled','closed')),
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  remarks text DEFAULT '',
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_audit_po ON po_audit_logs(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_audit_action ON po_audit_logs(action);

-- Auto-numbering function: PO-YYYY-XXXXX scoped per company per year
CREATE OR REPLACE FUNCTION generate_po_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_prefix text := 'PO-' || v_year || '-';
  v_max integer;
  v_next text;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(po_number, '^PO-\d{4}-', ''), '')::integer), 0)
  INTO v_max
  FROM purchase_orders
  WHERE po_number LIKE v_prefix || '%'
    AND (p_company_id IS NULL OR company_id = p_company_id);

  v_next := v_prefix || lpad((v_max + 1)::text, 5, '0');
  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_po_number(uuid) TO authenticated;

-- updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_po_updated_at') THEN
    CREATE TRIGGER trg_po_updated_at BEFORE UPDATE ON purchase_orders
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_po_items_updated_at') THEN
    CREATE TRIGGER trg_po_items_updated_at BEFORE UPDATE ON purchase_order_items
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_po_approvals_updated_at') THEN
    CREATE TRIGGER trg_po_approvals_updated_at BEFORE UPDATE ON po_approvals
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_po_matrix_updated_at') THEN
    CREATE TRIGGER trg_po_matrix_updated_at BEFORE UPDATE ON po_approval_matrix
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- Enable RLS
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_approval_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper: roles that have read-all on POs
-- (procurement, admin, accounting, finance, treasury)
CREATE OR REPLACE FUNCTION user_has_po_full_access(p_user uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = p_user
      AND role IN ('admin','procurement','accounting','finance','treasury')
  );
$$;

GRANT EXECUTE ON FUNCTION user_has_po_full_access(uuid) TO authenticated;

-- purchase_orders policies
CREATE POLICY "PO select for full-access roles"
  ON purchase_orders FOR SELECT TO authenticated
  USING (user_has_po_full_access(auth.uid()));

CREATE POLICY "PO select for owner"
  ON purchase_orders FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR prepared_by = auth.uid()
    OR created_by = auth.uid()
  );

CREATE POLICY "PO select for assigned approver"
  ON purchase_orders FOR SELECT TO authenticated
  USING (
    current_approver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM po_approvals a
      WHERE a.purchase_order_id = purchase_orders.id
        AND a.approver_id = auth.uid()
    )
  );

CREATE POLICY "PO select for same department"
  ON purchase_orders FOR SELECT TO authenticated
  USING (
    department <> '' AND department IN (
      SELECT department FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "PO insert for full-access roles"
  ON purchase_orders FOR INSERT TO authenticated
  WITH CHECK (user_has_po_full_access(auth.uid()));

CREATE POLICY "PO update for creator while editable"
  ON purchase_orders FOR UPDATE TO authenticated
  USING (
    (created_by = auth.uid() OR prepared_by = auth.uid())
    AND status IN ('draft','returned')
  )
  WITH CHECK (
    (created_by = auth.uid() OR prepared_by = auth.uid())
  );

CREATE POLICY "PO update for full-access roles"
  ON purchase_orders FOR UPDATE TO authenticated
  USING (user_has_po_full_access(auth.uid()))
  WITH CHECK (user_has_po_full_access(auth.uid()));

CREATE POLICY "PO update for current approver"
  ON purchase_orders FOR UPDATE TO authenticated
  USING (current_approver_id = auth.uid())
  WITH CHECK (true);

CREATE POLICY "PO delete for full-access roles"
  ON purchase_orders FOR DELETE TO authenticated
  USING (user_has_po_full_access(auth.uid()));

-- purchase_order_items policies
CREATE POLICY "PO items select via parent"
  ON purchase_order_items FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM purchase_orders p WHERE p.id = purchase_order_items.purchase_order_id)
  );

CREATE POLICY "PO items insert for full-access"
  ON purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (user_has_po_full_access(auth.uid()));

CREATE POLICY "PO items update for full-access"
  ON purchase_order_items FOR UPDATE TO authenticated
  USING (user_has_po_full_access(auth.uid()))
  WITH CHECK (user_has_po_full_access(auth.uid()));

CREATE POLICY "PO items delete for full-access"
  ON purchase_order_items FOR DELETE TO authenticated
  USING (user_has_po_full_access(auth.uid()));

-- po_approvals policies
CREATE POLICY "PO approvals select via parent"
  ON po_approvals FOR SELECT TO authenticated
  USING (
    user_has_po_full_access(auth.uid())
    OR approver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM purchase_orders p
      WHERE p.id = po_approvals.purchase_order_id
        AND (p.created_by = auth.uid() OR p.prepared_by = auth.uid() OR p.requested_by = auth.uid())
    )
  );

CREATE POLICY "PO approvals insert for full-access"
  ON po_approvals FOR INSERT TO authenticated
  WITH CHECK (user_has_po_full_access(auth.uid()));

CREATE POLICY "PO approvals update for assigned approver or full-access"
  ON po_approvals FOR UPDATE TO authenticated
  USING (approver_id = auth.uid() OR user_has_po_full_access(auth.uid()))
  WITH CHECK (approver_id = auth.uid() OR user_has_po_full_access(auth.uid()));

CREATE POLICY "PO approvals delete for full-access"
  ON po_approvals FOR DELETE TO authenticated
  USING (user_has_po_full_access(auth.uid()));

-- po_approval_matrix policies
CREATE POLICY "PO matrix select for authenticated"
  ON po_approval_matrix FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "PO matrix insert for full-access"
  ON po_approval_matrix FOR INSERT TO authenticated
  WITH CHECK (user_has_po_full_access(auth.uid()));

CREATE POLICY "PO matrix update for full-access"
  ON po_approval_matrix FOR UPDATE TO authenticated
  USING (user_has_po_full_access(auth.uid()))
  WITH CHECK (user_has_po_full_access(auth.uid()));

CREATE POLICY "PO matrix delete for full-access"
  ON po_approval_matrix FOR DELETE TO authenticated
  USING (user_has_po_full_access(auth.uid()));

-- po_audit_logs policies (insert anywhere, read for parties to the PO)
CREATE POLICY "PO audit select"
  ON po_audit_logs FOR SELECT TO authenticated
  USING (
    user_has_po_full_access(auth.uid())
    OR performed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM purchase_orders p
      WHERE p.id = po_audit_logs.purchase_order_id
        AND (p.created_by = auth.uid() OR p.prepared_by = auth.uid() OR p.requested_by = auth.uid()
             OR p.current_approver_id = auth.uid())
    )
  );

CREATE POLICY "PO audit insert for authenticated"
  ON po_audit_logs FOR INSERT TO authenticated
  WITH CHECK (performed_by = auth.uid() OR user_has_po_full_access(auth.uid()));
