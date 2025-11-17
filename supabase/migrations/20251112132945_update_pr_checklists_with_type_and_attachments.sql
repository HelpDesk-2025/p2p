/*
  # Update PR Checklists with Type and Attachments
  
  1. Changes
    - Add pr_type column to pr_checklists (purchase_order, non_purchase_order)
    - Add attachments jsonb column to store multiple attachment configurations
    - Each attachment will have: name, is_required fields
    
  2. Notes
    - Existing checklist items will default to 'purchase_order' type
    - Attachments column stores array of {name: string, is_required: boolean}
*/

-- Add pr_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pr_checklists' AND column_name = 'pr_type'
  ) THEN
    ALTER TABLE pr_checklists ADD COLUMN pr_type text NOT NULL DEFAULT 'purchase_order' 
      CHECK (pr_type IN ('purchase_order', 'non_purchase_order'));
  END IF;
END $$;

-- Add attachments column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pr_checklists' AND column_name = 'attachments'
  ) THEN
    ALTER TABLE pr_checklists ADD COLUMN attachments jsonb DEFAULT '[]';
  END IF;
END $$;
