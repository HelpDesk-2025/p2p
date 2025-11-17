/*
  # Update PR Checklists Constraint to Support Cash Advance Type

  1. Changes
    - Drop existing check constraint on pr_type
    - Add new check constraint allowing 'purchase_order', 'non_purchase_order', and 'Cash Advance'
    - Update existing 'Cash Advance' record from 'non_purchase_order' to 'Cash Advance'
  
  2. Notes
    - This allows the pr_type to be 'Cash Advance' for cash advance requests
    - Maintains backward compatibility with existing types
*/

-- Drop the existing constraint
ALTER TABLE pr_checklists 
DROP CONSTRAINT IF EXISTS pr_checklists_pr_type_check;

-- Add new constraint with Cash Advance type
ALTER TABLE pr_checklists 
ADD CONSTRAINT pr_checklists_pr_type_check 
CHECK (pr_type = ANY (ARRAY['purchase_order'::text, 'non_purchase_order'::text, 'Cash Advance'::text]));

-- Update the Cash Advance record
UPDATE pr_checklists 
SET pr_type = 'Cash Advance' 
WHERE item_name = 'Cash Advance' AND pr_type = 'non_purchase_order';
