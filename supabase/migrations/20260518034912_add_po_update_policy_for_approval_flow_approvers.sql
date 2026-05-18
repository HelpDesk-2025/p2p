/*
  # Add PO update policy for approval flow approvers

  ## Summary
  Since POs now use the standard approval_flows system instead of current_approver_id,
  approvers need to be able to update POs (change status, approval level) when they
  approve/reject. This policy allows users who are assigned in the relevant approval
  flow step to update POs that are pending approval.

  ## Changes
  1. New UPDATE policy allowing approval flow approvers to update pending POs

  ## Security
  - Only users explicitly assigned in approval_flows can update
  - Only applies to POs in 'pending_approval' status
*/

CREATE POLICY "PO update for approval flow approvers"
  ON purchase_orders
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending_approval'
    AND EXISTS (
      SELECT 1 FROM approval_flows af
      JOIN approval_flow_setups afs ON afs.id = af.approval_flow_setup_id
      WHERE afs.company_id = purchase_orders.company_id
      AND (afs.department_id = purchase_orders.department OR afs.department_id IS NULL)
      AND afs.request_type = 'Purchase Order'
      AND afs.is_active = true
      AND af.is_active = true
      AND (af.user_id = auth.uid() OR af.alternate_approver_id = auth.uid())
    )
  );