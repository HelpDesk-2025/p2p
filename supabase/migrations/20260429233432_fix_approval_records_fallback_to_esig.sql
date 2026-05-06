/*
  # Fix signature fallback for legacy e_sig column

  ## Summary
  get_approval_records_with_signatures returned only user_profiles.signature_path
  for each approver. For users whose signature was never migrated to the new
  signature_path (storage) format and still lives in the legacy e_sig base64
  column, this produced a NULL signature in the generated RFP. The frontend
  fallback that reads user_profiles.e_sig directly is subject to RLS and
  cannot be relied on across users.

  ## Change
  Coalesce signature_path with e_sig inside the RPC so both storage-path and
  base64 signatures flow through. The frontend already branches on the value
  shape (attachments/... vs data:image/...).
*/

CREATE OR REPLACE FUNCTION get_approval_records_with_signatures(
  p_request_id uuid,
  p_request_type text,
  p_requester_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
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
      COALESCE(up.signature_path, up.e_sig) as approver_esig,
      al.approval_date,
      al.sequence,
      COALESCE(al.for_checking, false) as for_checking
    FROM approval_ledger al
    LEFT JOIN user_profiles up ON al.approver_id = up.id
    WHERE al.request_id = p_request_id
      AND al.request_type = p_request_type
      AND al.action = 'Approved'
      AND (
        p_request_type = 'Cash Advance'
        OR (p_request_type != 'Cash Advance' AND COALESCE(al.for_checking, false) = false)
      )
    ORDER BY al.sequence ASC, al.approval_date DESC
  ) filtered_approvals;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
