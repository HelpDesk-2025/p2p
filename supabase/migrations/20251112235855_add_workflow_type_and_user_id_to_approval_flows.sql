/*
  # Add Workflow Type and User ID to Approval Flows

  1. Changes
    - Add `workflow_type` column (integer) to identify which workflow the step belongs to:
      - 1: Unbudgeted workflow
      - 2: Budgeted (< President Min Amount) workflow
      - 3: Budgeted (> President Min Amount) workflow
    - Add `user_id` column (uuid) to store specific user/approver assignments
    - Add foreign key constraint to user_profiles table

  2. Notes
    - workflow_type helps segregate approval steps into the 3 different workflows
    - user_id is optional and only used when a specific user is assigned as approver
    - Existing records will have null workflow_type (will be treated as applicable to all workflows)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_flows' AND column_name = 'workflow_type'
  ) THEN
    ALTER TABLE approval_flows ADD COLUMN workflow_type INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'approval_flows' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE approval_flows ADD COLUMN user_id UUID REFERENCES user_profiles(id);
  END IF;
END $$;
