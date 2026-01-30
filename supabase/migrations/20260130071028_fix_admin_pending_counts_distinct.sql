/*
  # Fix Admin Pending Counts with DISTINCT ON

  1. Changes
    - Update `get_user_pending_approval_counts` function
    - Fix admin query to use DISTINCT ON for handling duplicate approval flows
    - Use same logic as regular approvers for consistency
    
  2. Issue
    - Admin count queries were not using DISTINCT ON (af.sequence)
    - This caused incorrect counts when there were duplicate approval flows
    
  3. Fix
    - Apply DISTINCT ON (af.sequence) to all admin count queries
    - Ensures only one approval flow per sequence is selected
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
  v_is_admin boolean;
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
  
  -- Check if user is admin
  v_is_admin := v_user_role = 'admin';
  
  -- If admin, count all pending requests (except for_checking steps)
  IF v_is_admin THEN
    -- Count PRs where current step is not for_checking
    FOR v_request IN 
      SELECT pr.id, pr.company_id, pr.department, pr.current_approval_level
      FROM purchase_requisitions pr
      WHERE pr.status = 'pending'
    LOOP
      SELECT af.* INTO v_current_step
      FROM (
        SELECT DISTINCT ON (af.sequence) af.*
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
        AND af.for_checking = false
        ORDER BY af.sequence, af.id
      ) af
      OFFSET v_request.current_approval_level
      LIMIT 1;
      
      IF v_current_step.id IS NOT NULL THEN
        v_pr_count := v_pr_count + 1;
      END IF;
    END LOOP;
    
    -- Count Canvass where current step is not for_checking
    FOR v_request IN 
      SELECT cr.id, cr.company_id, cr.department, cr.current_approval_level
      FROM canvass_requests cr
      WHERE cr.status = 'pending'
    LOOP
      SELECT af.* INTO v_current_step
      FROM (
        SELECT DISTINCT ON (af.sequence) af.*
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
        AND af.for_checking = false
        ORDER BY af.sequence, af.id
      ) af
      OFFSET v_request.current_approval_level
      LIMIT 1;
      
      IF v_current_step.id IS NOT NULL THEN
        v_canvass_count := v_canvass_count + 1;
      END IF;
    END LOOP;
    
    -- Count Cash Advance where current step is not for_checking
    FOR v_request IN 
      SELECT ca.id, ca.company_id, ca.department, ca.current_approval_level
      FROM cash_advance_requests ca
      WHERE ca.status = 'pending'
    LOOP
      SELECT af.* INTO v_current_step
      FROM (
        SELECT DISTINCT ON (af.sequence) af.*
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
        AND af.for_checking = false
        ORDER BY af.sequence, af.id
      ) af
      OFFSET v_request.current_approval_level
      LIMIT 1;
      
      IF v_current_step.id IS NOT NULL THEN
        v_ca_count := v_ca_count + 1;
      END IF;
    END LOOP;
    
    -- Count Petty Cash where current step is not for_checking
    FOR v_request IN 
      SELECT pc.id, pc.company_id, pc.department, pc.current_approval_level
      FROM petty_cash_requests pc
      WHERE pc.status = 'pending'
    LOOP
      SELECT af.* INTO v_current_step
      FROM (
        SELECT DISTINCT ON (af.sequence) af.*
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
        AND af.for_checking = false
        ORDER BY af.sequence, af.id
      ) af
      OFFSET v_request.current_approval_level
      LIMIT 1;
      
      IF v_current_step.id IS NOT NULL THEN
        v_pc_count := v_pc_count + 1;
      END IF;
    END LOOP;
    
    -- Count Reimbursement where current step is not for_checking
    FOR v_request IN 
      SELECT rr.id, rr.company_id, rr.department, rr.current_approval_level
      FROM reimbursement_requests rr
      WHERE rr.status = 'pending'
    LOOP
      SELECT af.* INTO v_current_step
      FROM (
        SELECT DISTINCT ON (af.sequence) af.*
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
        AND af.for_checking = false
        ORDER BY af.sequence, af.id
      ) af
      OFFSET v_request.current_approval_level
      LIMIT 1;
      
      IF v_current_step.id IS NOT NULL THEN
        v_reimb_count := v_reimb_count + 1;
      END IF;
    END LOOP;
    
    -- Return counts for admin
    RETURN QUERY SELECT v_pr_count, v_canvass_count, v_pc_count, v_reimb_count, v_ca_count;
    RETURN;
  END IF;
  
  -- For non-admin approvers, use the existing logic
  -- Count Purchase Requisitions
  FOR v_request IN 
    SELECT pr.id, pr.company_id, pr.department, pr.current_approval_level, pr.requester_id
    FROM purchase_requisitions pr
    WHERE pr.status = 'pending'
  LOOP
    SELECT af.* INTO v_current_step
    FROM (
      SELECT DISTINCT ON (af.sequence) af.*
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
      AND af.for_checking = false
      ORDER BY af.sequence, af.id
    ) af
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
        v_pr_count := v_pr_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Count Canvass Requests
  FOR v_request IN 
    SELECT cr.id, cr.company_id, cr.department, cr.current_approval_level, cr.requester_id
    FROM canvass_requests cr
    WHERE cr.status = 'pending'
  LOOP
    SELECT af.* INTO v_current_step
    FROM (
      SELECT DISTINCT ON (af.sequence) af.*
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
      AND af.for_checking = false
      ORDER BY af.sequence, af.id
    ) af
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
  
  -- Count Cash Advance Requests
  FOR v_request IN 
    SELECT ca.id, ca.company_id, ca.department, ca.current_approval_level, ca.requester_id
    FROM cash_advance_requests ca
    WHERE ca.status = 'pending'
  LOOP
    SELECT af.* INTO v_current_step
    FROM (
      SELECT DISTINCT ON (af.sequence) af.*
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
      AND af.for_checking = false
      ORDER BY af.sequence, af.id
    ) af
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
    FROM (
      SELECT DISTINCT ON (af.sequence) af.*
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
      AND af.for_checking = false
      ORDER BY af.sequence, af.id
    ) af
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
    FROM (
      SELECT DISTINCT ON (af.sequence) af.*
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
      AND af.for_checking = false
      ORDER BY af.sequence, af.id
    ) af
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
