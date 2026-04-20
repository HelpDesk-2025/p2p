/*
  # Add DELETE policy to approval_ledger for resubmission

  1. Security Changes
    - Add DELETE policy on `approval_ledger` table
    - Allows authenticated users to delete approval ledger entries
      only for requests where they are the original requester
    - This is needed when a "Returned to Maker" request is resubmitted,
      so old approval entries are cleared and the approval flow restarts fresh

  2. Important Notes
    - The policy checks that the user owns the request by looking up the
      requester_id in the corresponding request table (purchase_requisitions,
      canvass_requests, cash_advance_requests, petty_cash_requests,
      reimbursement_requests)
    - Admin users can also delete approval ledger entries
*/

CREATE POLICY "Requesters can delete own request approval entries"
  ON approval_ledger
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_requisitions
      WHERE purchase_requisitions.id = approval_ledger.request_id
        AND purchase_requisitions.requester_id = auth.uid()
        AND approval_ledger.request_type = 'Purchase Requisition'
    )
    OR EXISTS (
      SELECT 1 FROM canvass_requests
      WHERE canvass_requests.id = approval_ledger.request_id
        AND canvass_requests.requester_id = auth.uid()
        AND approval_ledger.request_type = 'Canvass'
    )
    OR EXISTS (
      SELECT 1 FROM cash_advance_requests
      WHERE cash_advance_requests.id = approval_ledger.request_id
        AND cash_advance_requests.requester_id = auth.uid()
        AND approval_ledger.request_type = 'Cash Advance'
    )
    OR EXISTS (
      SELECT 1 FROM petty_cash_requests
      WHERE petty_cash_requests.id = approval_ledger.request_id
        AND petty_cash_requests.requester_id = auth.uid()
        AND approval_ledger.request_type IN ('Petty Cash', 'Petty Cash Replenishment')
    )
    OR EXISTS (
      SELECT 1 FROM reimbursement_requests
      WHERE reimbursement_requests.id = approval_ledger.request_id
        AND reimbursement_requests.requester_id = auth.uid()
        AND approval_ledger.request_type = 'Reimbursement'
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  );
