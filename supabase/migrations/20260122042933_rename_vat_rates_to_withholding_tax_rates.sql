/*
  # Rename VAT Rates to Withholding Tax Rates

  1. Changes
    - Rename `vat_rates` table to `withholding_tax_rates`
    - All existing data, policies, and indexes will be preserved
    
  2. Purpose
    - Update terminology to reflect withholding tax rates instead of VAT rates
*/

ALTER TABLE IF EXISTS vat_rates RENAME TO withholding_tax_rates;