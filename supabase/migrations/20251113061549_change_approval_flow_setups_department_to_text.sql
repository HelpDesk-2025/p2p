/*
  # Change approval_flow_setups department_id to text

  1. Changes
    - Drop the foreign key constraint on department_id
    - Change department_id column type from uuid to text
    - This allows storing department names directly instead of references

  2. Important Notes
    - Existing data will be preserved during the conversion
    - department_id can now store department names as text
    - This simplifies the data model and removes the need for department lookups
*/

-- Drop the foreign key constraint first
ALTER TABLE approval_flow_setups DROP CONSTRAINT IF EXISTS approval_flow_setups_department_id_fkey;

-- Change the column type from uuid to text
ALTER TABLE approval_flow_setups ALTER COLUMN department_id TYPE text USING department_id::text;
