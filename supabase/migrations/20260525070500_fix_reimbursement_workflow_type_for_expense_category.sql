/*
  # Fix Reimbursement workflow_type to use expense_category

  1. Changes
    - Update get_my_pending_approval_ids: Reimbursement section now determines workflow_type
      from expense_category (Department Expense = 1, ManCom Expense = 2) instead of hardcoded 1
    - Update get_user_pending_approval_counts: Same fix for Reimbursement section

  2. Notes
    - Aligns Reimbursement/Liquidation approval flow behavior with Petty Cash
    - Each expense category now drives its own approval workflow
*/

-- Update get_my_pending_approval_ids - fix the Reimbursement section
CREATE OR REPLACE FUNCTION public.get_my_pending_approval_ids(p_request_type text, p_user_id uuid DEFAULT NULL)
RETURNS TABLE(request_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
v_caller_id uuid;
v_caller_role text;
v_caller_has_full_access boolean;
v_user_id uuid;
v_user_role text;
v_user_has_full_access boolean;
v_user_department text;
v_company_id uuid;
v_request record;
v_current_sequence integer;
v_is_current_approver boolean;
v_workflow_type integer;
v_president_min_amount numeric;
v_requester_approver_type text;
v_approver_email text;
v_checker_email text;
v_approver_user_id uuid;
v_checker_user_id uuid;
v_is_full_access_viewing_own boolean;
v_exec_category text;
v_exec_step_count integer;
v_exec_step_email text;
v_exec_step_user_id uuid;
v_exec_is_budgeted boolean;
v_is_explicit_approver boolean;
v_has_any_approval_permission boolean;
BEGIN
v_caller_id := auth.uid();

SELECT up.role, COALESCE(r.has_full_access, false)
INTO v_caller_role, v_caller_has_full_access
FROM user_profiles up
LEFT JOIN roles r ON lower(r.name) = lower(up.role)
WHERE up.id = v_caller_id;

v_is_full_access_viewing_own := v_caller_has_full_access AND (p_user_id IS NULL OR p_user_id = v_caller_id);

IF p_user_id IS NOT NULL AND v_caller_has_full_access AND p_user_id != v_caller_id THEN
  SELECT up.id, up.role, up.department, up.company_id, COALESCE(r2.has_full_access, false)
  INTO v_user_id, v_user_role, v_user_department, v_company_id, v_user_has_full_access
  FROM user_profiles up
  LEFT JOIN roles r2 ON lower(r2.name) = lower(up.role)
  WHERE up.id = p_user_id;
ELSE
  SELECT up.id, up.role, up.department, up.company_id, COALESCE(r2.has_full_access, false)
  INTO v_user_id, v_user_role, v_user_department, v_company_id, v_user_has_full_access
  FROM user_profiles up
  LEFT JOIN roles r2 ON lower(r2.name) = lower(up.role)
  WHERE up.id = v_caller_id;
END IF;

IF v_user_id IS NULL THEN RETURN; END IF;

v_is_explicit_approver := EXISTS (
  SELECT 1 FROM approval_flows af
  WHERE af.is_active = true
  AND (af.user_id = v_user_id OR af.alternate_approver_id = v_user_id)
);

v_has_any_approval_permission := v_user_has_full_access OR EXISTS (
  SELECT 1
  FROM user_profiles up
  JOIN roles r ON lower(r.name) = lower(up.role)
  JOIN role_permissions rp ON rp.role_id = r.id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE up.id = v_user_id
  AND p.name IN (
    'Purchase Requisition Approval', 'Canvass Approval', 'Cash Advance Approval',
    'Petty Cash Approval', 'Reimbursement Approval', 'Purchase Order Approval',
    'Subject Matter Approval'
  )
);

IF NOT v_has_any_approval_permission AND NOT v_is_explicit_approver THEN RETURN; END IF;

IF v_is_full_access_viewing_own THEN
  IF p_request_type = 'Purchase Requisition' THEN
    RETURN QUERY SELECT pr.id FROM purchase_requisitions pr WHERE pr.status = 'pending';
  ELSIF p_request_type = 'Canvass' THEN
    RETURN QUERY SELECT cr.id FROM canvass_requests cr WHERE cr.status = 'pending';
  ELSIF p_request_type = 'Cash Advance' THEN
    RETURN QUERY SELECT ca.id FROM cash_advance_requests ca WHERE ca.status = 'pending';
  ELSIF p_request_type = 'Petty Cash' THEN
    RETURN QUERY SELECT pc.id FROM petty_cash_requests pc WHERE pc.status = 'pending';
  ELSIF p_request_type = 'Reimbursement' THEN
    RETURN QUERY SELECT rr.id FROM reimbursement_requests rr WHERE rr.status = 'pending';
  ELSIF p_request_type = 'Purchase Order' THEN
    RETURN QUERY SELECT po.id FROM purchase_orders po WHERE po.status = 'pending_approval' AND po.deleted_at IS NULL;
  END IF;
  RETURN;
END IF;

IF p_request_type = 'Purchase Requisition' THEN
FOR v_request IN
  SELECT pr.id, pr.company_id, pr.department, pr.total_amount, pr.is_budgeted,
  pr.current_approval_level, pr.requester_id, pr.purchase_type
  FROM purchase_requisitions pr WHERE pr.status = 'pending'
LOOP
  SELECT up.approver_type, up.approver_email, up.checker_email
  INTO v_requester_approver_type, v_approver_email, v_checker_email
  FROM user_profiles up WHERE up.id = v_request.requester_id;

  IF v_requester_approver_type = 'Executive' THEN
    v_exec_is_budgeted := COALESCE(v_request.is_budgeted, false);
    v_exec_category := CASE WHEN v_exec_is_budgeted THEN 'budgeted' ELSE 'non_budgeted' END;

    SELECT COUNT(*) INTO v_exec_step_count
    FROM executive_approval_steps
    WHERE user_profile_id = v_request.requester_id AND category = v_exec_category;

    IF v_exec_step_count > 0 THEN
      SELECT email INTO v_exec_step_email
      FROM executive_approval_steps
      WHERE user_profile_id = v_request.requester_id AND category = v_exec_category
      ORDER BY sequence OFFSET v_request.current_approval_level LIMIT 1;

      IF v_exec_step_email IS NOT NULL THEN
        SELECT up.id INTO v_exec_step_user_id FROM user_profiles up WHERE up.email = v_exec_step_email LIMIT 1;
        IF v_exec_step_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      END IF;
    ELSE
      v_approver_user_id := NULL; v_checker_user_id := NULL;
      IF v_approver_email IS NOT NULL THEN
        SELECT up.id INTO v_approver_user_id FROM user_profiles up WHERE up.email = v_approver_email LIMIT 1;
      END IF;
      IF v_checker_email IS NOT NULL THEN
        SELECT up.id INTO v_checker_user_id FROM user_profiles up WHERE up.email = v_checker_email LIMIT 1;
      END IF;
      IF v_request.current_approval_level = 0 AND v_approver_user_id IS NOT NULL THEN
        IF v_approver_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      ELSIF (v_request.current_approval_level = 1 OR (v_request.current_approval_level = 0 AND v_approver_user_id IS NULL)) AND v_checker_user_id IS NOT NULL THEN
        IF v_checker_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      END IF;
    END IF;
    CONTINUE;
  END IF;

  SELECT president_min_amount INTO v_president_min_amount FROM companies WHERE id = v_request.company_id;
  IF NOT v_request.is_budgeted THEN v_workflow_type := 1;
  ELSIF v_request.total_amount < COALESCE(v_president_min_amount, 0) THEN v_workflow_type := 2;
  ELSE v_workflow_type := 3;
  END IF;

  v_current_sequence := _current_sequence_for_request(
    v_request.company_id, v_request.department, p_request_type,
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
          AND afs2.request_type = p_request_type AND afs2.is_active = true
        )))
        AND afs.request_type = p_request_type AND afs.is_active = true
      )
      AND af.is_active = true AND af.workflow_type = v_workflow_type AND af.sequence = v_current_sequence
      AND (
        (af.user_id = v_user_id) OR
        (af.alternate_approver_id = v_user_id) OR
        (af.approver_type = 'Department Head' AND v_request.department = v_user_department) OR
        (af.approver_type IN ('Procurement', 'Procurement Head') AND user_has_permission('Procurement Checking')) OR
        (af.approver_type IN ('Accounting', 'Accounting Head') AND user_has_permission('Cash Advance Approval')) OR
        (af.approver_type = 'President' AND v_user_has_full_access)
      )
    );
    IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
      request_id := v_request.id; RETURN NEXT;
    END IF;
  END IF;
