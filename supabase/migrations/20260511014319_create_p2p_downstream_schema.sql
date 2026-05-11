/*
  # P2P Downstream: Receiving, Invoicing, Accounting Posting, Payments

  This migration adds the downstream P2P pipeline on top of the existing
  canvass_requests (PO) table.

  ## 1. New Tables
    - canvass_request_po_lines: explicit PO line items linked to canvass_requests
    - goods_receipts / goods_receipt_lines: GRN headers + lines
    - supplier_invoices / supplier_invoice_lines: AP invoice headers + lines
    - matching_cases: 3-way match results per invoice
    - ap_vouchers: posted vouchers per matched invoice
    - payments: treasury payments against vouchers
    - p2p_audit_logs: audit trail for downstream documents
    - p2p_settings: admin-configurable rules (singleton row)
    - canvass_request_status_ext: downstream status overlay per PO

  ## 2. Security
    Row Level Security is enabled on every table. Authenticated users can
    read/insert their own documents; admins can read and manage everything.
    Settings are readable by all authenticated users but only admins can
    update them.

  ## 3. Notes
    1. No qty_received / qty_invoiced columns are stored on po_lines; these
       values are computed from goods_receipt_lines and supplier_invoice_lines.
    2. Uniqueness on (supplier, invoice_number) prevents duplicate invoices.
    3. ap_vouchers has one row per invoice (unique invoice_id).
*/

-- =========================================================================
-- 1. P2P SETTINGS (singleton)
-- =========================================================================
CREATE TABLE IF NOT EXISTS p2p_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_tolerance_percent numeric(6,3) NOT NULL DEFAULT 0,
  price_tolerance_amount numeric(15,2) NOT NULL DEFAULT 0,
  quantity_rule_strict boolean NOT NULL DEFAULT true,
  allow_over_receiving boolean NOT NULL DEFAULT false,
  over_receiving_threshold_percent numeric(6,3) NOT NULL DEFAULT 0,
  require_grn_before_invoice boolean NOT NULL DEFAULT true,
  prevent_duplicate_invoice boolean NOT NULL DEFAULT true,
  require_proof_on_payment boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE p2p_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read p2p settings"
  ON p2p_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert p2p settings"
  ON p2p_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update p2p settings"
  ON p2p_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

