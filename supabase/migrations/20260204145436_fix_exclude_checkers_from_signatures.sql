/*
  # Exclude Checkers from Signatures - Fix

  1. Changes
    - Update get_approval_records_with_signatures function
    - Always exclude approvers where for_checking = true
    - Apply to ALL request types and ALL requester types

  2. Purpose
    - Ensure "for checking only" approvers are NEVER included in PDF signatures
    - Applies to all request types (PR, Canvass, Cash Advance, Petty Cash, Reimbursement)
    - Applies regardless of requester type (Executive or non-Executive)

  3. Impact
    - All PDF generators will exclude checkers from signature sections
    - Checkers will still appear in approval ledger and tracking
    - Only actual signatories will appear in generated RFPs and forms
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
    AND COALESCE(al.for_checking, false) = false
  ORDER BY al.sequence ASC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text, uuid) TO authenticated;

-- Update comment
COMMENT ON FUNCTION get_approval_records_with_signatures IS 'Returns approved approval records with e-signatures, excluding all approvers marked as for_checking only';
