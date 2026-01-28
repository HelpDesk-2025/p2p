/*
  # Fix Signature Path in Approval Records Function

  1. Changes
    - Update `get_approval_records_with_signatures` function to read from `signature_path` column
    - Falls back to old `e_sig` column for backward compatibility
    - Ensures PDF generation uses the correct signature storage path

  2. Impact
    - Fixes signature display in generated PDFs (PRs, Cash Advances, Canvass, etc.)
    - Maintains compatibility with any old signatures stored in `e_sig` column
*/

-- Update function to read from signature_path (with fallback to e_sig)
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
    COALESCE(up.signature_path, up.e_sig) as approver_esig,
    al.approval_date,
    al.sequence
  FROM approval_ledger al
  LEFT JOIN user_profiles up ON al.approver_id = up.id
  WHERE al.request_id = p_request_id
    AND al.request_type = p_request_type
    AND al.action != 'Submitted'
  ORDER BY al.sequence ASC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text) TO authenticated;