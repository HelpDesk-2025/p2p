/*
  # Fix Pending Approval Counts - Correct Column Names

  1. Changes
    - Fix column names for cash_advance_requests: 
      - total_amount → amount
      - is_budgeted → budgeted
*/

DROP FUNCTION IF EXISTS get_user_pending_approval_counts();

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
  v_current_step record;
  v_is_current_approver boolean;
BEGIN
  -- Get current user's info
  SELECT id, role, department, company_id
  INTO v_user_id, v_user_role, v_user_department, v_company_id
  FROM user_profiles
  WHERE id = auth.uid();
  
  -- Check if user has approval permissions
  IF v_user_role NOT IN ('approver', 'admin', 'procurement') THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;
  
  -- Count Purchase Requisitions
  FOR v_request IN 
    SELECT pr.id, pr.company_id, pr.department, pr.total_amount, pr.is_budgeted, 
           pr.current_approval_level, pr.requester_id
    FROM purchase_requisitions pr
    WHERE pr.status = 'pending'
  LOOP
    -- Get the current approval step (INCLUDE for_checking steps)
    SELECT af.* INTO v_current_step
    FROM approval_flows af
    WHERE af.approval_flow_setup_id IN (
      SELECT afs.id 
      FROM approval_flow_setups afs
      WHERE afs.company_id = v_request.company_id
        AND afs.department_id = v_request.department
        AND afs.request_type = 'Purchase Requisition'
        AND afs.is_active = true
    )
    AND af.is_active = true
    ORDER BY af.sequence
    OFFSET v_request.current_approval_level
    LIMIT 1;
    
    IF v_current_step.id IS NOT NULL THEN
      -- Check if current user is the approver
      v_is_current_approver := false;
      
      IF v_current_step.user_id IS NOT NULL THEN
        v_is_current_approver := v_current_step.user_id = v_user_id;
      ELSIF v_current_step.approver_type = 'Department Head' AND v_user_role = 'approver' THEN
        v_is_current_approver := v_request.department = v_user_department;
      ELSIF v_current_step.approver_type IN ('Procurement', 'Procurement Head') THEN
        v_is_current_approver := v_user_role IN ('procurement', 'approver', 'admin');
      ELSIF v_current_step.approver_type = 'President' THEN
        v_is_current_approver := v_user_role IN ('approver', 'admin');
      END IF;
      
      -- Don't count if user is the requester
      IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
        v_pr_count := v_pr_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Count Canvass Requests
  FOR v_request IN 
    SELECT cr.id, cr.company_id, cr.department, cr.total_amount, cr.is_budgeted,
           cr.current_approval_level, cr.requester_id
    FROM canvass_requests cr
    WHERE cr.status = 'pending'
  LOOP
    SELECT af.* INTO v_current_step
    FROM approval_flows af
    WHERE af.approval_flow_setup_id IN (
      SELECT afs.id 
      FROM approval_flow_setups afs
      WHERE afs.company_id = v_request.company_id
        AND afs.department_id = v_request.department
        AND afs.request_type = 'Canvass'
        AND afs.is_active = true
    )
    AND af.is_active = true
    ORDER BY af.sequence
    OFFSET v_request.current_approval_level
    LIMIT 1;
    
    IF v_current_step.id IS NOT NULL THEN
      v_is_current_approver := false;
      
      IF v_current_step.user_id IS NOT NULL THEN
        v_is_current_approver := v_current_step.user_id = v_user_id;
      ELSIF v_current_step.approver_type = 'Department Head' AND v_user_role = 'approver' THEN
        v_is_current_approver := v_request.department = v_user_department;
      ELSIF v_current_step.approver_type IN ('Procurement', 'Procurement Head') THEN
        v_is_current_approver := v_user_role IN ('procurement', 'approver', 'admin');
      ELSIF v_current_step.approver_type = 'President' THEN
        v_is_current_approver := v_user_role IN ('approver', 'admin');
      END IF;
      
      IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
        v_canvass_count := v_canvass_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Count Cash Advance Requests (FIXED: use 'amount' and 'budgeted' columns)
  FOR v_request IN 
    SELECT ca.id, ca.company_id, ca.department, ca.amount, ca.budgeted,
           ca.current_approval_level, ca.requester_id
    FROM cash_advance_requests ca
    WHERE ca.status = 'pending'
  LOOP
    SELECT af.* INTO v_current_step
    FROM approval_flows af
    WHERE af.approval_flow_setup_id IN (
      SELECT afs.id 
      FROM approval_flow_setups afs
      WHERE afs.company_id = v_request.company_id
        AND afs.department_id = v_request.department
        AND afs.request_type = 'Cash Advance'
        AND afs.is_active = true
    )
    AND af.is_active = true
    ORDER BY af.sequence
    OFFSET v_request.current_approval_level
    LIMIT 1;
    
    IF v_current_step.id IS NOT NULL THEN
      v_is_current_approver := false;
      
      IF v_current_step.user_id IS NOT NULL THEN
        v_is_current_approver := v_current_step.user_id = v_user_id;
      ELSIF v_current_step.approver_type = 'Department Head' AND v_user_role = 'approver' THEN
        v_is_current_approver := v_request.department = v_user_department;
      ELSIF v_current_step.approver_type IN ('Procurement', 'Procurement Head') THEN
        v_is_current_approver := v_user_role IN ('procurement', 'approver', 'admin');
      ELSIF v_current_step.approver_type = 'President' THEN
        v_is_current_approver := v_user_role IN ('approver', 'admin');
      END IF;
      
      IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
        v_ca_count := v_ca_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Count Petty Cash Requests
  FOR v_request IN 
    SELECT pc.id, pc.company_id, pc.department, pc.current_approval_level, pc.requester_id
    FROM petty_cash_requests pc
    WHERE pc.status = 'pending'
  LOOP
    SELECT af.* INTO v_current_step
    FROM approval_flows af
    WHERE af.approval_flow_setup_id IN (
      SELECT afs.id 
      FROM approval_flow_setups afs
      WHERE afs.company_id = v_request.company_id
        AND afs.department_id = v_request.department
        AND afs.request_type = 'Petty Cash'
        AND afs.is_active = true
    )
    AND af.is_active = true
    ORDER BY af.sequence
    OFFSET v_request.current_approval_level
    LIMIT 1;
    
    IF v_current_step.id IS NOT NULL THEN
      v_is_current_approver := false;
      
      IF v_current_step.user_id IS NOT NULL THEN
        v_is_current_approver := v_current_step.user_id = v_user_id;
      ELSIF v_current_step.approver_type = 'Department Head' AND v_user_role = 'approver' THEN
        v_is_current_approver := v_request.department = v_user_department;
      ELSIF v_current_step.approver_type IN ('Procurement', 'Procurement Head') THEN
        v_is_current_approver := v_user_role IN ('procurement', 'approver', 'admin');
      ELSIF v_current_step.approver_type = 'President' THEN
        v_is_current_approver := v_user_role IN ('approver', 'admin');
      END IF;
      
      IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
        v_pc_count := v_pc_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Count Reimbursement Requests
  FOR v_request IN 
    SELECT rr.id, rr.company_id, rr.department, rr.current_approval_level, rr.requester_id
    FROM reimbursement_requests rr
    WHERE rr.status = 'pending'
  LOOP
    SELECT af.* INTO v_current_step
    FROM approval_flows af
    WHERE af.approval_flow_setup_id IN (
      SELECT afs.id 
      FROM approval_flow_setups afs
      WHERE afs.company_id = v_request.company_id
        AND afs.department_id = v_request.department
        AND afs.request_type = 'Reimbursement'
        AND afs.is_active = true
    )
    AND af.is_active = true
    ORDER BY af.sequence
    OFFSET v_request.current_approval_level
    LIMIT 1;
    
    IF v_current_step.id IS NOT NULL THEN
      v_is_current_approver := false;
      
      IF v_current_step.user_id IS NOT NULL THEN
        v_is_current_approver := v_current_step.user_id = v_user_id;
      ELSIF v_current_step.approver_type = 'Department Head' AND v_user_role = 'approver' THEN
        v_is_current_approver := v_request.department = v_user_department;
      ELSIF v_current_step.approver_type IN ('Procurement', 'Procurement Head') THEN
        v_is_current_approver := v_user_role IN ('procurement', 'approver', 'admin');
      ELSIF v_current_step.approver_type = 'President' THEN
        v_is_current_approver := v_user_role IN ('approver', 'admin');
      END IF;
      
      IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
        v_reimb_count := v_reimb_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Return the counts
  RETURN QUERY SELECT v_pr_count, v_canvass_count, v_pc_count, v_reimb_count, v_ca_count;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_pending_approval_counts() TO authenticated;

COMMENT ON FUNCTION get_user_pending_approval_counts IS 'Returns pending approval counts for current user, INCLUDING for_checking steps since those approvers still need to approve/reject';
