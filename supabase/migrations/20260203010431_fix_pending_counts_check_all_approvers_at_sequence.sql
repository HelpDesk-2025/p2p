/*
  # Fix Pending Approval Counts - Check All Approvers at Current Sequence

  1. Problem
    - The function was using OFFSET/LIMIT to get only ONE approval flow
    - But there can be MULTIPLE approvers at the same sequence
    - This caused the function to miss approvers like Jodell
    
  2. Solution
    - Get the sequence number at current_approval_level
    - Then check if user matches ANY approval flow at that sequence
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
  v_current_sequence integer;
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
    -- Get the sequence number at current approval level
    SELECT DISTINCT af.sequence INTO v_current_sequence
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
    
    IF v_current_sequence IS NOT NULL THEN
      -- Check if user matches ANY approval flow at this sequence
      v_is_current_approver := EXISTS (
        SELECT 1
        FROM approval_flows af
        LEFT JOIN user_profiles up ON af.user_id = up.id
        WHERE af.approval_flow_setup_id IN (
          SELECT afs.id 
          FROM approval_flow_setups afs
          WHERE afs.company_id = v_request.company_id
            AND afs.department_id = v_request.department
            AND afs.request_type = 'Purchase Requisition'
            AND afs.is_active = true
        )
        AND af.is_active = true
        AND af.sequence = v_current_sequence
        AND (
          (af.user_id = v_user_id) OR
          (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
          (af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
          (af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
        )
      );
      
      IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
        v_pr_count := v_pr_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Count Canvass Requests (same logic)
  FOR v_request IN 
    SELECT cr.id, cr.company_id, cr.department, cr.total_amount, cr.is_budgeted,
           cr.current_approval_level, cr.requester_id
    FROM canvass_requests cr
    WHERE cr.status = 'pending'
  LOOP
    SELECT DISTINCT af.sequence INTO v_current_sequence
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
    
    IF v_current_sequence IS NOT NULL THEN
      v_is_current_approver := EXISTS (
        SELECT 1
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
        AND af.sequence = v_current_sequence
        AND (
          (af.user_id = v_user_id) OR
          (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
          (af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
          (af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
        )
      );
      
      IF v_is_current_approver AND v_request.requester_id != v_user_id THEN
        v_canvass_count := v_canvass_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Count Cash Advance Requests
  FOR v_request IN 
    SELECT ca.id, ca.company_id, ca.department, ca.amount, ca.budgeted,
           ca.current_approval_level, ca.requester_id
    FROM cash_advance_requests ca
    WHERE ca.status = 'pending'
  LOOP
    SELECT DISTINCT af.sequence INTO v_current_sequence
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
    
    IF v_current_sequence IS NOT NULL THEN
      v_is_current_approver := EXISTS (
        SELECT 1
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
        AND af.sequence = v_current_sequence
        AND (
          (af.user_id = v_user_id) OR
          (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
          (af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
          (af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
        )
      );
      
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
    SELECT DISTINCT af.sequence INTO v_current_sequence
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
    
    IF v_current_sequence IS NOT NULL THEN
      v_is_current_approver := EXISTS (
        SELECT 1
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
        AND af.sequence = v_current_sequence
        AND (
          (af.user_id = v_user_id) OR
          (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
          (af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
          (af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
        )
      );
      
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
    SELECT DISTINCT af.sequence INTO v_current_sequence
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
    
    IF v_current_sequence IS NOT NULL THEN
      v_is_current_approver := EXISTS (
        SELECT 1
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
        AND af.sequence = v_current_sequence
        AND (
          (af.user_id = v_user_id) OR
          (af.approver_type = 'Department Head' AND v_user_role = 'approver' AND v_request.department = v_user_department) OR
          (af.approver_type IN ('Procurement', 'Procurement Head') AND v_user_role IN ('procurement', 'approver', 'admin')) OR
          (af.approver_type = 'President' AND v_user_role IN ('approver', 'admin'))
        )
      );
      
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
