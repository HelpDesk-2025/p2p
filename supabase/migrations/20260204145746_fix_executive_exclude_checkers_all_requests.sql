/*
  # Fix Executive Requester - Exclude Checkers from All Request Types

  1. Changes
    - Update get_approval_records_with_signatures function
    - For Executive requesters: ALWAYS exclude checkers (including Cash Advance)
    - For non-Executive requesters: Keep current behavior (include all approved approvals)

  2. Logic
    - Executive + Any Request Type → Only approvals where for_checking = false
    - Non-Executive + Any Request → All approved approvals

  3. Impact
    - Checkers like Jodell will not appear in signatures for Executive requesters
    - Non-Executive requesters remain unchanged
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
    SELECT COALESCE(requester_type = 'Executive', false)
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
      -- If Executive: always exclude checkers for all request types
      (v_is_executive = true AND COALESCE(al.for_checking, false) = false)
      -- If not Executive: include all approvals
      OR (v_is_executive = false)
    )
  ORDER BY al.sequence ASC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text, uuid) TO authenticated;

-- Update comment
COMMENT ON FUNCTION get_approval_records_with_signatures IS 'Returns approved approval records with e-signatures. For Executive requesters, always excludes checkers. For non-Executive requesters, includes all approved approvals.';
