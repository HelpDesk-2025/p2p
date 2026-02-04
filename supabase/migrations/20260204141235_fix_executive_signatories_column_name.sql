/*
  # Fix Executive Signatories - Correct Column Name

  1. Changes
    - Update get_approval_records_with_signatures to use correct column name
    - Column is 'approver_type' not 'requester_type'
    
  2. Logic
    - Executive + Non-Cash Advance → Only approvals where for_checking = false
    - Executive + Cash Advance → All approved approvals
    - Non-Executive + Any Request → All approved approvals
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
      -- If Executive and NOT Cash Advance: exclude checkers
      (v_is_executive = true AND p_request_type != 'Cash Advance' AND al.for_checking = false)
      -- If Executive and IS Cash Advance: include all approvals
      OR (v_is_executive = true AND p_request_type = 'Cash Advance')
      -- If not Executive: include all approvals
      OR (v_is_executive = false)
    )
  ORDER BY al.sequence ASC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text, uuid) TO authenticated;

-- Update comment
COMMENT ON FUNCTION get_approval_records_with_signatures IS 'Returns approved approval records with e-signatures. For Executive requesters, excludes checkers except for Cash Advance requests.';