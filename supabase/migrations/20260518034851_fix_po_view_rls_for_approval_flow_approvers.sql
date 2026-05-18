/*
  # Fix PO view RLS to include approval flow approvers

  ## Summary
  The user_can_view_po function only checked po_approvals (old system) and
  current_approver_id. Since POs now use the standard approval_flows system,
  approvers assigned in approval_flows couldn't see POs awaiting their approval.

  ## Changes
  1. Updated user_can_view_po to also check if the user is assigned in the
     approval_flows for the PO's company/department/request_type combination.

  ## Security
  - SECURITY DEFINER preserved
  - Users can only view POs where they are legitimate approvers
*/

CREATE OR REPLACE FUNCTION public.user_can_view_po(p_po_id uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_user_dept text;
v_match boolean;
BEGIN
IF p_user IS NULL THEN
RETURN false;
END IF;

IF user_has_po_full_access(p_user) THEN
RETURN true;
END IF;

SELECT department INTO v_user_dept FROM user_profiles WHERE id = p_user;

SELECT EXISTS (
SELECT 1 FROM purchase_orders p
WHERE p.id = p_po_id
AND (
p.requested_by = p_user
OR p.prepared_by = p_user
OR p.created_by = p_user
OR p.current_approver_id = p_user
OR (v_user_dept IS NOT NULL AND v_user_dept <> '' AND p.department = v_user_dept)
OR EXISTS (
SELECT 1 FROM po_approvals a
WHERE a.purchase_order_id = p.id AND a.approver_id = p_user
)
OR EXISTS (
SELECT 1 FROM approval_flows af
JOIN approval_flow_setups afs ON afs.id = af.approval_flow_setup_id
WHERE afs.company_id = p.company_id
AND (afs.department_id = p.department OR afs.department_id IS NULL)
AND afs.request_type = 'Purchase Order'
AND afs.is_active = true
AND af.is_active = true
AND (af.user_id = p_user OR af.alternate_approver_id = p_user)
)
)
) INTO v_match;

RETURN COALESCE(v_match, false);
END;
$function$;