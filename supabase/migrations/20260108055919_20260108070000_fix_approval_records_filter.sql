/*
  # Fix Approval Records RPC Function Filter
  
  1. Changes
    - Update get_approval_records_with_signatures function
    - Change filter from `action != 'Submitted'` to `action = 'Approved'`
    - Ensures only approved records are returned with signatures
  
  2. Purpose
    - Fix incomplete signatures in RFP documents
    - Only show approved approvals, not pending or rejected ones
*/

-- Drop and recreate the function with correct filter
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
  ORDER BY al.sequence ASC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text) TO authenticated;