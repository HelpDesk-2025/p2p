/*
  # Allow requesters to update their own returned-to-maker purchase requisitions

  Resubmitting a returned request failed with "Cannot coerce the result to a
  single JSON object" because the existing UPDATE policies only allow the
  requester to update their own rows when status = 'draft'. Returned requests
  keep status = 'returned_to_maker', so the UPDATE matched zero rows after RLS
  filtering and the RETURNING clause could not produce a row.

  1. Policy changes
    - Add UPDATE policy on purchase_requisitions that lets a requester update
      their own row while it is in draft or returned_to_maker status. WITH CHECK
      keeps ownership intact on the updated row.

  2. Notes
    - Approver / admin / procurement / accounting update policies are untouched.
    - No data changes.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchase_requisitions'
      AND policyname = 'Users can update own draft or returned requisitions'
  ) THEN
    CREATE POLICY "Users can update own draft or returned requisitions"
      ON purchase_requisitions
      FOR UPDATE
      TO authenticated
      USING (
        requester_id = (SELECT auth.uid())
        AND status IN ('draft', 'returned_to_maker')
      )
      WITH CHECK (
        requester_id = (SELECT auth.uid())
      );
  END IF;
END $$;
