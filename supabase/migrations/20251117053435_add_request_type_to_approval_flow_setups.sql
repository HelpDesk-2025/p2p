/*
  # Add Request Type to Approval Flow Setups

  1. Changes
    - Add `request_type` column to `approval_flow_setups` table
      - Possible values: 'Purchase Requisition', 'Canvass', 'Petty Cash', 'Reimbursement'
      - This allows different approval flows for different request types
    
  2. Updates
    - Add check constraint to ensure valid request types
    - Create index on request_type for faster queries
    - Update existing setups to have 'Purchase Requisition' as default

  3. Important Notes
    - Each approval flow setup is now specific to a request type
    - Different request types can have different approval flows for the same department/company
    - Lookup logic will check: company_id + department_id + request_type
*/

-- Add request_type column to approval_flow_setups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_flow_setups' AND column_name = 'request_type'
  ) THEN
    ALTER TABLE approval_flow_setups ADD COLUMN request_type text NOT NULL DEFAULT 'Purchase Requisition';
  END IF;
END $$;

-- Add check constraint for valid request types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'approval_flow_setups_request_type_check'
  ) THEN
    ALTER TABLE approval_flow_setups
    ADD CONSTRAINT approval_flow_setups_request_type_check
    CHECK (request_type IN ('Purchase Requisition', 'Canvass', 'Petty Cash', 'Reimbursement'));
  END IF;
END $$;

-- Create index for faster lookups by request type
CREATE INDEX IF NOT EXISTS idx_approval_flow_setups_request_type 
ON approval_flow_setups(request_type);

-- Create composite index for complete lookup
CREATE INDEX IF NOT EXISTS idx_approval_flow_setups_lookup 
ON approval_flow_setups(company_id, department_id, request_type, is_active);
