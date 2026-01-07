/*
  # Fix Security and Performance Issues

  1. Performance Improvements
    - Add indexes for all unindexed foreign keys
    - Optimize RLS policies to use subquery pattern for auth functions
    - Fix function search paths for security

  2. Indexes Added
    - Foreign key indexes for all tables to improve query performance

  3. RLS Policy Optimization
    - Update all policies to use (select auth.*()) pattern
    - Prevents re-evaluation of auth functions for each row

  4. Function Security
    - Add SET search_path to all functions to prevent search path attacks
*/

-- =====================================================
-- PART 1: ADD INDEXES FOR FOREIGN KEYS
-- =====================================================

-- approval_flows indexes
CREATE INDEX IF NOT EXISTS idx_approval_flows_user_id ON approval_flows(user_id);

-- approval_history indexes
CREATE INDEX IF NOT EXISTS idx_approval_history_approver_id ON approval_history(approver_id);

-- approvers indexes
CREATE INDEX IF NOT EXISTS idx_approvers_user_id ON approvers(user_id);

-- canvass_requests indexes
CREATE INDEX IF NOT EXISTS idx_canvass_requests_company_id ON canvass_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_canvass_requests_pr_id ON canvass_requests(pr_id);

-- cash_advance_requests indexes
CREATE INDEX IF NOT EXISTS idx_cash_advance_requests_company_id ON cash_advance_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_advance_requests_payment_mode_id ON cash_advance_requests(payment_mode_id);
CREATE INDEX IF NOT EXISTS idx_cash_advance_requests_requester_id ON cash_advance_requests(requester_id);

