/*
  # Create lock_po_grn RPC Function

  1. New Functions
    - `lock_po_grn(p_grn_id uuid, p_locked_by uuid)` - locks a confirmed GR

  2. Behavior
    - Verifies GR is confirmed and not already locked
    - Sets locked_at and locked_by
    - Inserts audit log entry with action 'locked'
    - Returns the locked GR record as JSON

  3. Security
    - SECURITY DEFINER so it can update regardless of RLS
    - Caller must have 'Goods Receipt Lock' permission (enforced in frontend)
*/

-- Update the audit log action check constraint to include 'locked'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'po_grn_audit_logs' AND constraint_name = 'po_grn_audit_logs_action_check'
  ) THEN
    ALTER TABLE po_grn_audit_logs DROP CONSTRAINT po_grn_audit_logs_action_check;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE po_grn_audit_logs ADD CONSTRAINT po_grn_audit_logs_action_check
    CHECK (action IN ('created', 'confirmed', 'cancelled', 'edited', 'locked'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION lock_po_grn(p_grn_id uuid, p_locked_by uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grn record;
  v_result json;
BEGIN
  SELECT * INTO v_grn FROM po_grns WHERE id = p_grn_id;

  IF v_grn IS NULL THEN
    RAISE EXCEPTION 'Goods Receipt not found';
  END IF;

  IF v_grn.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed Goods Receipts can be locked';
  END IF;

  IF v_grn.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This Goods Receipt is already locked';
  END IF;

  UPDATE po_grns
  SET locked_at = now(),
      locked_by = p_locked_by,
      updated_by = p_locked_by,
      updated_at = now()
  WHERE id = p_grn_id;

  INSERT INTO po_grn_audit_logs (po_grn_id, action, performed_by, remarks)
  VALUES (p_grn_id, 'locked', p_locked_by, 'Goods Receipt locked - no further edits allowed');

  SELECT row_to_json(g) INTO v_result FROM po_grns g WHERE g.id = p_grn_id;
  RETURN v_result;
END;
$$;