END LOOP;

ELSIF p_request_type = 'Canvass' THEN
FOR v_request IN
  SELECT cr.id, cr.company_id, cr.department, cr.total_amount, cr.is_budgeted,
  cr.current_approval_level, cr.requester_id, cr.purchase_type
  FROM canvass_requests cr WHERE cr.status = 'pending'
LOOP
  SELECT up.approver_type, up.approver_email, up.checker_email
  INTO v_requester_approver_type, v_approver_email, v_checker_email
  FROM user_profiles up WHERE up.id = v_request.requester_id;

  IF v_requester_approver_type = 'Executive' THEN
    v_exec_is_budgeted := COALESCE(v_request.is_budgeted, false);
    v_exec_category := CASE WHEN v_exec_is_budgeted THEN 'budgeted' ELSE 'non_budgeted' END;

    SELECT COUNT(*) INTO v_exec_step_count
    FROM executive_approval_steps
    WHERE user_profile_id = v_request.requester_id AND category = v_exec_category;

    IF v_exec_step_count > 0 THEN
      SELECT email INTO v_exec_step_email
      FROM executive_approval_steps
      WHERE user_profile_id = v_request.requester_id AND category = v_exec_category
      ORDER BY sequence OFFSET v_request.current_approval_level LIMIT 1;

      IF v_exec_step_email IS NOT NULL THEN
        SELECT up.id INTO v_exec_step_user_id FROM user_profiles up WHERE up.email = v_exec_step_email LIMIT 1;
        IF v_exec_step_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      END IF;
    ELSE
      v_approver_user_id := NULL; v_checker_user_id := NULL;
      IF v_approver_email IS NOT NULL THEN
        SELECT up.id INTO v_approver_user_id FROM user_profiles up WHERE up.email = v_approver_email LIMIT 1;
      END IF;
      IF v_checker_email IS NOT NULL THEN
        SELECT up.id INTO v_checker_user_id FROM user_profiles up WHERE up.email = v_checker_email LIMIT 1;
      END IF;
      IF v_request.current_approval_level = 0 AND v_approver_user_id IS NOT NULL THEN
        IF v_approver_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      ELSIF (v_request.current_approval_level = 1 OR (v_request.current_approval_level = 0 AND v_approver_user_id IS NULL)) AND v_checker_user_id IS NOT NULL THEN
        IF v_checker_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      END IF;
    END IF;
    CONTINUE;
  END IF;

  SELECT president_min_amount INTO v_president_min_amount FROM companies WHERE id = v_request.company_id;
  IF NOT v_request.is_budgeted THEN v_workflow_type := 1;
  ELSIF v_request.total_amount < COALESCE(v_president_min_amount, 0) THEN v_workflow_type := 2;
  ELSE v_workflow_type := 3;
  END IF;

  v_current_sequence := _current_sequence_for_request(
    v_request.company_id, v_request.department, p_request_type,
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
          AND afs2.request_type = p_request_type AND afs2.is_active = true
        )))
        AND afs.request_type = p_request_type AND afs.is_active = true
      )
      AND af.is_active = true AND af.workflow_type = v_workflow_type AND af.sequence = v_current_sequence
      AND (
        (af.user_id = v_user_id) OR
        (af.alternate_approver_id = v_user_id) OR
        (af.approver_type = 'Department Head' AND v_request.department = v_user_department) OR
        (af.approver_type IN ('Procurement', 'Procurement Head') AND user_has_permission('Procurement Checking')) OR
        (af.approver_type IN ('Accounting', 'Accounting Head') AND user_has_permission('Canvass Approval')) OR
        (af.approver_type = 'President' AND v_user_has_full_access)
      )
    );
    IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
      request_id := v_request.id; RETURN NEXT;
    END IF;
  END IF;
