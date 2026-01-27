/*
  # Exclude For Checking Approvers from Signatures

  1. Changes
    - Update get_approval_records_with_signatures function
    - Add join to approval_flows table to check for_checking flag
    - Filter out approvers where for_checking = true
    - Only include approvers who should be signatories
  
  2. Purpose
    - Ensure "for checking only" approvers are not included in PDF signatures
    - Maintain approval process while excluding non-signatory reviewers
    - Keep RFP and other documents clean with only actual signatories
  
  3. Impact
    - All PDF generators using this function will automatically exclude for_checking approvers
    - Applies to RFP, Cash Advance, Petty Cash, Reimbursement, and all other forms
*/

-- Drop and recreate the function with for_checking filter
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
  LEFT JOIN approval_flows af ON (
    af.user_id = al.approver_id 
    AND af.sequence = al.sequence
  )
  WHERE al.request_id = p_request_id
    AND al.request_type = p_request_type
    AND al.action = 'Approved'
    AND (af.for_checking IS NULL OR af.for_checking = false)
  ORDER BY al.sequence ASC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_approval_records_with_signatures(uuid, text) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_approval_records_with_signatures IS 'Returns approved approval records with e-signatures, excluding approvers marked as for_checking only';