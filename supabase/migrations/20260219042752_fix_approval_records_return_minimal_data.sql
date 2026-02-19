/*
  # Fix Approval Records to Return Minimal Data

  1. Problem
    - Even with signature_path instead of base64, PostgREST HTTP headers can exceed limits
    - CVM Pawnshop approvers cause "Exceeded maximum allowed HTTP header size" error
    - This occurs during RFP generation when fetching approval records

  2. Solution
    - Modify RPC to return JSONB instead of TABLE
    - Reduce column metadata in HTTP headers
    - Return only essential fields in minimal format

  3. Changes
    - Replace TABLE return type with JSONB
    - Frontend will parse JSON response instead of rows
    - Significantly reduces HTTP header size
*/

DROP FUNCTION IF EXISTS get_approval_records_with_signatures(uuid, text, uuid);

CREATE OR REPLACE FUNCTION get_approval_records_with_signatures(
  p_request_id uuid,
  p_request_type text,
  p_requester_id uuid DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_executive boolean := false;
  v_result jsonb;
BEGIN
  -- Check if requester is Executive
  IF p_requester_id IS NOT NULL THEN
    SELECT COALESCE(approver_type = 'Executive', false)
    INTO v_is_executive
    FROM user_profiles
    WHERE id = p_requester_id;
  END IF;

  -- Build result as JSONB array to minimize HTTP header size
  SELECT jsonb_agg(
    jsonb_build_object(
      'approver_name', filtered_approvals.approver_name,
      'approver_id', filtered_approvals.approver_id,
      'approver_esig', filtered_approvals.approver_esig,
      'approval_date', filtered_approvals.approval_date,
      'sequence', filtered_approvals.sequence,
      'for_checking', filtered_approvals.for_checking
    ) ORDER BY filtered_approvals.sequence
  )
  INTO v_result
  FROM (
    SELECT DISTINCT ON (al.sequence)
      al.approver_name,
      al.approver_id,
      up.signature_path as approver_esig,
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
    ORDER BY al.sequence ASC, al.approval_date DESC
  ) filtered_approvals;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text, uuid) TO authenticated;

-- Update comment
COMMENT ON FUNCTION get_approval_records_with_signatures IS 'Returns approved approval records as JSONB array with minimal HTTP header overhead. Includes signature paths (not base64 data). Uses DISTINCT ON sequence to eliminate duplicates. Executive requesters: first approver only (or first two for Cash Advance). Non-Executive: exclude checkers except for Cash Advance.';