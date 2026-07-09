/*
# Exclude checkers from Reimbursement/Liquidation RFP signature records

1. Problem
   - The get_approval_records_with_signatures function was recently updated to include
     for_checking (validator) approvers in Reimbursement and Liquidation RFP forms
   - Checkers/validators should NOT appear as signatories on Reimbursement RFP PDFs
   - Only Cash Advance should include checker signatures in its forms

2. Fix
   - Revert the filter to only include checkers for Cash Advance type
   - Reimbursement and Liquidation will now properly exclude for_checking approvers
     from the generated PDF signatures

3. Important Notes
   - This affects the "APPROVED BY" section of generated RFP PDFs
   - Checkers/validators (e.g. "For Validation" tagged approvers) will no longer
     appear as signatories on Reimbursement and Liquidation forms
*/

CREATE OR REPLACE FUNCTION public.get_approval_records_with_signatures(p_request_id uuid, p_request_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
$function$;
