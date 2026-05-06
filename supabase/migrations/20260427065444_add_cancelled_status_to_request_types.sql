/*
  # Add 'cancelled' status to all request types

  Adds the ability for a requester to cancel their own pending request,
  but only when no approver has acted yet (current_approval_level = 0).

  1. Status check constraints
    - Adds 'cancelled' to allowed statuses on:
      purchase_requisitions, canvass_requests, petty_cash_requests,
      cash_advance_requests, reimbursement_requests

  2. Security
    - Adds a dedicated UPDATE policy on each table allowing the requester
      to update their own row only when status='pending' AND
      current_approval_level=0. This is the gate that lets them flip the
      status to 'cancelled' before any approver has acted.
    - Existing draft/returned_to_maker update policies are preserved.
*/

-- Purchase Requisitions ------------------------------------------------------
ALTER TABLE purchase_requisitions DROP CONSTRAINT IF EXISTS purchase_requisitions_status_check;
ALTER TABLE purchase_requisitions
  ADD CONSTRAINT purchase_requisitions_status_check
  CHECK (status IN ('draft','pending','approved','rejected','in_procurement','completed','returned_to_maker','cancelled'));

DROP POLICY IF EXISTS "Requesters can cancel own pending PR" ON purchase_requisitions;
CREATE POLICY "Requesters can cancel own pending PR"
  ON purchase_requisitions FOR UPDATE
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    AND status = 'pending'
    AND current_approval_level = 0
  )
  WITH CHECK (
    requester_id = (SELECT auth.uid())
  );

-- Canvass --------------------------------------------------------------------
ALTER TABLE canvass_requests DROP CONSTRAINT IF EXISTS canvass_requests_status_check;
ALTER TABLE canvass_requests
  ADD CONSTRAINT canvass_requests_status_check
  CHECK (status IN ('draft','pending','approved','rejected','returned_to_maker','cancelled'));

DROP POLICY IF EXISTS "Requesters can cancel own pending canvass" ON canvass_requests;
CREATE POLICY "Requesters can cancel own pending canvass"
  ON canvass_requests FOR UPDATE
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    AND status = 'pending'
    AND current_approval_level = 0
  )
  WITH CHECK (
    requester_id = (SELECT auth.uid())
  );

-- Petty Cash -----------------------------------------------------------------
ALTER TABLE petty_cash_requests DROP CONSTRAINT IF EXISTS petty_cash_requests_status_check;
ALTER TABLE petty_cash_requests
  ADD CONSTRAINT petty_cash_requests_status_check
  CHECK (status IN ('draft','pending','approved','rejected','disbursed','returned_to_maker','cancelled'));

DROP POLICY IF EXISTS "Requesters can cancel own pending petty cash" ON petty_cash_requests;
CREATE POLICY "Requesters can cancel own pending petty cash"
  ON petty_cash_requests FOR UPDATE
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    AND status = 'pending'
    AND current_approval_level = 0
  )
  WITH CHECK (
    requester_id = (SELECT auth.uid())
  );

-- Cash Advance --------------------------------------------------------------
ALTER TABLE cash_advance_requests DROP CONSTRAINT IF EXISTS cash_advance_requests_status_check;
ALTER TABLE cash_advance_requests
  ADD CONSTRAINT cash_advance_requests_status_check
  CHECK (status IN ('draft','pending','approved','rejected','disbursed','returned_to_maker','cancelled'));

DROP POLICY IF EXISTS "Requesters can cancel own pending cash advance" ON cash_advance_requests;
CREATE POLICY "Requesters can cancel own pending cash advance"
  ON cash_advance_requests FOR UPDATE
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    AND status = 'pending'
    AND current_approval_level = 0
  )
  WITH CHECK (
    requester_id = (SELECT auth.uid())
  );

-- Reimbursement -------------------------------------------------------------
ALTER TABLE reimbursement_requests DROP CONSTRAINT IF EXISTS reimbursement_requests_status_check;
ALTER TABLE reimbursement_requests
  ADD CONSTRAINT reimbursement_requests_status_check
  CHECK (status IN ('draft','pending','approved','rejected','reimbursed','returned_to_maker','cancelled'));

DROP POLICY IF EXISTS "Requesters can cancel own pending reimbursement" ON reimbursement_requests;
CREATE POLICY "Requesters can cancel own pending reimbursement"
  ON reimbursement_requests FOR UPDATE
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    AND status = 'pending'
    AND current_approval_level = 0
  )
  WITH CHECK (
    requester_id = (SELECT auth.uid())
  );