INSERT INTO p2p_settings (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- =========================================================================
-- 2. PO LINES (explicit rows behind canvass_requests)
-- =========================================================================
CREATE TABLE IF NOT EXISTS canvass_request_po_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canvass_request_id uuid NOT NULL REFERENCES canvass_requests(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  item_description text NOT NULL DEFAULT '',
  specifications text DEFAULT '',
  qty_ordered numeric(15,4) NOT NULL DEFAULT 0,
  uom text DEFAULT '',
  unit_price numeric(15,4) NOT NULL DEFAULT 0,
  line_total numeric(15,2) GENERATED ALWAYS AS (qty_ordered * unit_price) STORED,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES user_profiles(id),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_lines_canvass ON canvass_request_po_lines(canvass_request_id);

ALTER TABLE canvass_request_po_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read po lines"
  ON canvass_request_po_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert po lines"
  ON canvass_request_po_lines FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Owner or admin update po lines"
  ON canvass_request_po_lines FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Owner or admin delete po lines"
  ON canvass_request_po_lines FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =========================================================================
-- 3. STATUS EXTENSION FOR CANVASS REQUESTS (downstream lifecycle overlay)
-- =========================================================================
CREATE TABLE IF NOT EXISTS canvass_request_status_ext (
  canvass_request_id uuid PRIMARY KEY REFERENCES canvass_requests(id) ON DELETE CASCADE,
  procurement_status text DEFAULT 'Open',
  receiving_status text DEFAULT 'Not_Received',
  invoice_status text DEFAULT 'Not_Invoiced',
  payment_status text DEFAULT 'Not_Paid',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE canvass_request_status_ext ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read status ext"
  ON canvass_request_status_ext FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write status ext"
  ON canvass_request_status_ext FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated update status ext"
  ON canvass_request_status_ext FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- =========================================================================
-- 4. GOODS RECEIPTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number text UNIQUE NOT NULL,
  canvass_request_id uuid NOT NULL REFERENCES canvass_requests(id) ON DELETE RESTRICT,
  supplier_id text,
  supplier_name text,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  received_by_user_id uuid REFERENCES user_profiles(id),
  delivery_receipt_no text NOT NULL,
  remarks text DEFAULT '',
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Submitted','Partial','Complete','Cancelled')),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES user_profiles(id),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grn_canvass ON goods_receipts(canvass_request_id);
CREATE INDEX IF NOT EXISTS idx_grn_status ON goods_receipts(status);

ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read grn"
  ON goods_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create grn"
  ON goods_receipts FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Owner or admin update grn"
  ON goods_receipts FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin delete grn"
  ON goods_receipts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS goods_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id uuid NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_line_id uuid NOT NULL REFERENCES canvass_request_po_lines(id) ON DELETE RESTRICT,
  qty_received numeric(15,4) NOT NULL DEFAULT 0,
  condition_status text NOT NULL DEFAULT 'Passed' CHECK (condition_status IN ('Passed','Failed')),
  remarks text DEFAULT '',
  serial_or_batch text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grn_lines_grn ON goods_receipt_lines(grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_lines_po ON goods_receipt_lines(po_line_id);

ALTER TABLE goods_receipt_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read grn lines"
  ON goods_receipt_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert grn lines"
  ON goods_receipt_lines FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated update grn lines"
  ON goods_receipt_lines FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated delete grn lines"
  ON goods_receipt_lines FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- =========================================================================
-- 5. SUPPLIER INVOICES
-- =========================================================================
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id text,
  supplier_name text,
  canvass_request_id uuid NOT NULL REFERENCES canvass_requests(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  received_date date DEFAULT CURRENT_DATE,
  subtotal numeric(15,2) NOT NULL DEFAULT 0,
  tax numeric(15,2) NOT NULL DEFAULT 0,
  total numeric(15,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Submitted','For_Matching','Matched','On_Hold','Cancelled')),
  attachment jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES user_profiles(id),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_supplier_number
  ON supplier_invoices(supplier_id, invoice_number)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_canvass ON supplier_invoices(canvass_request_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON supplier_invoices(status);

ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read invoices"
  ON supplier_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create invoices"
  ON supplier_invoices FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Owner or admin update invoices"
  ON supplier_invoices FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin delete invoices"
  ON supplier_invoices FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS supplier_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  po_line_id uuid NOT NULL REFERENCES canvass_request_po_lines(id) ON DELETE RESTRICT,
  qty_billed numeric(15,4) NOT NULL DEFAULT 0,
  unit_price numeric(15,4) NOT NULL DEFAULT 0,
  line_total numeric(15,2) GENERATED ALWAYS AS (qty_billed * unit_price) STORED,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON supplier_invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_po ON supplier_invoice_lines(po_line_id);

ALTER TABLE supplier_invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read invoice lines"
  ON supplier_invoice_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert invoice lines"
  ON supplier_invoice_lines FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated update invoice lines"
  ON supplier_invoice_lines FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated delete invoice lines"
  ON supplier_invoice_lines FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- =========================================================================
-- 6. MATCHING CASES
-- =========================================================================
CREATE TABLE IF NOT EXISTS matching_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  canvass_request_id uuid NOT NULL REFERENCES canvass_requests(id) ON DELETE CASCADE,
  match_status text NOT NULL DEFAULT 'On_Hold' CHECK (match_status IN ('Matched','On_Hold','Resolved')),
  variance_type text CHECK (variance_type IN ('Price','Quantity','Missing_GRN','Missing_PO','Other','None')) DEFAULT 'None',
  variance_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_notes text DEFAULT '',
  resolved_by_user_id uuid REFERENCES user_profiles(id),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matching_invoice ON matching_cases(invoice_id);

ALTER TABLE matching_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read matching"
  ON matching_cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert matching"
  ON matching_cases FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated update matching"
  ON matching_cases FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- =========================================================================
-- 7. AP VOUCHERS
-- =========================================================================
CREATE TABLE IF NOT EXISTS ap_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apv_number text UNIQUE NOT NULL,
  invoice_id uuid UNIQUE NOT NULL REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
  supplier_id text,
  supplier_name text,
  posting_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  gross_amount numeric(15,2) NOT NULL DEFAULT 0,
  withholding_tax numeric(15,2) NOT NULL DEFAULT 0,
  net_payable numeric(15,2) NOT NULL DEFAULT 0,
  gl_accounting jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Posted','For_Payment','Paid','On_Hold','Cancelled')),
  posted_by_user_id uuid REFERENCES user_profiles(id),
  posted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES user_profiles(id),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apv_status ON ap_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_apv_due ON ap_vouchers(due_date);

ALTER TABLE ap_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read apv"
  ON ap_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create apv"
  ON ap_vouchers FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Owner or admin update apv"
  ON ap_vouchers FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin delete apv"
  ON ap_vouchers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- =========================================================================
-- 8. PAYMENTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text UNIQUE NOT NULL,
  apv_id uuid NOT NULL REFERENCES ap_vouchers(id) ON DELETE RESTRICT,
  supplier_id text,
  supplier_name text,
  payment_method text NOT NULL DEFAULT 'BankTransfer' CHECK (payment_method IN ('BankTransfer','Check','Cash')),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_paid numeric(15,2) NOT NULL DEFAULT 0,
  reference_no text DEFAULT '',
  proof_attachment jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Submitted','Paid','Voided')),
  paid_by_user_id uuid REFERENCES user_profiles(id),
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES user_profiles(id),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_apv ON payments(apv_id);
CREATE INDEX IF NOT EXISTS idx_payment_status ON payments(status);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read payments"
  ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create payments"
  ON payments FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Owner or admin update payments"
  ON payments FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admin delete payments"
  ON payments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- =========================================================================
-- 9. AUDIT LOG
-- =========================================================================
CREATE TABLE IF NOT EXISTS p2p_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL CHECK (document_type IN ('GRN','Invoice','APV','Payment','Matching')),
  document_id uuid NOT NULL,
  action text NOT NULL,
  from_status text DEFAULT '',
  to_status text DEFAULT '',
  acted_by_user_id uuid REFERENCES user_profiles(id),
  acted_at timestamptz DEFAULT now(),
  comments text DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_document ON p2p_audit_logs(document_type, document_id);

ALTER TABLE p2p_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read audit"
  ON p2p_audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert audit"
  ON p2p_audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
