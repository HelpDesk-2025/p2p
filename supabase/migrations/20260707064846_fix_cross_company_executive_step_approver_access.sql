-- Fix: user_is_approver_for_company should also check executive_approval_steps
-- This allows users referenced by email in an executive's approval steps to view
-- PRs from that executive's company (cross-company executive routing).

CREATE OR REPLACE FUNCTION user_is_approver_for_company(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
v_uid uuid := auth.uid();
BEGIN
IF v_uid IS NULL THEN
RETURN false;
END IF;

-- Check regular approval_flows
IF EXISTS (
SELECT 1
FROM approval_flows af
LEFT JOIN approval_flow_setups afs ON af.approval_flow_setup_id = afs.id
WHERE (af.company_id = p_company_id OR afs.company_id = p_company_id)
AND af.is_active = true
AND (af.user_id = v_uid OR af.alternate_approver_id = v_uid)
) THEN
RETURN true;
END IF;

-- Check executive_approval_steps: if this user's email appears in steps
-- for an executive belonging to the target company
RETURN EXISTS (
SELECT 1
FROM executive_approval_steps eas
JOIN user_profiles exec_up ON exec_up.id = eas.user_profile_id
JOIN user_profiles viewer ON viewer.id = v_uid
WHERE exec_up.company_id = p_company_id
AND eas.email = viewer.email
);
END;
$$;