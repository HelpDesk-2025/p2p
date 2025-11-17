/*
  # Update approver_type constraint to include Specific User

  1. Changes
    - Drop the old approver_type check constraint
    - Add new constraint that includes 'Specific User' as a valid option
    - When approver_type is 'Specific User', the user_id field will specify which user

  2. Important Notes
    - This allows flexibility to assign specific users as approvers
    - The user_id field should be populated when approver_type is 'Specific User'
*/

-- Drop the old constraint
ALTER TABLE approval_flows DROP CONSTRAINT IF EXISTS approval_flows_approver_type_check;

-- Add new constraint with 'Specific User' included
ALTER TABLE approval_flows ADD CONSTRAINT approval_flows_approver_type_check 
  CHECK (approver_type = ANY (ARRAY[
    'Requestor'::text, 
    'Department Head'::text, 
    'Procurement'::text, 
    'Procurement Head'::text, 
    'President'::text,
    'Specific User'::text
  ]));
