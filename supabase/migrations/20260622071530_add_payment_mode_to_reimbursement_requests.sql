-- Re-add payment_mode_id and add payment_mode_lines to reimbursement_requests
ALTER TABLE reimbursement_requests
  ADD COLUMN IF NOT EXISTS payment_mode_id uuid REFERENCES payment_modes(id),
  ADD COLUMN IF NOT EXISTS payment_mode_lines jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_reimbursement_requests_payment_mode_id
  ON reimbursement_requests(payment_mode_id);
