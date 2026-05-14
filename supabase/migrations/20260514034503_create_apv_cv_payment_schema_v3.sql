/*
  # AP Voucher / CV / Payment Schedule (Additive)
  Extends ap_vouchers and creates new tables for the payment processing module.
  All RLS uses SECURITY DEFINER helpers to avoid recursion.
*/

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text NOT NULL DEFAULT 'expense',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ewt_rate_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate numeric(5,2) NOT NULL UNIQUE,
  description text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO chart_of_accounts (account_code, account_name, account_type) VALUES
  ('1000-001','Cash on Hand','asset'),
  ('1000-002','Cash in Bank - Operating','asset'),
  ('2000-001','Accounts Payable - Trade','liability'),
  ('2000-010','VAT Payable','liability'),
  ('2000-020','EWT Payable','liability'),
  ('5000-100','Office Supplies Expense','expense'),
  ('5000-110','Repairs and Maintenance','expense'),
  ('5000-120','Utilities Expense','expense'),
  ('5000-130','Rent Expense','expense'),
  ('5000-140','Professional Fees','expense'),
  ('5000-150','Transportation and Travel','expense'),
  ('5000-160','Communication Expense','expense'),
  ('5000-170','Representation and Entertainment','expense'),
  ('5000-180','Miscellaneous Expense','expense'),
  ('1300-001','Input VAT','asset')
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO ewt_rate_options (rate, description) VALUES
  (1.00,'Goods - 1%'),(2.00,'Services - 2%'),(5.00,'Rentals - 5%'),
  (10.00,'Professional - 10%'),(15.00,'Professional - 15%')
ON CONFLICT (rate) DO NOTHING;

ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS vendor_invoice_id uuid REFERENCES vendor_invoices(id) ON DELETE RESTRICT;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS po_number text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS invoice_number text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS vendor_id uuid;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS vendor_name text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS vendor_tin text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS vendor_address text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS gl_account_code text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS gl_account_name text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS cost_center text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS expense_category text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS invoice_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS vat_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS ewt_rate numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS ewt_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS other_deductions numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS other_deductions_description text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS current_approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS current_approval_level integer NOT NULL DEFAULT 0;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS remarks text NOT NULL DEFAULT '';
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ap_vouchers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_apv_status ON ap_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_apv_vendor ON ap_vouchers(vendor_id);
CREATE INDEX IF NOT EXISTS idx_apv_due ON ap_vouchers(due_date);

CREATE TABLE IF NOT EXISTS apv_approval_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ap_voucher_id uuid NOT NULL REFERENCES ap_vouchers(id) ON DELETE CASCADE,
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_level integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('pending','approved','returned','rejected')),
  remarks text NOT NULL DEFAULT '',
  acted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apv_logs_voucher ON apv_approval_logs(ap_voucher_id);

CREATE TABLE IF NOT EXISTS check_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cv_number text NOT NULL UNIQUE,
  ap_voucher_id uuid REFERENCES ap_vouchers(id) ON DELETE SET NULL,
  batch_id uuid,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  vendor_id uuid,
  payee_name text NOT NULL,
  payment_method text NOT NULL DEFAULT 'check' CHECK (payment_method IN ('check','bank_transfer','auto_debit','online_payment')),
  bank_name text NOT NULL DEFAULT '',
  bank_account_number text NOT NULL DEFAULT '',
  check_number text,
  check_date date,
  reference_number text,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'PHP',
  payment_date date,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','for_release','released','cleared','bounced','cancelled','voided')),
  released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  released_at timestamptz,
  cleared_at timestamptz,
  voided_reason text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','released','completed','cancelled','voided')),
  current_approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_approval_level integer NOT NULL DEFAULT 0,
  remarks text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT payee_not_cash CHECK (lower(trim(payee_name)) <> 'cash' AND length(trim(payee_name)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_cv_status ON check_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_cv_payment_status ON check_vouchers(payment_status);
CREATE INDEX IF NOT EXISTS idx_cv_vendor ON check_vouchers(vendor_id);

CREATE TABLE IF NOT EXISTS cv_apv_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_voucher_id uuid NOT NULL REFERENCES check_vouchers(id) ON DELETE CASCADE,
  ap_voucher_id uuid NOT NULL REFERENCES ap_vouchers(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (check_voucher_id, ap_voucher_id)
);
CREATE INDEX IF NOT EXISTS idx_cv_apv_links_cv ON cv_apv_links(check_voucher_id);
CREATE INDEX IF NOT EXISTS idx_cv_apv_links_apv ON cv_apv_links(ap_voucher_id);

CREATE TABLE IF NOT EXISTS cv_approval_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_voucher_id uuid NOT NULL REFERENCES check_vouchers(id) ON DELETE CASCADE,
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_level integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('pending','approved','returned','rejected')),
  remarks text NOT NULL DEFAULT '',
  acted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cv_logs_voucher ON cv_approval_logs(check_voucher_id);

CREATE TABLE IF NOT EXISTS payment_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ap_voucher_id uuid NOT NULL REFERENCES ap_vouchers(id) ON DELETE CASCADE,
  vendor_id uuid,
  vendor_name text NOT NULL DEFAULT '',
  net_payable numeric(14,2) NOT NULL DEFAULT 0,
  due_date date,
  scheduled_payment_date date,
  payment_batch text NOT NULL DEFAULT 'monthly' CHECK (payment_batch IN ('weekly','bi_monthly','monthly','special')),
  is_paid boolean NOT NULL DEFAULT false,
  check_voucher_id uuid REFERENCES check_vouchers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ap_voucher_id)
);
CREATE INDEX IF NOT EXISTS idx_pay_sched_due ON payment_schedule(due_date);
CREATE INDEX IF NOT EXISTS idx_pay_sched_paid ON payment_schedule(is_paid);

