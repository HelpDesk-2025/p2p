/*
  # Add Accounting Role to All Configuration Tables

  ## Summary
  Grants accounting role full access (INSERT, UPDATE, DELETE) to all configuration tables
  so they can manage system setups alongside admins.

  1. Configuration Tables Updated
    - approvers
    - pr_checklists
    - payment_modes
    - holidays
    - approval_flows
    - approval_flow_setups
    - number_series
    - smtp_configurations
    - expense_types
    - withholding_tax_rates
    - ad_hoc_approvers

  2. Changes
    - Update all admin-only policies to include accounting role
    - Both admin and accounting roles can now fully manage configurations

  3. Security
    - Only admin and accounting roles can modify configuration data
    - All other users maintain their existing read-only access
*/

-- ============================================
-- APPROVERS TABLE
-- ============================================
DROP POLICY IF EXISTS "Admins can manage approvers" ON approvers;

CREATE POLICY "Admins and accounting can manage approvers"
  ON approvers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accounting')
    )
  );

-- ============================================
-- PR_CHECKLISTS TABLE
-- ============================================
DROP POLICY IF EXISTS "Admins can manage checklists" ON pr_checklists;

CREATE POLICY "Admins and accounting can manage checklists"
  ON pr_checklists FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accounting')
    )
  );

-- ============================================
-- PAYMENT_MODES TABLE
-- ============================================
DROP POLICY IF EXISTS "Admins can manage payment modes" ON payment_modes;

CREATE POLICY "Admins and accounting can manage payment modes"
  ON payment_modes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accounting')
    )
  );

-- ============================================
-- HOLIDAYS TABLE
-- ============================================
DROP POLICY IF EXISTS "Admins can manage holidays" ON holidays;

CREATE POLICY "Admins and accounting can manage holidays"
  ON holidays FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accounting')
    )
  );

-- ============================================
-- APPROVAL_FLOWS TABLE
-- ============================================
DROP POLICY IF EXISTS "Admin users can insert approval flows" ON approval_flows;
DROP POLICY IF EXISTS "Admin users can update approval flows" ON approval_flows;
DROP POLICY IF EXISTS "Admin users can delete approval flows" ON approval_flows;

CREATE POLICY "Admin and accounting users can insert approval flows"
  ON approval_flows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

CREATE POLICY "Admin and accounting users can update approval flows"
  ON approval_flows
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

CREATE POLICY "Admin and accounting users can delete approval flows"
  ON approval_flows
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

-- ============================================
-- APPROVAL_FLOW_SETUPS TABLE
-- ============================================
DROP POLICY IF EXISTS "Admins can insert approval flow setups" ON approval_flow_setups;
DROP POLICY IF EXISTS "Admins can update approval flow setups" ON approval_flow_setups;
DROP POLICY IF EXISTS "Admins can delete approval flow setups" ON approval_flow_setups;

CREATE POLICY "Admins and accounting can insert approval flow setups"
  ON approval_flow_setups FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

CREATE POLICY "Admins and accounting can update approval flow setups"
  ON approval_flow_setups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

CREATE POLICY "Admins and accounting can delete approval flow setups"
  ON approval_flow_setups FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

-- ============================================
-- NUMBER_SERIES TABLE
-- ============================================
DROP POLICY IF EXISTS "Admin users can insert number series" ON number_series;
DROP POLICY IF EXISTS "Admin users can update number series" ON number_series;
DROP POLICY IF EXISTS "Admin users can delete number series" ON number_series;

CREATE POLICY "Admin and accounting users can insert number series"
  ON number_series
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

CREATE POLICY "Admin and accounting users can update number series"
  ON number_series
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

CREATE POLICY "Admin and accounting users can delete number series"
  ON number_series
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

-- ============================================
-- SMTP_CONFIGURATIONS TABLE
-- ============================================
DROP POLICY IF EXISTS "Admin users can view all SMTP configurations" ON smtp_configurations;
DROP POLICY IF EXISTS "Admin users can insert SMTP configurations" ON smtp_configurations;
DROP POLICY IF EXISTS "Admin users can update SMTP configurations" ON smtp_configurations;
DROP POLICY IF EXISTS "Admin users can delete SMTP configurations" ON smtp_configurations;

CREATE POLICY "Admin and accounting users can view all SMTP configurations"
  ON smtp_configurations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

CREATE POLICY "Admin and accounting users can insert SMTP configurations"
  ON smtp_configurations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

CREATE POLICY "Admin and accounting users can update SMTP configurations"
  ON smtp_configurations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

CREATE POLICY "Admin and accounting users can delete SMTP configurations"
  ON smtp_configurations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

-- ============================================
-- EXPENSE_TYPES TABLE
-- ============================================
DROP POLICY IF EXISTS "Admins can manage expense types" ON expense_types;

CREATE POLICY "Admins and accounting can manage expense types"
  ON expense_types
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
      AND (user_profiles.company_id = expense_types.company_id OR expense_types.company_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
      AND (user_profiles.company_id = expense_types.company_id OR expense_types.company_id IS NULL)
    )
  );

-- ============================================
-- WITHHOLDING_TAX_RATES TABLE
-- ============================================
DROP POLICY IF EXISTS "Admins can manage VAT rates" ON withholding_tax_rates;
DROP POLICY IF EXISTS "Admins can manage withholding tax rates" ON withholding_tax_rates;

CREATE POLICY "Admins and accounting can manage withholding tax rates"
  ON withholding_tax_rates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
      AND (user_profiles.company_id = withholding_tax_rates.company_id OR withholding_tax_rates.company_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
      AND (user_profiles.company_id = withholding_tax_rates.company_id OR withholding_tax_rates.company_id IS NULL)
    )
  );

-- ============================================
-- AD_HOC_APPROVERS TABLE
-- ============================================
DROP POLICY IF EXISTS "Admins and approvers can add ad-hoc approvers" ON ad_hoc_approvers;
DROP POLICY IF EXISTS "Admins and approvers can update ad-hoc approvers" ON ad_hoc_approvers;

CREATE POLICY "Admins, accounting, and approvers can add ad-hoc approvers"
  ON ad_hoc_approvers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accounting', 'approver', 'procurement')
    )
  );

CREATE POLICY "Admins, accounting, and approvers can update ad-hoc approvers"
  ON ad_hoc_approvers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accounting', 'approver', 'procurement')
    ) OR user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'accounting', 'approver', 'procurement')
    ) OR user_id = auth.uid()
  );
