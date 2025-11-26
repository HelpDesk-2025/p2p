/*
  # Add ready_for_canvass field to purchase requisitions

  1. Changes
    - Add `ready_for_canvass` boolean column to `purchase_requisitions` table
    - Default value is false
    - Used to track when a PR is ready for the canvassing process
*/

ALTER TABLE purchase_requisitions
ADD COLUMN IF NOT EXISTS ready_for_canvass boolean DEFAULT false;