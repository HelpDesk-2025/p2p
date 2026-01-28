/*
  # Fix Duplicate Signatures in Approval Records

  1. Problem
    - get_approval_records_with_signatures was joining to approval_flows without enough context
    - If a user appears in multiple approval flows (different companies/workflows), it creates duplicates
    - This caused the same person to appear multiple times in the RFP
  
  2. Solution
    - Simplify the function to only query approval_ledger
    - Remove the problematic LEFT JOIN to approval_flows
    - We'll handle for_checking filtering when creating approval ledger records instead
*/

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
    AND al.approver_type != 'For Checking'
  ORDER BY al.sequence ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text) TO authenticated;

COMMENT ON FUNCTION get_approval_records_with_signatures IS 'Returns approved approval records with e-signatures. Simple query without joins to prevent duplicates.';
