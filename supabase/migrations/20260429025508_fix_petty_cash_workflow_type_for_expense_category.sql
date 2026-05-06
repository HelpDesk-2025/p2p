/*
  # Fix Petty Cash workflow type selection for expense category

  ## Summary
  The pending-approvals RPC functions (get_my_pending_approval_ids and
  get_user_pending_approval_counts) hardcoded workflow_type = 1 for all
  Petty Cash requests. However, when a Petty Cash request has expense_category
  = 'ManCom Expense', the frontend uses workflow_type = 2 for the approval
  flow. As a result, ManCom Expense petty cash requests never appeared in the
  assigned approver's queue or the dashboard badge counts.

  ## Changes
  - get_my_pending_approval_ids (text, uuid): for Petty Cash, select
    workflow_type based on pc.expense_category (2 for 'ManCom Expense', else 1).
  - get_user_pending_approval_counts: same logic for dashboard counts.

  ## Notes
  No schema changes. Function bodies only.
*/

CREATE OR REPLACE FUNCTION get_my_pending_approval_ids(p_request_type text, p_user_id uuid DEFAULT NULL)
RETURNS TABLE (request_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_user_id uuid;
  v_user_role text;
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
  v_executive_sequence integer;
  v_is_admin_viewing_own boolean;
BEGIN
  v_caller_id := auth.uid();

  SELECT role INTO v_caller_role
  FROM user_profiles WHERE id = v_caller_id;

  v_is_admin_viewing_own := v_caller_role = 'admin' AND (p_user_id IS NULL OR p_user_id = v_caller_id);

  IF p_user_id IS NOT NULL AND v_caller_role = 'admin' AND p_user_id != v_caller_id THEN
    SELECT id, role, department, company_id
    INTO v_user_id, v_user_role, v_user_department, v_company_id
    FROM user_profiles
    WHERE id = p_user_id;
  ELSE
    SELECT id, role, department, company_id
    INTO v_user_id, v_user_role, v_user_department, v_company_id
    FROM user_profiles
    WHERE id = v_caller_id;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF v_user_role NOT IN ('approver', 'admin', 'procurement', 'accounting') THEN
    RETURN;
  END IF;

  IF v_is_admin_viewing_own THEN
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
    END IF;
    RETURN;
  END IF;

  IF p_request_type = 'Purchase Requisition' THEN
    FOR v_request IN
      SELECT pr.id, pr.company_id, pr.department, pr.total_amount, pr.is_budgeted,
             pr.current_approval_level, pr.requester_id
      FROM purchase_requisitions pr
      WHERE pr.status = 'pending'
    LOOP
      SELECT up.approver_type, up.approver_email, up.checker_email
      INTO v_requester_approver_type, v_approver_email, v_checker_email
      FROM user_profiles up WHERE up.id = v_request.requester_id;

      IF v_requester_approver_type = 'Executive' THEN
        v_executive_sequence := 1;
        v_approver_user_id := NULL;
        v_checker_user_id := NULL;

        IF v_approver_email IS NOT NULL THEN
          SELECT up.id INTO v_approver_user_id FROM user_profiles up WHERE up.email = v_approver_email LIMIT 1;
        END IF;
        IF v_checker_email IS NOT NULL THEN
          SELECT up.id INTO v_checker_user_id FROM user_profiles up WHERE up.email = v_checker_email LIMIT 1;
        END IF;

        IF v_request.current_approval_level = 0 AND v_approver_user_id IS NOT NULL THEN
          IF v_approver_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
            request_id := v_request.id;
            RETURN NEXT;
          END IF;
        ELSIF (v_request.current_approval_level = 1 OR (v_request.current_approval_level = 0 AND v_approver_user_id IS NULL)) AND v_checker_user_id IS NOT NULL THEN
          IF v_checker_user_id = v_user_id AND v_request.requester_id != v_user_id THEN
            request_id := v_request.id;
            RETURN NEXT;
          END IF;
        END IF;
        CONTINUE;
      END IF;

      SELECT president_min_amount INTO v_president_min_amount
      FROM companies WHERE id = v_request.company_id;

      IF NOT v_request.is_budgeted THEN
        v_workflow_type := 1;
      ELSIF v_request.total_amount < COALESCE(v_president_min_amount, 0) THEN
        v_workflow_type := 2;
      ELSE
        v_workflow_type := 3;
      END IF;

      SELECT sequence INTO v_current_sequence
      FROM (
        SELECT DISTINCT af.sequence
        FROM approval_flows af
        WHERE af.approval_flow_setup_id IN (
          SELECT afs.id FROM approval_flow_setups afs
          WHERE afs.company_id = v_request.company_id
            AND (afs.department_id = v_request.department OR (afs.department_id IS NULL AND NOT EXISTS (
              SELECT 1 FROM approval_flow_setups afs2
              WHERE afs2.company_id = v_request.company_id
                AND afs2.department_id = v_request.department
                AND afs2.request_type = p_request_type
                AND afs2.is_active = true
            )))
            AND afs.request_type = p_request_type
            AND afs.is_active = true
        )
        AND af.is_active = true
        AND af.workflow_type = v_workflow_type
        ORDER BY af.sequence
        OFFSET v_request.current_approval_level
        LIMIT 1
      ) unique_sequences;

      IF v_current_sequence IS NOT NULL THEN
        v_is_current_approver := EXISTS (
          SELECT 1
          FROM approval_flows af
          WHERE af.approval_flow_setup_id IN (
            SELECT afs.id FROM approval_flow_setups afs
            WHERE afs.company_id = v_request.company_id
              AND (afs.department_id = v_request.department OR (afs.department_id IS NULL AND NOT EXISTS (
                SELECT 1 FROM approval_flow_setups afs2
                WHERE afs2.company_id = v_request.company_id
                  AND afs2.department_id = v_request.department
                  AND afs2.request_type = p_request_type
                  AND afs2.is_active = true
              )))
              AND afs.request_type = p_request_type
              AND afs.is_active = true
          )
          AND af.is_active = true
          AND af.workflow_type = v_workflow_type
          AND af.sequence = v_current_sequence
          AND (
            (af.user_id = v_user_id) OR
            (af.alternate_approver_id = v_user_id) OR
            (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
            (af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
            (af.approver_type IN ('Accounting', 'Accounting Head') AND v_user_role IN ('accounting', 'approver', 'admin')) OR
            (af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
          )
        );

        IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id;
          RETURN NEXT;
        END IF;
      END IF;
    END LOOP;

  ELSIF p_request_type = 'Canvass' THEN
    FOR v_request IN
      SELECT cr.id, cr.company_id, cr.department, cr.total_amount, cr.is_budgeted,
             cr.current_approval_level, cr.requester_id
      FROM canvass_requests cr
      WHERE cr.status = 'pending'
    LOOP
      SELECT up.approver_type, up.approver_email, up.checker_email
      INTO v_requester_approver_type, v_approver_email, v_checker_email
      FROM user_profiles up WHERE up.id = v_request.requester_id;

      IF v_requester_approver_type = 'Executive' THEN
        v_approver_user_id := NULL;
        v_checker_user_id := NULL;
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
        CONTINUE;
      END IF;

      SELECT president_min_amount INTO v_president_min_amount
      FROM companies WHERE id = v_request.company_id;

      IF NOT v_request.is_budgeted THEN v_workflow_type := 1;
      ELSIF v_request.total_amount < COALESCE(v_president_min_amount, 0) THEN v_workflow_type := 2;
      ELSE v_workflow_type := 3;
      END IF;

      SELECT sequence INTO v_current_sequence
      FROM (
        SELECT DISTINCT af.sequence
        FROM approval_flows af
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
        AND af.is_active = true AND af.workflow_type = v_workflow_type
        ORDER BY af.sequence OFFSET v_request.current_approval_level LIMIT 1
      ) unique_sequences;

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
            (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
            (af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
            (af.approver_type IN ('Accounting', 'Accounting Head') AND v_user_role IN ('accounting', 'approver', 'admin')) OR
            (af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
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
      FROM cash_advance_requests ca
      WHERE ca.status = 'pending'
    LOOP
      SELECT up.approver_type, up.approver_email, up.checker_email
      INTO v_requester_approver_type, v_approver_email, v_checker_email
      FROM user_profiles up WHERE up.id = v_request.requester_id;

      IF v_requester_approver_type = 'Executive' THEN
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
        CONTINUE;
      END IF;

      SELECT president_min_amount INTO v_president_min_amount FROM companies WHERE id = v_request.company_id;

      IF NOT v_request.is_budgeted THEN v_workflow_type := 1;
      ELSIF v_request.total_amount < COALESCE(v_president_min_amount, 0) THEN v_workflow_type := 2;
      ELSE v_workflow_type := 3;
      END IF;

      SELECT sequence INTO v_current_sequence
      FROM (
        SELECT DISTINCT af.sequence FROM approval_flows af
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
        AND af.is_active = true AND af.workflow_type = v_workflow_type
        ORDER BY af.sequence OFFSET v_request.current_approval_level LIMIT 1
      ) unique_sequences;

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
            (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
            (af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
            (af.approver_type IN ('Accounting', 'Accounting Head') AND v_user_role IN ('accounting', 'approver', 'admin')) OR
            (af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
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
      FROM petty_cash_requests pc
      WHERE pc.status = 'pending'
    LOOP
      IF COALESCE(v_request.expense_category, 'Department Expense') = 'ManCom Expense' THEN
        v_workflow_type := 2;
      ELSE
        v_workflow_type := 1;
      END IF;

      SELECT up.approver_type, up.approver_email, up.checker_email
      INTO v_requester_approver_type, v_approver_email, v_checker_email
      FROM user_profiles up WHERE up.id = v_request.requester_id;

      IF v_requester_approver_type = 'Executive' THEN
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
        CONTINUE;
      END IF;

      SELECT sequence INTO v_current_sequence
      FROM (
        SELECT DISTINCT af.sequence FROM approval_flows af
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
        AND af.is_active = true AND af.workflow_type = v_workflow_type
        ORDER BY af.sequence OFFSET v_request.current_approval_level LIMIT 1
      ) unique_sequences;

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
            (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
            (af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
            (af.approver_type IN ('Accounting', 'Accounting Head') AND v_user_role IN ('accounting', 'approver', 'admin')) OR
            (af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
          )
        );
        IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
          request_id := v_request.id; RETURN NEXT;
        END IF;
      END IF;
    END LOOP;

  ELSIF p_request_type = 'Reimbursement' THEN
    FOR v_request IN
      SELECT rr.id, rr.company_id, rr.department, rr.current_approval_level, rr.requester_id
      FROM reimbursement_requests rr
      WHERE rr.status = 'pending'
    LOOP
      v_workflow_type := 1;

      SELECT up.approver_type, up.approver_email, up.checker_email
      INTO v_requester_approver_type, v_approver_email, v_checker_email
      FROM user_profiles up WHERE up.id = v_request.requester_id;

      IF v_requester_approver_type = 'Executive' THEN
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
        CONTINUE;
      END IF;

      SELECT sequence INTO v_current_sequence
      FROM (
        SELECT DISTINCT af.sequence FROM approval_flows af
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
        AND af.is_active = true AND af.workflow_type = v_workflow_type
        ORDER BY af.sequence OFFSET v_request.current_approval_level LIMIT 1
      ) unique_sequences;

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
            (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
            (af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
            (af.approver_type IN ('Accounting', 'Accounting Head') AND v_user_role IN ('accounting', 'approver', 'admin')) OR
            (af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
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

GRANT EXECUTE ON FUNCTION get_my_pending_approval_ids(text, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION get_user_pending_approval_counts()
RETURNS TABLE (
  purchase_requisition_count bigint,
  canvass_request_count bigint,
  petty_cash_request_count bigint,
  reimbursement_request_count bigint,
  cash_advance_request_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
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
  FROM user_profiles
  WHERE id = auth.uid();

  IF v_user_role NOT IN ('approver', 'admin', 'procurement', 'accounting') THEN
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

  FOR v_request IN
    SELECT pr.id, pr.company_id, pr.department, pr.total_amount, pr.is_budgeted,
           pr.current_approval_level, pr.requester_id
    FROM purchase_requisitions pr
    WHERE pr.status = 'pending'
  LOOP
    SELECT president_min_amount INTO v_president_min_amount
    FROM companies WHERE id = v_request.company_id;

    IF NOT v_request.is_budgeted THEN
      v_workflow_type := 1;
    ELSIF v_request.total_amount < COALESCE(v_president_min_amount, 0) THEN
      v_workflow_type := 2;
    ELSE
      v_workflow_type := 3;
    END IF;

    SELECT sequence INTO v_current_sequence
    FROM (
      SELECT DISTINCT af.sequence
      FROM approval_flows af
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
      AND af.is_active = true AND af.workflow_type = v_workflow_type
      ORDER BY af.sequence OFFSET v_request.current_approval_level LIMIT 1
    ) unique_sequences;

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
          (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
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

  FOR v_request IN
    SELECT cr.id, cr.company_id, cr.department, cr.total_amount, cr.is_budgeted,
           cr.current_approval_level, cr.requester_id
    FROM canvass_requests cr
    WHERE cr.status = 'pending'
  LOOP
    SELECT president_min_amount INTO v_president_min_amount
    FROM companies WHERE id = v_request.company_id;

    IF NOT v_request.is_budgeted THEN
      v_workflow_type := 1;
    ELSIF v_request.total_amount < COALESCE(v_president_min_amount, 0) THEN
      v_workflow_type := 2;
    ELSE
      v_workflow_type := 3;
    END IF;

    SELECT sequence INTO v_current_sequence
    FROM (
      SELECT DISTINCT af.sequence
      FROM approval_flows af
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
      AND af.is_active = true AND af.workflow_type = v_workflow_type
      ORDER BY af.sequence OFFSET v_request.current_approval_level LIMIT 1
    ) unique_sequences;

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
          (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
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

  FOR v_request IN
    SELECT ca.id, ca.company_id, ca.department, ca.amount as total_amount, ca.budgeted as is_budgeted,
           ca.current_approval_level, ca.requester_id
    FROM cash_advance_requests ca
    WHERE ca.status = 'pending'
  LOOP
    SELECT president_min_amount INTO v_president_min_amount
    FROM companies WHERE id = v_request.company_id;

    IF NOT v_request.is_budgeted THEN
      v_workflow_type := 1;
    ELSIF v_request.total_amount < COALESCE(v_president_min_amount, 0) THEN
      v_workflow_type := 2;
    ELSE
      v_workflow_type := 3;
    END IF;

    SELECT sequence INTO v_current_sequence
    FROM (
      SELECT DISTINCT af.sequence FROM approval_flows af
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
      AND af.is_active = true AND af.workflow_type = v_workflow_type
      ORDER BY af.sequence OFFSET v_request.current_approval_level LIMIT 1
    ) unique_sequences;

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
          (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
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

  FOR v_request IN
    SELECT pc.id, pc.company_id, pc.department, pc.current_approval_level, pc.requester_id,
           pc.expense_category
    FROM petty_cash_requests pc
    WHERE pc.status = 'pending'
  LOOP
    IF COALESCE(v_request.expense_category, 'Department Expense') = 'ManCom Expense' THEN
      v_workflow_type := 2;
    ELSE
      v_workflow_type := 1;
    END IF;

    SELECT sequence INTO v_current_sequence
    FROM (
      SELECT DISTINCT af.sequence FROM approval_flows af
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
      AND af.is_active = true AND af.workflow_type = v_workflow_type
      ORDER BY af.sequence OFFSET v_request.current_approval_level LIMIT 1
    ) unique_sequences;

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
          (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
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

  FOR v_request IN
    SELECT rr.id, rr.company_id, rr.department, rr.current_approval_level, rr.requester_id
    FROM reimbursement_requests rr
    WHERE rr.status = 'pending'
  LOOP
    v_workflow_type := 1;

    SELECT sequence INTO v_current_sequence
    FROM (
      SELECT DISTINCT af.sequence FROM approval_flows af
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
      AND af.is_active = true AND af.workflow_type = v_workflow_type
      ORDER BY af.sequence OFFSET v_request.current_approval_level LIMIT 1
    ) unique_sequences;

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
          (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
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

GRANT EXECUTE ON FUNCTION get_user_pending_approval_counts() TO authenticated;
