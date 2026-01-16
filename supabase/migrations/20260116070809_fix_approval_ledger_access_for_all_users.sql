/*
  # Fix Approval Ledger Access for All Authenticated Users

  1. Changes
    - Add policy to allow all authenticated users to view approval_ledger entries
    - This fixes the issue where non-admin users can't see all signatures when generating PDFs
    - Users need to see all approval records to generate complete approval PDFs

  2. Security
    - Only authenticated users can view
    - This is safe because:
      - Approval records are audit trails that show who approved what
      - Users already have access to view the requests themselves through other policies
      - Knowing who approved a request doesn't expose sensitive data
*/

-- Drop the restrictive policies if they exist
DROP POLICY IF EXISTS "Approvers can view all approval ledger entries" ON approval_ledger;
DROP POLICY IF EXISTS "Users can view approval ledger for own requests" ON approval_ledger;

-- Policy: All authenticated users can view approval ledger entries
-- This is needed for generating PDFs with complete approval signatures
CREATE POLICY "All authenticated users can view approval ledger"
  ON approval_ledger
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
  );