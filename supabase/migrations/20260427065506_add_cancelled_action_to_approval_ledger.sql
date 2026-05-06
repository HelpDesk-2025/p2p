/*
  # Add 'Cancelled' action to approval_ledger

  Allows the requester's cancellation event to be recorded in the
  approval_ledger so it shows up in the audit trail.
*/

ALTER TABLE approval_ledger DROP CONSTRAINT IF EXISTS approval_ledger_action_check;
ALTER TABLE approval_ledger
  ADD CONSTRAINT approval_ledger_action_check
  CHECK (action IN ('Approved', 'Rejected', 'Returned', 'Submitted', 'Auto-Rejected', 'Cancelled'));