CREATE TABLE IF NOT EXISTS payment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_type text NOT NULL CHECK (reference_type IN ('ap_voucher','check_voucher')),
  reference_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','submitted','approved','returned','rejected','released','completed','cancelled','voided','cleared','bounced','updated')),
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  remarks text NOT NULL DEFAULT '',
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_audit_ref ON payment_audit_logs(reference_type, reference_id);

CREATE OR REPLACE FUNCTION user_has_apv_access(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM user_profiles WHERE id = p_user_id;
  RETURN v_role IN ('admin','accounting','finance','treasury','procurement');
END; $$;

CREATE OR REPLACE FUNCTION user_has_treasury_access(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM user_profiles WHERE id = p_user_id;
  RETURN v_role IN ('admin','treasury','finance','accounting');
END; $$;

CREATE OR REPLACE FUNCTION generate_apv_number(p_company_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year text := to_char(now(),'YYYY'); v_seq int; v_ref text;
BEGIN
  SELECT COALESCE(MAX(CAST(split_part(apv_number,'-',3) AS int)),0) + 1
    INTO v_seq FROM ap_vouchers WHERE apv_number LIKE 'APV-' || v_year || '-%';
  v_ref := 'APV-' || v_year || '-' || lpad(v_seq::text, 5, '0');
  RETURN v_ref;
END; $$;

CREATE OR REPLACE FUNCTION generate_cv_number(p_company_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year text := to_char(now(),'YYYY'); v_seq int; v_ref text;
BEGIN
  SELECT COALESCE(MAX(CAST(split_part(cv_number,'-',3) AS int)),0) + 1
    INTO v_seq FROM check_vouchers WHERE cv_number LIKE 'CV-' || v_year || '-%';
  v_ref := 'CV-' || v_year || '-' || lpad(v_seq::text, 5, '0');
  RETURN v_ref;
END; $$;

CREATE OR REPLACE FUNCTION try_close_po(p_po_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_unpaid int;
BEGIN
  SELECT status INTO v_status FROM purchase_orders WHERE id = p_po_id;
  IF v_status IS DISTINCT FROM 'fully_received' THEN RETURN; END IF;
  SELECT count(*) INTO v_unpaid FROM ap_vouchers
    WHERE purchase_order_id = p_po_id AND status NOT IN ('paid','cancelled','rejected');
  IF v_unpaid > 0 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM ap_vouchers WHERE purchase_order_id = p_po_id AND status = 'paid') THEN RETURN; END IF;
  UPDATE purchase_orders SET status = 'closed', updated_at = now() WHERE id = p_po_id;
END; $$;

CREATE OR REPLACE FUNCTION release_check_voucher(p_cv_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_po uuid;
BEGIN
  UPDATE check_vouchers
     SET payment_status = 'released', status = 'released',
         released_by = p_user_id, released_at = now(),
         updated_at = now(), updated_by = p_user_id
   WHERE id = p_cv_id AND status = 'approved';

  FOR r IN SELECT ap_voucher_id FROM cv_apv_links WHERE check_voucher_id = p_cv_id LOOP
    UPDATE ap_vouchers SET status = 'paid', updated_at = now() WHERE id = r.ap_voucher_id;
    UPDATE payment_schedule SET is_paid = true, check_voucher_id = p_cv_id, updated_at = now()
     WHERE ap_voucher_id = r.ap_voucher_id;
    SELECT purchase_order_id INTO v_po FROM ap_vouchers WHERE id = r.ap_voucher_id;
    IF v_po IS NOT NULL THEN PERFORM try_close_po(v_po); END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM cv_apv_links WHERE check_voucher_id = p_cv_id) THEN
    UPDATE ap_vouchers a SET status = 'paid', updated_at = now()
      FROM check_vouchers c WHERE c.id = p_cv_id AND a.id = c.ap_voucher_id;
  END IF;

  INSERT INTO payment_audit_logs (reference_type, reference_id, action, performed_by, new_values)
  VALUES ('check_voucher', p_cv_id, 'released', p_user_id, jsonb_build_object('status','released'));
END; $$;

CREATE OR REPLACE FUNCTION void_check_voucher(p_cv_id uuid, p_user_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_po uuid;
BEGIN
  UPDATE check_vouchers
     SET status = 'voided', payment_status = 'voided', voided_reason = p_reason,
         updated_at = now(), updated_by = p_user_id
   WHERE id = p_cv_id;

  FOR r IN SELECT ap_voucher_id FROM cv_apv_links WHERE check_voucher_id = p_cv_id LOOP
    UPDATE ap_vouchers SET status = 'approved', updated_at = now()
     WHERE id = r.ap_voucher_id AND status = 'paid';
    UPDATE payment_schedule SET is_paid = false, check_voucher_id = NULL, updated_at = now()
     WHERE ap_voucher_id = r.ap_voucher_id;
    SELECT purchase_order_id INTO v_po FROM ap_vouchers WHERE id = r.ap_voucher_id;
    IF v_po IS NOT NULL THEN
      UPDATE purchase_orders SET status = 'fully_received', updated_at = now()
       WHERE id = v_po AND status = 'closed';
    END IF;
  END LOOP;

  INSERT INTO payment_audit_logs (reference_type, reference_id, action, performed_by, remarks)
  VALUES ('check_voucher', p_cv_id, 'voided', p_user_id, p_reason);
END; $$;

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ewt_rate_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE apv_approval_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_apv_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_approval_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coa_select" ON chart_of_accounts;
CREATE POLICY "coa_select" ON chart_of_accounts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "coa_insert" ON chart_of_accounts;
CREATE POLICY "coa_insert" ON chart_of_accounts FOR INSERT TO authenticated WITH CHECK (user_has_apv_access(auth.uid()));
DROP POLICY IF EXISTS "coa_update" ON chart_of_accounts;
CREATE POLICY "coa_update" ON chart_of_accounts FOR UPDATE TO authenticated
  USING (user_has_apv_access(auth.uid())) WITH CHECK (user_has_apv_access(auth.uid()));
DROP POLICY IF EXISTS "coa_delete" ON chart_of_accounts;
CREATE POLICY "coa_delete" ON chart_of_accounts FOR DELETE TO authenticated USING (user_has_apv_access(auth.uid()));

DROP POLICY IF EXISTS "ewt_select" ON ewt_rate_options;
CREATE POLICY "ewt_select" ON ewt_rate_options FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ewt_insert" ON ewt_rate_options;
CREATE POLICY "ewt_insert" ON ewt_rate_options FOR INSERT TO authenticated WITH CHECK (user_has_apv_access(auth.uid()));
DROP POLICY IF EXISTS "ewt_update" ON ewt_rate_options;
CREATE POLICY "ewt_update" ON ewt_rate_options FOR UPDATE TO authenticated
  USING (user_has_apv_access(auth.uid())) WITH CHECK (user_has_apv_access(auth.uid()));
DROP POLICY IF EXISTS "ewt_delete" ON ewt_rate_options;
CREATE POLICY "ewt_delete" ON ewt_rate_options FOR DELETE TO authenticated USING (user_has_apv_access(auth.uid()));

DROP POLICY IF EXISTS "apv_select" ON ap_vouchers;
CREATE POLICY "apv_select" ON ap_vouchers FOR SELECT TO authenticated
  USING (user_has_apv_access(auth.uid()) OR created_by = auth.uid());
DROP POLICY IF EXISTS "apv_insert" ON ap_vouchers;
CREATE POLICY "apv_insert" ON ap_vouchers FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "apv_update" ON ap_vouchers;
CREATE POLICY "apv_update" ON ap_vouchers FOR UPDATE TO authenticated
  USING (user_has_apv_access(auth.uid()) OR created_by = auth.uid())
  WITH CHECK (user_has_apv_access(auth.uid()) OR created_by = auth.uid());
DROP POLICY IF EXISTS "apv_delete" ON ap_vouchers;
CREATE POLICY "apv_delete" ON ap_vouchers FOR DELETE TO authenticated USING (user_has_apv_access(auth.uid()));

DROP POLICY IF EXISTS "apvl_select" ON apv_approval_logs;
CREATE POLICY "apvl_select" ON apv_approval_logs FOR SELECT TO authenticated USING (user_has_apv_access(auth.uid()));
DROP POLICY IF EXISTS "apvl_insert" ON apv_approval_logs;
CREATE POLICY "apvl_insert" ON apv_approval_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "apvl_update" ON apv_approval_logs;
CREATE POLICY "apvl_update" ON apv_approval_logs FOR UPDATE TO authenticated
  USING (user_has_apv_access(auth.uid())) WITH CHECK (user_has_apv_access(auth.uid()));

DROP POLICY IF EXISTS "cv_select" ON check_vouchers;
CREATE POLICY "cv_select" ON check_vouchers FOR SELECT TO authenticated
  USING (user_has_treasury_access(auth.uid()) OR created_by = auth.uid());
DROP POLICY IF EXISTS "cv_insert" ON check_vouchers;
CREATE POLICY "cv_insert" ON check_vouchers FOR INSERT TO authenticated WITH CHECK (user_has_treasury_access(auth.uid()));
DROP POLICY IF EXISTS "cv_update" ON check_vouchers;
CREATE POLICY "cv_update" ON check_vouchers FOR UPDATE TO authenticated
  USING (user_has_treasury_access(auth.uid()) OR created_by = auth.uid())
  WITH CHECK (user_has_treasury_access(auth.uid()) OR created_by = auth.uid());
DROP POLICY IF EXISTS "cv_delete" ON check_vouchers;
CREATE POLICY "cv_delete" ON check_vouchers FOR DELETE TO authenticated USING (user_has_treasury_access(auth.uid()));

DROP POLICY IF EXISTS "cvl_select" ON cv_apv_links;
CREATE POLICY "cvl_select" ON cv_apv_links FOR SELECT TO authenticated USING (user_has_apv_access(auth.uid()));
DROP POLICY IF EXISTS "cvl_insert" ON cv_apv_links;
CREATE POLICY "cvl_insert" ON cv_apv_links FOR INSERT TO authenticated WITH CHECK (user_has_treasury_access(auth.uid()));
DROP POLICY IF EXISTS "cvl_delete" ON cv_apv_links;
CREATE POLICY "cvl_delete" ON cv_apv_links FOR DELETE TO authenticated USING (user_has_treasury_access(auth.uid()));

DROP POLICY IF EXISTS "cval_select" ON cv_approval_logs;
CREATE POLICY "cval_select" ON cv_approval_logs FOR SELECT TO authenticated USING (user_has_treasury_access(auth.uid()));
DROP POLICY IF EXISTS "cval_insert" ON cv_approval_logs;
CREATE POLICY "cval_insert" ON cv_approval_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "cval_update" ON cv_approval_logs;
CREATE POLICY "cval_update" ON cv_approval_logs FOR UPDATE TO authenticated
  USING (user_has_treasury_access(auth.uid())) WITH CHECK (user_has_treasury_access(auth.uid()));

DROP POLICY IF EXISTS "ps_select" ON payment_schedule;
CREATE POLICY "ps_select" ON payment_schedule FOR SELECT TO authenticated USING (user_has_apv_access(auth.uid()));
DROP POLICY IF EXISTS "ps_insert" ON payment_schedule;
CREATE POLICY "ps_insert" ON payment_schedule FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "ps_update" ON payment_schedule;
CREATE POLICY "ps_update" ON payment_schedule FOR UPDATE TO authenticated
  USING (user_has_treasury_access(auth.uid())) WITH CHECK (user_has_treasury_access(auth.uid()));
DROP POLICY IF EXISTS "ps_delete" ON payment_schedule;
CREATE POLICY "ps_delete" ON payment_schedule FOR DELETE TO authenticated USING (user_has_treasury_access(auth.uid()));

DROP POLICY IF EXISTS "pal_select" ON payment_audit_logs;
CREATE POLICY "pal_select" ON payment_audit_logs FOR SELECT TO authenticated USING (user_has_apv_access(auth.uid()));
DROP POLICY IF EXISTS "pal_insert" ON payment_audit_logs;
CREATE POLICY "pal_insert" ON payment_audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
