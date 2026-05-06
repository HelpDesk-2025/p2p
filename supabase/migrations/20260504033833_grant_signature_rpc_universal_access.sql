/*
  # Grant universal access to signature-generation RPCs

  ## Summary
  Document generation (RFP, petty-cash release bundle, reimbursement form, etc.)
  relies on reading other users' e-signatures. Because `user_profiles` RLS is
  restrictive, we rely on SECURITY DEFINER RPCs. Ensure every authenticated
  role can EXECUTE those RPCs so no role errors when generating documents.

  ## Change
  - Re-grant EXECUTE on approval-record and pending-approval RPCs to
    `authenticated` role.
*/

DO $$
DECLARE
  v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_approval_records_with_signatures',
        'get_my_pending_approval_ids',
        'get_user_pending_approval_counts',
        'get_pending_request_ids'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn.sig);
  END LOOP;
END $$;
