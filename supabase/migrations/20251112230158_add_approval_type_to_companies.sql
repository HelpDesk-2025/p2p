/*
  # Add Approval Type to Companies

  1. Changes to `companies` table
    - Add `approval_type` (text) - Approval workflow type
      - Options: 'per_department' or 'whole_company'
      - Default: 'per_department'

  2. Notes
    - Per Department: Approval workflow follows department hierarchy
    - Whole Company: Approval workflow applies to entire company
*/

-- Add approval_type column to companies table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'approval_type'
  ) THEN
    ALTER TABLE companies ADD COLUMN approval_type text DEFAULT 'per_department';
  END IF;
END $$;

-- Add check constraint to ensure valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'companies_approval_type_check'
  ) THEN
    ALTER TABLE companies
    ADD CONSTRAINT companies_approval_type_check
    CHECK (approval_type IN ('per_department', 'whole_company'));
  END IF;
END $$;