END LOOP;

ELSIF p_request_type = 'Cash Advance' THEN
FOR v_request IN
  SELECT ca.id, ca.company_id, ca.department, ca.amount as total_amount, ca.budgeted as is_budgeted,
  ca.current_approval_level, ca.requester_id
  FROM cash_advance_requests ca WHERE ca.status = 'pending'
LOOP
  SELECT up.approver_type, up.approver_email, up.checker_email
  INTO v_requester_approver_type, v_approver_email, v_checker_email
  FROM user_profiles up WHERE up.id = v_request.requester_id;

  IF v_requester_approver_type = 'Executive' THEN
    v_exec_is_budgeted := COALESCE(v_request.is_budgeted, false);
    v_exec_category := CASE WHEN v_exec_is_budgeted THEN 'budgeted' ELSE 'non_budgeted' END;

    SELECT COUNT(*) INTO v_exec_step_count
    FROM executive_approval_steps
    WHERE user_profile_id = v_request.requester_id AND category = v_exec_category;

    IF v_exec_step_count > 0 THEN
      SELECT email INTO v_exec_step_email
      FROM executive_approval_steps
      WHERE user_profile_id = v_request.requester_id AND category = v_exec_category
      ORDER BY sequence OFFSET v_request.current_approval_level LIMIT 1;

      IF v_exec_step_email IS NOT NULL THEN
        SELECT up.id INTO v_exec_step_user_id FROM user_profiles up WHERE up.email = v_exec_step_email LIMIT 1;
        IF v_exec_step_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      END IF;
    ELSE
      v_approver_user_id := NULL; v_checker_user_id := NULL;
      IF v_approver_email IS NOT NULL THEN
        SELECT up.id INTO v_approver_user_id FROM user_profiles up WHERE up.email = v_approver_email LIMIT 1;
      END IF;
      IF v_checker_email IS NOT NULL THEN
        SELECT up.id INTO v_checker_user_id FROM user_profiles up WHERE up.email = v_checker_email LIMIT 1;
      END IF;
      IF v_request.current_approval_level = 0 AND v_approver_user_id IS NOT NULL THEN
        IF v_approver_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      ELSIF (v_request.current_approval_level = 1 OR (v_request.current_approval_level = 0 AND v_approver_user_id IS NULL)) AND v_checker_user_id IS NOT NULL THEN
        IF v_checker_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      END IF;
    END IF;
    CONTINUE;
  END IF;

  SELECT president_min_amount INTO v_president_min_amount FROM companies WHERE id = v_request.company_id;
  IF NOT v_request.is_budgeted THEN v_workflow_type := 1;
  ELSIF v_request.total_amount < COALESCE(v_president_min_amount, 0) THEN v_workflow_type := 2;
  ELSE v_workflow_type := 3;
  END IF;

  v_current_sequence := _current_sequence_for_request(
    v_request.company_id, v_request.department, p_request_type,
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
          AND afs2.request_type = p_request_type AND afs2.is_active = true
        )))
        AND afs.request_type = p_request_type AND afs.is_active = true
      )
      AND af.is_active = true AND af.workflow_type = v_workflow_type AND af.sequence = v_current_sequence
      AND (
        (af.user_id = v_user_id) OR
        (af.alternate_approver_id = v_user_id) OR
        (af.approver_type = 'Department Head' AND v_request.department = v_user_department) OR
        (af.approver_type IN ('Procurement', 'Procurement Head') AND user_has_permission('Procurement Checking')) OR
        (af.approver_type IN ('Accounting', 'Accounting Head') AND user_has_permission('Cash Advance Approval')) OR
        (af.approver_type = 'President' AND v_user_has_full_access)
      )
    );
    IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
      request_id := v_request.id; RETURN NEXT;
    END IF;
  END IF;
