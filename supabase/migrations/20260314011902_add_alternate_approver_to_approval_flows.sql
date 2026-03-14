/*
  # Add Alternate Approver to Approval Flows

  ## Summary
  Adds an optional alternate approver to each approval flow step, allowing
  either the primary or alternate approver to act on a request. This solves
  the problem where a single approver being on leave blocks all pending requests.

  ## Changes

  ### Modified Tables
  - `approval_flows`
    - New column: `alternate_approver_id` (uuid, nullable, FK to user_profiles)
      - When set, either the primary `user_id` OR the alternate can approve/reject
      - Null means the step has only one approver (existing behavior unchanged)

  ## Notes
  - Fully backwards compatible — existing steps without an alternate continue working identically
  - No data loss; only adds an optional column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_flows' AND column_name = 'alternate_approver_id'
  ) THEN
    ALTER TABLE approval_flows
      ADD COLUMN alternate_approver_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
