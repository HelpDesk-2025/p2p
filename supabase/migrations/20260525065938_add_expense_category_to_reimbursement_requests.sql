/*
  # Add expense_category to reimbursement_requests

  1. Changes
    - Add `expense_category` column to `reimbursement_requests` table
    - Default value: 'Department Expense'
    - This aligns Reimbursement and Liquidation approval flows with Petty Cash behavior
    - Each expense category (Department Expense, ManCom Expense) drives its own approval workflow

  2. Notes
    - Existing records default to 'Department Expense'
    - The approval flow setup for Reimbursement/Liquidation will now use workflow_type mapping:
      - workflow_type 1 = Department Expense
      - workflow_type 2 = ManCom Expense
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reimbursement_requests' AND column_name = 'expense_category'
  ) THEN
    ALTER TABLE reimbursement_requests ADD COLUMN expense_category text DEFAULT 'Department Expense';
  END IF;
END $$;