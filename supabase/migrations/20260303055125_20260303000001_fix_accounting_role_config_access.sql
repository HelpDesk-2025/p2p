/*
  # Fix Accounting Role Config Table Access

  ## Summary
  The previous migration that was supposed to grant accounting role write access
  to configuration tables was never applied. The policies still only allow 'admin'.
  This migration drops and recreates the policies to include the accounting role.

  1. Tables Fixed
    - expense_types: allow accounting to insert/update/delete
    - withholding_tax_rates: allow accounting to insert/update/delete
    - pr_checklists: allow accounting to insert/update/delete
    - payment_modes: allow accounting to insert/update/delete

  2. Security
    - Only admin and accounting roles can modify these tables
    - All other users retain read-only access
*/

-- ============================================
-- EXPENSE_TYPES TABLE
-- ============================================
DROP POLICY IF EXISTS "Admins can manage expense types" ON expense_types;
DROP POLICY IF EXISTS "Admins and accounting can manage expense types" ON expense_types;

CREATE POLICY "Admins and accounting can manage expense types"
  ON expense_types
  FOR ALL
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

-- ============================================
-- WITHHOLDING_TAX_RATES TABLE
-- ============================================
DROP POLICY IF EXISTS "Admins can manage VAT rates" ON withholding_tax_rates;
DROP POLICY IF EXISTS "Admins can manage withholding tax rates" ON withholding_tax_rates;
DROP POLICY IF EXISTS "Admins and accounting can manage withholding tax rates" ON withholding_tax_rates;

CREATE POLICY "Admins and accounting can manage withholding tax rates"
  ON withholding_tax_rates
  FOR ALL
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

-- ============================================
-- PR_CHECKLISTS TABLE
-- ============================================
DROP POLICY IF EXISTS "Admins can manage checklists" ON pr_checklists;
DROP POLICY IF EXISTS "Admins and accounting can manage checklists" ON pr_checklists;

CREATE POLICY "Admins and accounting can manage checklists"
  ON pr_checklists
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );

-- ============================================
-- PAYMENT_MODES TABLE
-- ============================================
DROP POLICY IF EXISTS "Admins can manage payment modes" ON payment_modes;
DROP POLICY IF EXISTS "Admins and accounting can manage payment modes" ON payment_modes;

CREATE POLICY "Admins and accounting can manage payment modes"
  ON payment_modes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'accounting')
    )
  );
