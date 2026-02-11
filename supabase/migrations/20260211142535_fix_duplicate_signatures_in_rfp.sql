/*
  # Fix Duplicate Signatures in RFP Generation
  
  1. Changes
    - Update get_approval_records_with_signatures to return only one record per sequence
    - Use DISTINCT ON to eliminate duplicate approvals at the same sequence
    - Order by approval_date DESC to get the most recent approval
  
  2. Security
    - Maintains existing security and functionality
    - Only changes the duplicate elimination logic
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
  sequence integer,
  for_checking boolean
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_executive boolean := false;
BEGIN
  -- Check if requester is Executive (use approver_type, not requester_type)
  IF p_requester_id IS NOT NULL THEN
    SELECT COALESCE(approver_type = 'Executive', false)
    INTO v_is_executive
    FROM user_profiles
    WHERE id = p_requester_id;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (filtered_approvals.sequence)
    filtered_approvals.approver_name,
    filtered_approvals.approver_esig,
    filtered_approvals.approval_date,
    filtered_approvals.sequence,
    filtered_approvals.for_checking
  FROM (
    SELECT
      al.approver_name,
      up.e_sig as approver_esig,
      al.approval_date,
      al.sequence,
      COALESCE(al.for_checking, false) as for_checking
    FROM approval_ledger al
    LEFT JOIN user_profiles up ON al.approver_id = up.id
    WHERE al.request_id = p_request_id
      AND al.request_type = p_request_type
      AND al.action = 'Approved'
      AND (
        -- Executive requester + Cash Advance: first and second approver only
        (v_is_executive = true AND p_request_type = 'Cash Advance' AND al.sequence IN (1, 2))
        -- Executive requester + Other documents: first approver only
        OR (v_is_executive = true AND p_request_type != 'Cash Advance' AND al.sequence = 1)
        -- Non-Executive requester + Cash Advance: all approved approvals
        OR (v_is_executive = false AND p_request_type = 'Cash Advance')
        -- Non-Executive requester + Other documents: exclude checkers
        OR (v_is_executive = false AND p_request_type != 'Cash Advance' AND COALESCE(al.for_checking, false) = false)
      )
  ) filtered_approvals
  ORDER BY filtered_approvals.sequence ASC, filtered_approvals.approval_date DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text, uuid) TO authenticated;

-- Update comment
COMMENT ON FUNCTION get_approval_records_with_signatures IS 'Returns unique approved approval records with e-signatures including for_checking flag. Uses DISTINCT ON sequence to eliminate duplicates. Executive requesters: first approver only (or first two for Cash Advance). Non-Executive: exclude checkers except for Cash Advance.';
