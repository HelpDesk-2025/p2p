/*
  # Add "Returned to Maker" Status to All Request Types

  Extends the existing PR-only "return to maker" feature to Canvass, Petty Cash,
  Cash Advance, and Reimbursement requests so any approver can send a request
  back to the requester for corrections.

  1. Status check constraints
    - Adds 'returned_to_maker' to the allowed status values on:
      canvass_requests, petty_cash_requests, cash_advance_requests, reimbursement_requests

  2. Security
    - Replaces the requester UPDATE policy on each table so the requester is
      allowed to edit and resubmit when status is either 'draft' or
      'returned_to_maker'. All other existing policies are left untouched.
*/

-- Canvass --------------------------------------------------------------------
ALTER TABLE canvass_requests DROP CONSTRAINT IF EXISTS canvass_requests_status_check;
ALTER TABLE canvass_requests
  ADD CONSTRAINT canvass_requests_status_check
  CHECK (status IN ('draft','pending','approved','rejected','returned_to_maker'));

DROP POLICY IF EXISTS "Users can update own draft canvass" ON canvass_requests;
CREATE POLICY "Users can update own draft or returned canvass"
  ON canvass_requests FOR UPDATE
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    AND status IN ('draft','returned_to_maker')
  )
  WITH CHECK (
    requester_id = (SELECT auth.uid())
  );

-- Petty Cash -----------------------------------------------------------------
ALTER TABLE petty_cash_requests DROP CONSTRAINT IF EXISTS petty_cash_requests_status_check;
ALTER TABLE petty_cash_requests
  ADD CONSTRAINT petty_cash_requests_status_check
  CHECK (status IN ('draft','pending','approved','rejected','disbursed','returned_to_maker'));

DROP POLICY IF EXISTS "Users can update own draft petty cash" ON petty_cash_requests;
CREATE POLICY "Users can update own draft or returned petty cash"
  ON petty_cash_requests FOR UPDATE
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    AND status IN ('draft','returned_to_maker')
  )
  WITH CHECK (
    requester_id = (SELECT auth.uid())
  );

-- Cash Advance --------------------------------------------------------------
ALTER TABLE cash_advance_requests DROP CONSTRAINT IF EXISTS cash_advance_requests_status_check;
ALTER TABLE cash_advance_requests
  ADD CONSTRAINT cash_advance_requests_status_check
  CHECK (status IN ('draft','pending','approved','rejected','disbursed','returned_to_maker'));

DROP POLICY IF EXISTS "Users can update own draft cash advance requests" ON cash_advance_requests;
CREATE POLICY "Users can update own draft or returned cash advance"
  ON cash_advance_requests FOR UPDATE
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    AND status IN ('draft','returned_to_maker')
  )
  WITH CHECK (
    requester_id = (SELECT auth.uid())
  );

-- Reimbursement -------------------------------------------------------------
ALTER TABLE reimbursement_requests DROP CONSTRAINT IF EXISTS reimbursement_requests_status_check;
ALTER TABLE reimbursement_requests
  ADD CONSTRAINT reimbursement_requests_status_check
  CHECK (status IN ('draft','pending','approved','rejected','reimbursed','returned_to_maker'));

DROP POLICY IF EXISTS "Users can update own draft reimbursements" ON reimbursement_requests;
CREATE POLICY "Users can update own draft or returned reimbursements"
  ON reimbursement_requests FOR UPDATE
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    AND status IN ('draft','returned_to_maker')
  )
  WITH CHECK (
    requester_id = (SELECT auth.uid())
  );
