/*
  # Fix pending approval counts to include purchase type filter

  1. Changes
    - Update `get_user_pending_approval_counts` to pass purchase_type to `_current_sequence_for_request`
    - Affects Purchase Requisition and Canvass request counts

  2. Problem
    - Dashboard counts were incorrect when approval flows had purchase-type-specific steps
    - Steps marked as PO-only were incorrectly included for Non-PO requests
*/

DROP FUNCTION IF EXISTS get_user_pending_approval_counts();

CREATE OR REPLACE FUNCTION get_user_pending_approval_counts()
RETURNS TABLE(purchase_requisition_count bigint, canvass_request_count bigint, petty_cash_request_count bigint, reimbursement_request_count bigint, cash_advance_request_count bigint)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
v_user_id uuid;
v_user_role text;
v_user_department text;
v_company_id uuid;
v_pr_count bigint := 0;
v_canvass_count bigint := 0;
v_pc_count bigint := 0;
v_reimb_count bigint := 0;
v_ca_count bigint := 0;
v_request record;
v_current_sequence integer;
v_is_current_approver boolean;
v_workflow_type integer;
v_president_min_amount numeric;
BEGIN
SELECT id, role, department, company_id
INTO v_user_id, v_user_role, v_user_department, v_company_id
FROM user_profiles WHERE id = auth.uid();

IF v_user_role NOT IN ('approver', 'admin', 'procurement', 'accounting', 'treasury') THEN
RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
RETURN;
END IF;

IF v_user_role = 'admin' THEN
SELECT
(SELECT COUNT(*) FROM purchase_requisitions WHERE status = 'pending'),
(SELECT COUNT(*) FROM canvass_requests WHERE status = 'pending'),
(SELECT COUNT(*) FROM petty_cash_requests WHERE status = 'pending'),
(SELECT COUNT(*) FROM reimbursement_requests WHERE status = 'pending'),
(SELECT COUNT(*) FROM cash_advance_requests WHERE status = 'pending')
INTO v_pr_count, v_canvass_count, v_pc_count, v_reimb_count, v_ca_count;
RETURN QUERY SELECT v_pr_count, v_canvass_count, v_pc_count, v_reimb_count, v_ca_count;
RETURN;
END IF;

-- Purchase Requisitions (with purchase_type filter)
FOR v_request IN
SELECT pr.id, pr.company_id, pr.department, pr.total_amount, pr.is_budgeted,
pr.current_approval_level, pr.requester_id, pr.purchase_type
FROM purchase_requisitions pr WHERE pr.status = 'pending'
LOOP
SELECT president_min_amount INTO v_president_min_amount FROM companies WHERE id = v_request.company_id;
IF NOT v_request.is_budgeted THEN v_workflow_type := 1;
ELSIF v_request.total_amount < COALESCE(v_president_min_amount, 0) THEN v_workflow_type := 2;
ELSE v_workflow_type := 3;
END IF;

v_current_sequence := _current_sequence_for_request(
v_request.company_id, v_request.department, 'Purchase Requisition',
v_workflow_type, v_request.requester_id, v_request.current_approval_level,
v_request.purchase_type
);

