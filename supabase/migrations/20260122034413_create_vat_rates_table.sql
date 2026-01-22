/*
  # Create VAT Rates Table

  1. New Tables
    - `vat_rates`
      - `id` (uuid, primary key)
      - `name` (text) - Name/description of the VAT rate (e.g., "Standard VAT", "Zero-Rated", "VAT Exempt")
      - `rate` (numeric) - VAT rate percentage (e.g., 12.00 for 12%)
      - `description` (text) - Additional description
      - `is_active` (boolean) - Whether the VAT rate is active
      - `company_id` (uuid) - Reference to company
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      
  2. Security
    - Enable RLS on `vat_rates` table
    - Add policies for authenticated users to read active VAT rates
    - Add policies for admins to manage VAT rates
    
  3. Purpose
    - Used for managing VAT rates in the system
    - Can be used for invoices, purchase orders, and other financial documents
    - Similar structure to expense_types configuration
*/

CREATE TABLE IF NOT EXISTS vat_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  description TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, company_id)
);

ALTER TABLE vat_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read active VAT rates"
  ON vat_rates
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage VAT rates"
  ON vat_rates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND (user_profiles.company_id = vat_rates.company_id OR vat_rates.company_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND (user_profiles.company_id = vat_rates.company_id OR vat_rates.company_id IS NULL)
    )
  );

CREATE INDEX IF NOT EXISTS idx_vat_rates_company_id ON vat_rates(company_id);
CREATE INDEX IF NOT EXISTS idx_vat_rates_is_active ON vat_rates(is_active);