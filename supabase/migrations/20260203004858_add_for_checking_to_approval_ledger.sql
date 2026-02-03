/*
  # Add for_checking Flag to Approval Ledger

  1. Changes
    - Add for_checking column to approval_ledger table
    - Default to false for backward compatibility
    - Update get_approval_records_with_signatures to use the new column

  2. Purpose  
    - Store for_checking flag directly in approval_ledger when entries are created
    - Eliminate complex JOINs that don't work reliably
    - Ensure "For Checking Only" approvers are excluded from signatures

  3. Notes
    - Existing records will have for_checking = false (included in signatures)
    - New records will store the actual for_checking value from approval_flows
*/

-- Add for_checking column to approval_ledger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_ledger' AND column_name = 'for_checking'
  ) THEN
    ALTER TABLE approval_ledger ADD COLUMN for_checking boolean DEFAULT false;
  END IF;
END $$;

-- Update the function to use the new column directly
DROP FUNCTION IF EXISTS get_approval_records_with_signatures(uuid, text);

CREATE OR REPLACE FUNCTION get_approval_records_with_signatures(
  p_request_id uuid,
  p_request_type text
)
RETURNS TABLE (
  approver_name text,
  approver_esig text,
  approval_date timestamptz,
  sequence integer
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    al.approver_name,
    up.e_sig as approver_esig,
    al.approval_date,
    al.sequence
  FROM approval_ledger al
  LEFT JOIN user_profiles up ON al.approver_id = up.id
  WHERE al.request_id = p_request_id
    AND al.request_type = p_request_type
    AND al.action = 'Approved'
    AND al.for_checking = false
  ORDER BY al.sequence ASC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text) TO authenticated;

-- Update comment
COMMENT ON FUNCTION get_approval_records_with_signatures IS 'Returns approved approval records with e-signatures, excluding approvers marked as for_checking only using the for_checking column in approval_ledger';
