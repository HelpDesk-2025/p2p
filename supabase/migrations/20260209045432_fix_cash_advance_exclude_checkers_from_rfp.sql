/*
  # Fix Cash Advance RFP to Exclude Checkers
  
  1. Changes:
    - Update get_approval_records_with_signatures function
    - Exclude approvers with for_checking = true from ALL request types including Cash Advance
  
  2. Rules:
    - Executive requesters: first approver only (or first two for Cash Advance)
    - Non-Executive requesters: exclude checkers from all request types
*/

DROP FUNCTION IF EXISTS get_approval_records_with_signatures(uuid, text, uuid);

CREATE OR REPLACE FUNCTION get_approval_records_with_signatures(
  p_request_id uuid,
  p_request_type text,
  p_requester_id uuid DEFAULT NULL
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
DECLARE
  v_is_executive boolean := false;
BEGIN
  -- Check if requester is Executive
  IF p_requester_id IS NOT NULL THEN
    SELECT COALESCE(approver_type = 'Executive', false)
    INTO v_is_executive
    FROM user_profiles
    WHERE id = p_requester_id;
  END IF;

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
    AND (
      -- Executive requester + Cash Advance: first and second approver only (excluding checkers)
      (v_is_executive = true AND p_request_type = 'Cash Advance' AND al.sequence IN (1, 2) AND COALESCE(al.for_checking, false) = false)
      -- Executive requester + Other documents: first approver only (excluding checkers)
      OR (v_is_executive = true AND p_request_type != 'Cash Advance' AND al.sequence = 1 AND COALESCE(al.for_checking, false) = false)
      -- Non-Executive requester + Cash Advance: all approved approvals (excluding checkers)
      OR (v_is_executive = false AND p_request_type = 'Cash Advance' AND COALESCE(al.for_checking, false) = false)
      -- Non-Executive requester + Other documents: exclude checkers
      OR (v_is_executive = false AND p_request_type != 'Cash Advance' AND COALESCE(al.for_checking, false) = false)
    )
  ORDER BY al.sequence ASC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text, uuid) TO authenticated;

-- Update comment
COMMENT ON FUNCTION get_approval_records_with_signatures IS 'Returns approved approval records with e-signatures, always excluding checkers (for_checking = true). Executive requesters: first approver only (or first two for Cash Advance). Non-Executive: all approved non-checker approvers.';