-- petty_cash_requests indexes
CREATE INDEX IF NOT EXISTS idx_petty_cash_requests_company_id ON petty_cash_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_requests_payment_mode_id ON petty_cash_requests(payment_mode_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_requests_received_by ON petty_cash_requests(received_by);

-- procurement_checks indexes
CREATE INDEX IF NOT EXISTS idx_procurement_checks_checker_id ON procurement_checks(checker_id);
CREATE INDEX IF NOT EXISTS idx_procurement_checks_pr_id ON procurement_checks(pr_id);

-- purchase_requisitions indexes
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_canvass_id ON purchase_requisitions(canvass_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_payment_mode_id ON purchase_requisitions(payment_mode_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_pr_checklist_id ON purchase_requisitions(pr_checklist_id);

-- reimbursement_requests indexes
CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_company_id ON reimbursement_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_payment_mode_id ON reimbursement_requests(payment_mode_id);

-- sme_requests indexes
CREATE INDEX IF NOT EXISTS idx_sme_requests_requested_by ON sme_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_sme_requests_sme_user_id ON sme_requests(sme_user_id);

-- =====================================================
-- PART 2: OPTIMIZE RLS POLICIES
-- =====================================================

-- approvers table
DROP POLICY IF EXISTS "Admins can manage approvers" ON approvers;
CREATE POLICY "Admins can manage approvers"
  ON approvers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- pr_checklists table
DROP POLICY IF EXISTS "Admins can manage checklists" ON pr_checklists;
CREATE POLICY "Admins can manage checklists"
  ON pr_checklists
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- payment_modes table
DROP POLICY IF EXISTS "Admins can manage payment modes" ON payment_modes;
CREATE POLICY "Admins can manage payment modes"
  ON payment_modes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- holidays table
DROP POLICY IF EXISTS "Admins can manage holidays" ON holidays;
CREATE POLICY "Admins can manage holidays"
  ON holidays
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- purchase_requisitions table
DROP POLICY IF EXISTS "Users can view own purchase requisitions" ON purchase_requisitions;
CREATE POLICY "Users can view own purchase requisitions"
  ON purchase_requisitions
  FOR SELECT
  TO authenticated
  USING (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Approvers can view pending requisitions" ON purchase_requisitions;
CREATE POLICY "Approvers can view pending requisitions"
  ON purchase_requisitions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can create own purchase requisitions" ON purchase_requisitions;
CREATE POLICY "Users can create own purchase requisitions"
  ON purchase_requisitions
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own draft requisitions" ON purchase_requisitions;
CREATE POLICY "Users can update own draft requisitions"
  ON purchase_requisitions
  FOR UPDATE
  TO authenticated
  USING (requester_id = (select auth.uid()) AND status = 'draft')
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Approvers can update requisition status" ON purchase_requisitions;
CREATE POLICY "Approvers can update requisition status"
  ON purchase_requisitions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

-- canvass_requests table
DROP POLICY IF EXISTS "Users can view own canvass requests" ON canvass_requests;
CREATE POLICY "Users can view own canvass requests"
  ON canvass_requests
  FOR SELECT
  TO authenticated
  USING (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Approvers can view pending canvass requests" ON canvass_requests;
CREATE POLICY "Approvers can view pending canvass requests"
  ON canvass_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can create own canvass requests" ON canvass_requests;
CREATE POLICY "Users can create own canvass requests"
  ON canvass_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own draft canvass" ON canvass_requests;
CREATE POLICY "Users can update own draft canvass"
  ON canvass_requests
  FOR UPDATE
  TO authenticated
  USING (requester_id = (select auth.uid()) AND status = 'draft')
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Approvers can update canvass status" ON canvass_requests;
CREATE POLICY "Approvers can update canvass status"
  ON canvass_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

-- petty_cash_requests table
DROP POLICY IF EXISTS "Users can view own petty cash requests" ON petty_cash_requests;
CREATE POLICY "Users can view own petty cash requests"
  ON petty_cash_requests
  FOR SELECT
  TO authenticated
  USING (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Approvers can view pending petty cash" ON petty_cash_requests;
CREATE POLICY "Approvers can view pending petty cash"
  ON petty_cash_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can create own petty cash requests" ON petty_cash_requests;
CREATE POLICY "Users can create own petty cash requests"
  ON petty_cash_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own draft petty cash" ON petty_cash_requests;
CREATE POLICY "Users can update own draft petty cash"
  ON petty_cash_requests
  FOR UPDATE
  TO authenticated
  USING (requester_id = (select auth.uid()) AND status = 'draft')
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Approvers can update petty cash status" ON petty_cash_requests;
CREATE POLICY "Approvers can update petty cash status"
  ON petty_cash_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

-- reimbursement_requests table
DROP POLICY IF EXISTS "Users can view own reimbursement requests" ON reimbursement_requests;
CREATE POLICY "Users can view own reimbursement requests"
  ON reimbursement_requests
  FOR SELECT
  TO authenticated
  USING (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Approvers can view pending reimbursements" ON reimbursement_requests;
CREATE POLICY "Approvers can view pending reimbursements"
  ON reimbursement_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can create own reimbursement requests" ON reimbursement_requests;
CREATE POLICY "Users can create own reimbursement requests"
  ON reimbursement_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own draft reimbursements" ON reimbursement_requests;
CREATE POLICY "Users can update own draft reimbursements"
  ON reimbursement_requests
  FOR UPDATE
  TO authenticated
  USING (requester_id = (select auth.uid()) AND status = 'draft')
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Approvers can update reimbursement status" ON reimbursement_requests;
CREATE POLICY "Approvers can update reimbursement status"
  ON reimbursement_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

-- approval_history table
DROP POLICY IF EXISTS "Users can view approval history for own requests" ON approval_history;
CREATE POLICY "Users can view approval history for own requests"
  ON approval_history
  FOR SELECT
  TO authenticated
  USING (
    request_id IN (
      SELECT id FROM purchase_requisitions WHERE requester_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Approvers can view all approval history" ON approval_history;
CREATE POLICY "Approvers can view all approval history"
  ON approval_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Approvers can create approval history" ON approval_history;
CREATE POLICY "Approvers can create approval history"
  ON approval_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

-- procurement_checks table
DROP POLICY IF EXISTS "Admins and approvers can view procurement checks" ON procurement_checks;
CREATE POLICY "Admins and approvers can view procurement checks"
  ON procurement_checks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND (role = 'admin' OR role = 'approver')
    )
  );

DROP POLICY IF EXISTS "Admins and approvers can manage procurement checks" ON procurement_checks;
CREATE POLICY "Admins and approvers can manage procurement checks"
  ON procurement_checks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND (role = 'admin' OR role = 'approver')
    )
  );

-- companies table
DROP POLICY IF EXISTS "Admin users can insert companies" ON companies;
CREATE POLICY "Admin users can insert companies"
  ON companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin users can update companies" ON companies;
CREATE POLICY "Admin users can update companies"
  ON companies
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin users can delete companies" ON companies;
CREATE POLICY "Admin users can delete companies"
  ON companies
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- departments table
DROP POLICY IF EXISTS "Admin users can insert departments" ON departments;
CREATE POLICY "Admin users can insert departments"
  ON departments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin users can update departments" ON departments;
CREATE POLICY "Admin users can update departments"
  ON departments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin users can delete departments" ON departments;
CREATE POLICY "Admin users can delete departments"
  ON departments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- approval_flows table
DROP POLICY IF EXISTS "Admin users can insert approval flows" ON approval_flows;
CREATE POLICY "Admin users can insert approval flows"
  ON approval_flows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin users can update approval flows" ON approval_flows;
CREATE POLICY "Admin users can update approval flows"
  ON approval_flows
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin users can delete approval flows" ON approval_flows;
CREATE POLICY "Admin users can delete approval flows"
  ON approval_flows
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- approval_flow_setups table
DROP POLICY IF EXISTS "Admins can insert approval flow setups" ON approval_flow_setups;
CREATE POLICY "Admins can insert approval flow setups"
  ON approval_flow_setups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update approval flow setups" ON approval_flow_setups;
CREATE POLICY "Admins can update approval flow setups"
  ON approval_flow_setups
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete approval flow setups" ON approval_flow_setups;
CREATE POLICY "Admins can delete approval flow setups"
  ON approval_flow_setups
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- approval_ledger table
DROP POLICY IF EXISTS "Admins can view all approval ledger entries" ON approval_ledger;
CREATE POLICY "Admins can view all approval ledger entries"
  ON approval_ledger
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Approvers can view all approval ledger entries" ON approval_ledger;
CREATE POLICY "Approvers can view all approval ledger entries"
  ON approval_ledger
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can view approval ledger for own requests" ON approval_ledger;
CREATE POLICY "Users can view approval ledger for own requests"
  ON approval_ledger
  FOR SELECT
  TO authenticated
  USING (
    request_id IN (
      SELECT id FROM purchase_requisitions WHERE requester_id = (select auth.uid())
      UNION ALL
      SELECT id FROM petty_cash_requests WHERE requester_id = (select auth.uid())
      UNION ALL
      SELECT id FROM reimbursement_requests WHERE requester_id = (select auth.uid())
      UNION ALL
      SELECT id FROM canvass_requests WHERE requester_id = (select auth.uid())
      UNION ALL
      SELECT id FROM cash_advance_requests WHERE requester_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can insert approval ledger entries" ON approval_ledger;
CREATE POLICY "Authenticated users can insert approval ledger entries"
  ON approval_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- user_profiles table
DROP POLICY IF EXISTS "Authenticated users can view active profiles" ON user_profiles;
CREATE POLICY "Authenticated users can view active profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile or admins can update any" ON user_profiles;
CREATE POLICY "Users can update own profile or admins can update any"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = (select auth.uid()) OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- smtp_configurations table
DROP POLICY IF EXISTS "Admin users can view all SMTP configurations" ON smtp_configurations;
CREATE POLICY "Admin users can view all SMTP configurations"
  ON smtp_configurations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin users can insert SMTP configurations" ON smtp_configurations;
CREATE POLICY "Admin users can insert SMTP configurations"
  ON smtp_configurations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin users can update SMTP configurations" ON smtp_configurations;
CREATE POLICY "Admin users can update SMTP configurations"
  ON smtp_configurations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin users can delete SMTP configurations" ON smtp_configurations;
CREATE POLICY "Admin users can delete SMTP configurations"
  ON smtp_configurations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- sme_requests table
DROP POLICY IF EXISTS "Procurement users can create SME requests" ON sme_requests;
CREATE POLICY "Procurement users can create SME requests"
  ON sme_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role IN ('admin', 'approver')
    )
  );

DROP POLICY IF EXISTS "SME users can update their assigned requests" ON sme_requests;
CREATE POLICY "SME users can update their assigned requests"
  ON sme_requests
  FOR UPDATE
  TO authenticated
  USING (sme_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view SME requests" ON sme_requests;
CREATE POLICY "Users can view SME requests"
  ON sme_requests
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Admins can update SME requests" ON sme_requests;
CREATE POLICY "Admins can update SME requests"
  ON sme_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- canvass_approver_recommendations table
DROP POLICY IF EXISTS "Users can create their own recommendations" ON canvass_approver_recommendations;
CREATE POLICY "Users can create their own recommendations"
  ON canvass_approver_recommendations
  FOR INSERT
  TO authenticated
  WITH CHECK (approver_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their own recommendations" ON canvass_approver_recommendations;
CREATE POLICY "Users can update their own recommendations"
  ON canvass_approver_recommendations
  FOR UPDATE
  TO authenticated
  USING (approver_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view canvass recommendations" ON canvass_approver_recommendations;
CREATE POLICY "Users can view canvass recommendations"
  ON canvass_approver_recommendations
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- cash_advance_requests table
DROP POLICY IF EXISTS "Users can view own cash advance requests" ON cash_advance_requests;
CREATE POLICY "Users can view own cash advance requests"
  ON cash_advance_requests
  FOR SELECT
  TO authenticated
  USING (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own cash advance requests" ON cash_advance_requests;
CREATE POLICY "Users can create own cash advance requests"
  ON cash_advance_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own draft cash advance requests" ON cash_advance_requests;
CREATE POLICY "Users can update own draft cash advance requests"
  ON cash_advance_requests
  FOR UPDATE
  TO authenticated
  USING (requester_id = (select auth.uid()) AND status = 'draft')
  WITH CHECK (requester_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can view all cash advance requests" ON cash_advance_requests;
CREATE POLICY "Admins can view all cash advance requests"
  ON cash_advance_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage all cash advance requests" ON cash_advance_requests;
CREATE POLICY "Admins can manage all cash advance requests"
  ON cash_advance_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Approvers can view pending cash advance requests" ON cash_advance_requests;
CREATE POLICY "Approvers can view pending cash advance requests"
  ON cash_advance_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Approvers can update pending cash advance requests" ON cash_advance_requests;
CREATE POLICY "Approvers can update pending cash advance requests"
  ON cash_advance_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE user_id = (select auth.uid())
      AND is_active = true
    )
  );

-- number_series table
DROP POLICY IF EXISTS "Users can read their company number series" ON number_series;
CREATE POLICY "Users can read their company number series"
  ON number_series
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admin users can insert number series for any company" ON number_series;
CREATE POLICY "Admin users can insert number series for any company"
  ON number_series
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin users can update number series for any company" ON number_series;
CREATE POLICY "Admin users can update number series for any company"
  ON number_series
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin users can delete number series for any company" ON number_series;
CREATE POLICY "Admin users can delete number series for any company"
  ON number_series
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- =====================================================
-- PART 3: FIX FUNCTION SEARCH PATHS
-- =====================================================

-- Fix is_user_admin function
CREATE OR REPLACE FUNCTION is_user_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = user_id AND role = 'admin'
  );
END;
$$;

-- Fix update_smtp_configurations_updated_at function
CREATE OR REPLACE FUNCTION update_smtp_configurations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix update_cash_advance_requests_updated_at function
CREATE OR REPLACE FUNCTION update_cash_advance_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix update_number_series_updated_at function
CREATE OR REPLACE FUNCTION update_number_series_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix get_next_number function (already has SECURITY DEFINER from previous migration)
CREATE OR REPLACE FUNCTION get_next_number(p_series_name text, p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_number integer;
  v_prefix text;
  v_suffix text;
  v_padding integer;
  v_result text;
BEGIN
  UPDATE number_series
  SET current_number = current_number + 1,
      updated_at = now()
  WHERE series_name = p_series_name
    AND company_id = p_company_id
    AND is_active = true
  RETURNING current_number, prefix, suffix, padding
  INTO v_current_number, v_prefix, v_suffix, v_padding;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Number series % not found or not active for company', p_series_name;
  END IF;

  v_result := COALESCE(v_prefix, '') ||
              LPAD(v_current_number::text, v_padding, '0') ||
              COALESCE(v_suffix, '');

  RETURN v_result;
END;
$$;

-- Fix generate_pr_document_no function
CREATE OR REPLACE FUNCTION generate_pr_document_no()
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year text;
  v_month text;
  v_last_number integer;
  v_new_number text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  v_month := TO_CHAR(CURRENT_DATE, 'MM');

  SELECT COALESCE(MAX(CAST(SUBSTRING(document_no FROM '\d+$') AS integer)), 0)
  INTO v_last_number
  FROM purchase_requisitions
  WHERE document_no LIKE 'PR-' || v_year || '-' || v_month || '-%';

  v_new_number := 'PR-' || v_year || '-' || v_month || '-' || LPAD((v_last_number + 1)::text, 4, '0');

  RETURN v_new_number;
END;
$$;
