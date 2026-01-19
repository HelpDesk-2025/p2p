/*
  # Add Sub-Itemization to Expense Types

  1. Changes
    - Add `sub_items` column to `expense_types` table
      - JSONB array storing sub-items for each expense type
      - Each sub-item has: { name: string, description?: string }
      
  2. Purpose
    - Allows categorizing expenses with more detailed sub-categories
    - Example: "Travel Expense" can have sub-items like "Airfare", "Hotel", "Meals"
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_types' AND column_name = 'sub_items'
  ) THEN
    ALTER TABLE expense_types ADD COLUMN sub_items JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;
