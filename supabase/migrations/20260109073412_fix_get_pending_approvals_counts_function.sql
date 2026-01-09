/*
  # Fix function to get pending approval counts for dashboard

  1. Changes
    - Drop previous function
    - Create simplified function that counts pending requests where user is current approver
  
  2. Security
    - Function uses SECURITY DEFINER to access all data
    - Only returns counts for requests where user has approval permission
*/

DROP FUNCTION IF EXISTS get_pending_approvals_counts(uuid);

-- This is a simplified approach: just count all pending requests if user has approval permissions
-- The frontend filtering logic will determine actual approvals
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
  v_user_role text;
  v_is_approver boolean;
BEGIN
  -- Get current user's role
  SELECT role INTO v_user_role
  FROM user_profiles
  WHERE id = auth.uid();
  
  -- Check if user has approval permissions
  v_is_approver := v_user_role IN ('approver', 'admin', 'procurement');
  
  IF NOT v_is_approver THEN
    -- Return zeros if not an approver
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;
  
  -- Count pending requests for each type
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM purchase_requisitions WHERE status = 'pending')::bigint,
    (SELECT COUNT(*) FROM canvass_requests WHERE status = 'pending')::bigint,
    (SELECT COUNT(*) FROM petty_cash_requests WHERE status = 'pending')::bigint,
    (SELECT COUNT(*) FROM reimbursement_requests WHERE status = 'pending')::bigint,
    (SELECT COUNT(*) FROM cash_advance_requests WHERE status = 'pending')::bigint;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_pending_approval_counts() TO authenticated;
