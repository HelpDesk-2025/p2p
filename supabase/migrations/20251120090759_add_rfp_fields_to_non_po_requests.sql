/*
  # Add RFP fields to non-PO request tables

  1. Changes
    - Add payee, date_needed, budgeted fields to petty_cash_requests
    - Add payee, date_needed, budgeted fields to reimbursement_requests
    - Add rfp_pdf_path to store generated RFP PDF for non-PO requests
    
  2. Security
    - No RLS changes needed
*/

-- Add fields to petty_cash_requests
ALTER TABLE petty_cash_requests 
  ADD COLUMN IF NOT EXISTS payee TEXT,
  ADD COLUMN IF NOT EXISTS date_needed DATE,
  ADD COLUMN IF NOT EXISTS budgeted BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS rfp_pdf_path TEXT;

-- Add fields to reimbursement_requests
ALTER TABLE reimbursement_requests 
  ADD COLUMN IF NOT EXISTS payee TEXT,
  ADD COLUMN IF NOT EXISTS date_needed DATE,
  ADD COLUMN IF NOT EXISTS budgeted BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS rfp_pdf_path TEXT;