END LOOP;

ELSIF p_request_type = 'Petty Cash' THEN
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
    v_request.company_id, v_request.department, p_request_type,
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
          AND afs2.request_type = p_request_type AND afs2.is_active = true
        )))
        AND afs.request_type = p_request_type AND afs.is_active = true
      )
      AND af.is_active = true AND af.workflow_type = v_workflow_type AND af.sequence = v_current_sequence
      AND (
        (af.user_id = v_user_id) OR
        (af.alternate_approver_id = v_user_id) OR
        (af.approver_type = 'Department Head' AND v_request.department = v_user_department) OR
        (af.approver_type IN ('Procurement', 'Procurement Head') AND user_has_permission('Procurement Checking')) OR
        (af.approver_type IN ('Accounting', 'Accounting Head') AND user_has_permission('Petty Cash Approval')) OR
        (af.approver_type = 'President' AND v_user_has_full_access)
      )
    );
    IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
      request_id := v_request.id; RETURN NEXT;
    END IF;
  END IF;
END LOOP;

ELSIF p_request_type = 'Reimbursement' THEN
FOR v_request IN
  SELECT rr.id, rr.company_id, rr.department, rr.current_approval_level, rr.requester_id,
  rr.expense_category, rr.request_type as reimb_request_type
  FROM reimbursement_requests rr WHERE rr.status = 'pending'
