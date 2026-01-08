/*
  # Create Function to Get Approval Records with Signatures
  
  1. New Function
    - `get_approval_records_with_signatures` - Fetches approval ledger records with e-signatures
    - Uses SECURITY DEFINER to bypass RLS restrictions
    - Returns all approval records for a given request with associated e-signatures
  
  2. Purpose
    - Ensures approvers can fetch complete approval history regardless of RLS
    - Used when generating PDFs that need all signatures
    - Prevents incomplete signature issues in approval documents
  
  3. Security
    - SECURITY DEFINER allows function to run with creator's privileges
    - Only returns data for specified request_id and request_type
    - No direct user input in queries (parameterized)
*/

-- Create function to get approval records with signatures
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
    AND al.action != 'Submitted'
  ORDER BY al.sequence ASC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text) TO authenticated;