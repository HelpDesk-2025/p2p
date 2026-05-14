/*
  # Fix Purchase Orders RLS recursion

  ## Problem
  The "PO select for same department" policy referenced user_profiles in a
  subquery, which under certain user_profiles policies causes an infinite
  recursion when Postgres re-checks RLS on the dependent table.

  ## Fix
  Replace the four overlapping SELECT policies with a single policy backed by a
  SECURITY DEFINER helper function. The helper bypasses RLS on user_profiles
  cleanly and centralizes the access logic.

  No data is modified.
*/

CREATE OR REPLACE FUNCTION user_can_view_po(p_po_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      )
  ) INTO v_match;

  RETURN COALESCE(v_match, false);
END;
$$;

GRANT EXECUTE ON FUNCTION user_can_view_po(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "PO select for full-access roles" ON purchase_orders;
DROP POLICY IF EXISTS "PO select for owner" ON purchase_orders;
DROP POLICY IF EXISTS "PO select for assigned approver" ON purchase_orders;
DROP POLICY IF EXISTS "PO select for same department" ON purchase_orders;

CREATE POLICY "PO select consolidated"
  ON purchase_orders FOR SELECT TO authenticated
  USING (user_can_view_po(id, auth.uid()));
