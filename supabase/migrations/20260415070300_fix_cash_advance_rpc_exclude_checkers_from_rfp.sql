/*
  # Fix Cash Advance RPC to Exclude Checkers from RFP Signatures

  1. Problem
    - The get_approval_records_with_signatures RPC was including checker/validator
      approvals for Cash Advance requests for non-Executive requesters
    - This caused checkers to appear on the RFP PDF signatures

  2. Solution
    - Update the Cash Advance filter for non-Executive requesters to also
      exclude records where for_checking = true
    - This aligns Cash Advance behavior with other document types

  3. Changes
    - Modified filter condition for non-Executive + Cash Advance to exclude
      for_checking records
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
  IF p_requester_id IS NOT NULL THEN
    SELECT COALESCE(approver_type = 'Executive', false)
    INTO v_is_executive
    FROM user_profiles
    WHERE id = p_requester_id;
  END IF;

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
        (v_is_executive = true AND p_request_type = 'Cash Advance' AND al.sequence IN (1, 2))
        OR (v_is_executive = true AND p_request_type != 'Cash Advance' AND al.sequence = 1)
        OR (v_is_executive = false AND COALESCE(al.for_checking, false) = false)
      )
    ORDER BY al.sequence ASC, al.approval_date DESC
  ) filtered_approvals;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text, uuid) TO authenticated;