LOOP
  -- Determine workflow_type from expense_category (same logic as Petty Cash)
  IF COALESCE(v_request.expense_category, 'Department Expense') = 'ManCom Expense' THEN
    v_workflow_type := 2;
  ELSE
    v_workflow_type := 1;
  END IF;

  SELECT up.approver_type, up.approver_email, up.checker_email
  INTO v_requester_approver_type, v_approver_email, v_checker_email
  FROM user_profiles up WHERE up.id = v_request.requester_id;

  IF v_requester_approver_type = 'Executive' THEN
    v_exec_category := 'non_budgeted';

    SELECT COUNT(*) INTO v_exec_step_count
    FROM executive_approval_steps
    WHERE user_profile_id = v_request.requester_id AND category = v_exec_category;

    IF v_exec_step_count > 0 THEN
      SELECT email INTO v_exec_step_email
      FROM executive_approval_steps
      WHERE user_profile_id = v_request.requester_id AND category = v_exec_category
      ORDER BY sequence OFFSET v_request.current_approval_level LIMIT 1;

      IF v_exec_step_email IS NOT NULL THEN
        SELECT up.id INTO v_exec_step_user_id FROM user_profiles up WHERE up.email = v_exec_step_email LIMIT 1;
        IF v_exec_step_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      END IF;
    ELSE
      v_approver_user_id := NULL; v_checker_user_id := NULL;
      IF v_approver_email IS NOT NULL THEN
        SELECT up.id INTO v_approver_user_id FROM user_profiles up WHERE up.email = v_approver_email LIMIT 1;
      END IF;
      IF v_checker_email IS NOT NULL THEN
        SELECT up.id INTO v_checker_user_id FROM user_profiles up WHERE up.email = v_checker_email LIMIT 1;
      END IF;
      IF v_request.current_approval_level = 0 AND v_approver_user_id IS NOT NULL THEN
        IF v_approver_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      ELSIF (v_request.current_approval_level = 1 OR (v_request.current_approval_level = 0 AND v_approver_user_id IS NULL)) AND v_checker_user_id IS NOT NULL THEN
        IF v_checker_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      END IF;
    END IF;
    CONTINUE;
  END IF;

  -- Use the reimbursement's request_type (Reimbursement or Liquidation) for approval flow lookup
  v_current_sequence := _current_sequence_for_request(
    v_request.company_id, v_request.department, COALESCE(v_request.reimb_request_type, 'Reimbursement'),
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
          AND afs2.request_type = COALESCE(v_request.reimb_request_type, 'Reimbursement') AND afs2.is_active = true
        )))
        AND afs.request_type = COALESCE(v_request.reimb_request_type, 'Reimbursement') AND afs.is_active = true
      )
      AND af.is_active = true AND af.workflow_type = v_workflow_type AND af.sequence = v_current_sequence
      AND (
        (af.user_id = v_user_id) OR
        (af.alternate_approver_id = v_user_id) OR
        (af.approver_type = 'Department Head' AND v_request.department = v_user_department) OR
        (af.approver_type IN ('Procurement', 'Procurement Head') AND user_has_permission('Procurement Checking')) OR
        (af.approver_type IN ('Accounting', 'Accounting Head') AND user_has_permission('Reimbursement Approval')) OR
        (af.approver_type = 'President' AND v_user_has_full_access)
      )
    );
    IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
      request_id := v_request.id; RETURN NEXT;
    END IF;
  END IF;
END LOOP;

ELSIF p_request_type = 'Purchase Order' THEN
FOR v_request IN
  SELECT po.id, po.company_id, po.department, po.total_amount,
  po.current_approval_level, po.prepared_by as requester_id
  FROM purchase_orders po WHERE po.status = 'pending_approval' AND po.deleted_at IS NULL
LOOP
  v_workflow_type := 1;

  v_current_sequence := _current_sequence_for_request(
    v_request.company_id, v_request.department, p_request_type,
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
          AND afs2.request_type = p_request_type AND afs2.is_active = true
        )))
        AND afs.request_type = p_request_type AND afs.is_active = true
      )
      AND af.is_active = true AND af.workflow_type = v_workflow_type AND af.sequence = v_current_sequence
      AND (
        (af.user_id = v_user_id) OR
        (af.alternate_approver_id = v_user_id) OR
        (af.approver_type = 'Department Head' AND v_request.department = v_user_department) OR
        (af.approver_type IN ('Procurement', 'Procurement Head') AND user_has_permission('Procurement Checking')) OR
        (af.approver_type IN ('Accounting', 'Accounting Head') AND user_has_permission('Purchase Order Approval')) OR
        (af.approver_type = 'President' AND v_user_has_full_access)
      )
    );
    IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
      request_id := v_request.id; RETURN NEXT;
    END IF;
  END IF;
END LOOP;

END IF;
END;
$$;