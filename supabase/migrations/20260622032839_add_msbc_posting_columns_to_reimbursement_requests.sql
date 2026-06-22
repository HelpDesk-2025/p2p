ALTER TABLE reimbursement_requests
  ADD COLUMN IF NOT EXISTS msbc_posting_status text,
  ADD COLUMN IF NOT EXISTS msbc_posting_date timestamptz,
  ADD COLUMN IF NOT EXISTS msbc_journal_batch_id text,
  ADD COLUMN IF NOT EXISTS msbc_error_message text,
  ADD COLUMN IF NOT EXISTS payee_number text;