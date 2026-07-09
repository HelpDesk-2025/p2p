-- Fix: include for_checking approval records in Reimbursement/Liquidation forms
-- so the checker/validator appears as "Noted/Checked By" signatory.
-- Previously only Cash Advance included checkers; now Reimbursement does too.

CREATE OR REPLACE FUNCTION get_approval_records_with_signatures(
  p_request_id uuid,
  p_request_type text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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
p_request_type IN ('Cash Advance', 'Reimbursement', 'Liquidation')
OR (p_request_type NOT IN ('Cash Advance', 'Reimbursement', 'Liquidation') AND COALESCE(al.for_checking, false) = false)
)
ORDER BY al.sequence ASC, al.approval_date DESC
) filtered_approvals;

RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;