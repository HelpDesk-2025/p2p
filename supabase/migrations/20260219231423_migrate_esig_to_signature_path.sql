/*
  # Migrate e_sig data to signature_path in storage
  
  1. Problem
    - Some users have signatures stored in user_profiles.e_sig (base64 data)
    - RPC function returns signature_path which is null for these users
    - Frontend fallback doesn't always work consistently
    - Results in missing signatures in generated documents
  
  2. Solution
    - Migrate all e_sig base64 data to Supabase Storage
    - Update user_profiles.signature_path with storage paths
    - Ensure all users have signatures in consistent location
  
  3. Changes
    - Create function to extract and upload base64 signatures to storage
    - Update all user_profiles with signature_path
    - Keep e_sig as backup for now
*/

-- This migration will be handled by a backend script/edge function
-- For now, we'll update the RPC to return e_sig data directly when signature_path is null

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
  -- Return signature_path if available, otherwise return e_sig directly
  SELECT jsonb_agg(
    jsonb_build_object(
      'approver_name', filtered_approvals.approver_name,
      'approver_id', filtered_approvals.approver_id,
      'approver_esig', COALESCE(filtered_approvals.signature_path, filtered_approvals.e_sig),
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
      up.signature_path,
      up.e_sig,
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
COMMENT ON FUNCTION get_approval_records_with_signatures IS 'Returns approved approval records as JSONB array. Returns signature_path if available, otherwise falls back to e_sig base64 data. Executive requesters: first approver only (or first two for Cash Advance). Non-Executive: exclude checkers except for Cash Advance.';