IF v_current_sequence IS NOT NULL THEN
v_is_current_approver := EXISTS (
SELECT 1 FROM approval_flows af
WHERE af.approval_flow_setup_id IN (
SELECT afs.id FROM approval_flow_setups afs
WHERE afs.company_id = v_request.company_id
AND (afs.department_id = v_request.department OR (afs.department_id IS NULL AND NOT EXISTS (
SELECT 1 FROM approval_flow_setups afs2
WHERE afs2.company_id = v_request.company_id AND afs2.department_id = v_request.department
AND afs2.request_type = 'Purchase Requisition' AND afs2.is_active = true
)))
AND afs.request_type = 'Purchase Requisition' AND afs.is_active = true
)
AND af.is_active = true AND af.workflow_type = v_workflow_type AND af.sequence = v_current_sequence
AND (
(af.user_id = v_user_id) OR
(af.alternate_approver_id = v_user_id) OR
(af.approver_type = 'Department Head' AND v_user_role IN ('approver', 'treasury') AND v_request.department = v_user_department) OR
(af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
(af.approver_type IN ('Accounting', 'Accounting Head') AND v_user_role IN ('accounting', 'approver', 'admin')) OR
(af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
)
);
IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
v_pr_count := v_pr_count + 1;
END IF;
END IF;
END LOOP;

-- Canvass Requests (with purchase_type filter)
FOR v_request IN
SELECT cr.id, cr.company_id, cr.department, cr.total_amount, cr.is_budgeted,
cr.current_approval_level, cr.requester_id, cr.purchase_type
FROM canvass_requests cr WHERE cr.status = 'pending'
LOOP
SELECT president_min_amount INTO v_president_min_amount FROM companies WHERE id = v_request.company_id;
IF NOT v_request.is_budgeted THEN v_workflow_type := 1;
ELSIF v_request.total_amount < COALESCE(v_president_min_amount, 0) THEN v_workflow_type := 2;
ELSE v_workflow_type := 3;
END IF;

v_current_sequence := _current_sequence_for_request(
v_request.company_id, v_request.department, 'Canvass',
v_workflow_type, v_request.requester_id, v_request.current_approval_level,
v_request.purchase_type
);

IF v_current_sequence IS NOT NULL THEN
v_is_current_approver := EXISTS (
SELECT 1 FROM approval_flows af
WHERE af.approval_flow_setup_id IN (
SELECT afs.id FROM approval_flow_setups afs
WHERE afs.company_id = v_request.company_id
AND (afs.department_id = v_request.department OR (afs.department_id IS NULL AND NOT EXISTS (
SELECT 1 FROM approval_flow_setups afs2
WHERE afs2.company_id = v_request.company_id AND afs2.department_id = v_request.department
AND afs2.request_type = 'Canvass' AND afs2.is_active = true
)))
AND afs.request_type = 'Canvass' AND afs.is_active = true
)
AND af.is_active = true AND af.workflow_type = v_workflow_type AND af.sequence = v_current_sequence
AND (
(af.user_id = v_user_id) OR
(af.alternate_approver_id = v_user_id) OR
(af.approver_type = 'Department Head' AND v_user_role IN ('approver', 'treasury') AND v_request.department = v_user_department) OR
(af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
(af.approver_type IN ('Accounting', 'Accounting Head') AND v_user_role IN ('accounting', 'approver', 'admin')) OR
(af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
)
);
IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
v_canvass_count := v_canvass_count + 1;
END IF;
END IF;
END LOOP;

-- Cash Advance Requests
FOR v_request IN
SELECT ca.id, ca.company_id, ca.department, ca.amount as total_amount, ca.budgeted as is_budgeted,
ca.current_approval_level, ca.requester_id
FROM cash_advance_requests ca WHERE ca.status = 'pending'
LOOP
SELECT president_min_amount INTO v_president_min_amount FROM companies WHERE id = v_request.company_id;
IF NOT v_request.is_budgeted THEN v_workflow_type := 1;
ELSIF v_request.total_amount < COALESCE(v_president_min_amount, 0) THEN v_workflow_type := 2;
ELSE v_workflow_type := 3;
END IF;

v_current_sequence := _current_sequence_for_request(
v_request.company_id, v_request.department, 'Cash Advance',
v_workflow_type, v_request.requester_id, v_request.current_approval_level
);

IF v_current_sequence IS NOT NULL THEN
v_is_current_approver := EXISTS (
SELECT 1 FROM approval_flows af
WHERE af.approval_flow_setup_id IN (
SELECT afs.id FROM approval_flow_setups afs
WHERE afs.company_id = v_request.company_id
AND (afs.department_id = v_request.department OR (afs.department_id IS NULL AND NOT EXISTS (
SELECT 1 FROM approval_flow_setups afs2
WHERE afs2.company_id = v_request.company_id AND afs2.department_id = v_request.department
AND afs2.request_type = 'Cash Advance' AND afs2.is_active = true
)))
AND afs.request_type = 'Cash Advance' AND afs.is_active = true
)
AND af.is_active = true AND af.workflow_type = v_workflow_type AND af.sequence = v_current_sequence
AND (
(af.user_id = v_user_id) OR
(af.alternate_approver_id = v_user_id) OR
(af.approver_type = 'Department Head' AND v_user_role IN ('approver', 'treasury') AND v_request.department = v_user_department) OR
(af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
(af.approver_type IN ('Accounting', 'Accounting Head') AND v_user_role IN ('accounting', 'approver', 'admin')) OR
(af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
)
);
IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
v_ca_count := v_ca_count + 1;
END IF;
END IF;
END LOOP;

-- Petty Cash Requests
FOR v_request IN
SELECT pc.id, pc.company_id, pc.department, pc.current_approval_level, pc.requester_id,
pc.expense_category
FROM petty_cash_requests pc WHERE pc.status = 'pending'
LOOP
IF COALESCE(v_request.expense_category, 'Department Expense') = 'ManCom Expense' THEN
v_workflow_type := 2;
ELSE
v_workflow_type := 1;
END IF;

v_current_sequence := _current_sequence_for_request(
v_request.company_id, v_request.department, 'Petty Cash',
v_workflow_type, v_request.requester_id, v_request.current_approval_level
);

IF v_current_sequence IS NOT NULL THEN
v_is_current_approver := EXISTS (
SELECT 1 FROM approval_flows af
WHERE af.approval_flow_setup_id IN (
SELECT afs.id FROM approval_flow_setups afs
WHERE afs.company_id = v_request.company_id
AND (afs.department_id = v_request.department OR (afs.department_id IS NULL AND NOT EXISTS (
SELECT 1 FROM approval_flow_setups afs2
WHERE afs2.company_id = v_request.company_id AND afs2.department_id = v_request.department
AND afs2.request_type = 'Petty Cash' AND afs2.is_active = true
)))
AND afs.request_type = 'Petty Cash' AND afs.is_active = true
)
AND af.is_active = true AND af.workflow_type = v_workflow_type AND af.sequence = v_current_sequence
AND (
(af.user_id = v_user_id) OR
(af.alternate_approver_id = v_user_id) OR
(af.approver_type = 'Department Head' AND v_user_role IN ('approver', 'treasury') AND v_request.department = v_user_department) OR
(af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
(af.approver_type IN ('Accounting', 'Accounting Head') AND v_user_role IN ('accounting', 'approver', 'admin')) OR
(af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
)
);
IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
v_pc_count := v_pc_count + 1;
END IF;
END IF;
END LOOP;

-- Reimbursement Requests
FOR v_request IN
SELECT rr.id, rr.company_id, rr.department, rr.current_approval_level, rr.requester_id
FROM reimbursement_requests rr WHERE rr.status = 'pending'
LOOP
v_workflow_type := 1;

v_current_sequence := _current_sequence_for_request(
v_request.company_id, v_request.department, 'Reimbursement',
v_workflow_type, v_request.requester_id, v_request.current_approval_level
);

IF v_current_sequence IS NOT NULL THEN
v_is_current_approver := EXISTS (
SELECT 1 FROM approval_flows af
WHERE af.approval_flow_setup_id IN (
SELECT afs.id FROM approval_flow_setups afs
WHERE afs.company_id = v_request.company_id
AND (afs.department_id = v_request.department OR (afs.department_id IS NULL AND NOT EXISTS (
SELECT 1 FROM approval_flow_setups afs2
WHERE afs2.company_id = v_request.company_id AND afs2.department_id = v_request.department
AND afs2.request_type = 'Reimbursement' AND afs2.is_active = true
)))
AND afs.request_type = 'Reimbursement' AND afs.is_active = true
)
AND af.is_active = true AND af.workflow_type = v_workflow_type AND af.sequence = v_current_sequence
AND (
(af.user_id = v_user_id) OR
(af.alternate_approver_id = v_user_id) OR
(af.approver_type = 'Department Head' AND v_user_role IN ('approver', 'treasury') AND v_request.department = v_user_department) OR
(af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
(af.approver_type IN ('Accounting', 'Accounting Head') AND v_user_role IN ('accounting', 'approver', 'admin')) OR
(af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
)
);
IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
v_reimb_count := v_reimb_count + 1;
END IF;
END IF;
END LOOP;

RETURN QUERY SELECT v_pr_count, v_canvass_count, v_pc_count, v_reimb_count, v_ca_count;
END;
$$;