/*
  # Add Purchase Type Applicability to Approval Flows

  1. Modified Tables
    - `approval_flows`
      - `applies_to_po` (boolean, NOT NULL, DEFAULT true) - Step applies to Purchase Order type requests
      - `applies_to_non_po` (boolean, NOT NULL, DEFAULT true) - Step applies to Non-Purchase Order type requests

  2. Constraints
    - CHECK constraint ensures at least one of applies_to_po or applies_to_non_po is true
    - This prevents misconfiguration where a step applies to neither type

  3. Notes
    - Both default to true for backward compatibility (existing steps apply to all types)
    - Only relevant for Purchase Requisition request type approval flows
    - When a PR is submitted, only steps matching its purchase_type will be included
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_flows' AND column_name = 'applies_to_po'
  ) THEN
    ALTER TABLE approval_flows ADD COLUMN applies_to_po boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_flows' AND column_name = 'applies_to_non_po'
  ) THEN
    ALTER TABLE approval_flows ADD COLUMN applies_to_non_po boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'approval_flows_purchase_type_check'
  ) THEN
    ALTER TABLE approval_flows
    ADD CONSTRAINT approval_flows_purchase_type_check
    CHECK (applies_to_po OR applies_to_non_po);
  END IF;
END $$;
