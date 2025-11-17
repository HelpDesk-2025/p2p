/*
  # Update Number Series for Request Types

  1. Changes
    - Remove old default number series
    - Add specific number series for each request type:
      - Purchase Requisition (PR)
      - Canvass (CV)
      - Petty Cash (PC)
      - Reimbursement (RB)
    - Each series includes latest_no field to track the most recent generated number

  2. Notes
    - Series are pre-configured with sensible defaults
    - All series are set to active by default
    - Format examples provided for clarity
*/

-- Delete old default number series if they exist
DELETE FROM number_series WHERE series_name IN ('Purchase Requisition', 'Purchase Order', 'Invoice');

-- Insert new request type specific number series
INSERT INTO number_series (series_name, prefix, next_number, number_length, format_example, is_active)
VALUES 
  ('Purchase Requisition', 'PR', 1, 9, 'PR000000001', true),
  ('Canvass', 'CV', 1, 9, 'CV000000001', true),
  ('Petty Cash', 'PC', 1, 9, 'PC000000001', true),
  ('Reimbursement', 'RB', 1, 9, 'RB000000001', true)
ON CONFLICT (series_name) DO UPDATE
SET 
  prefix = EXCLUDED.prefix,
  number_length = EXCLUDED.number_length,
  format_example = EXCLUDED.format_example,
  is_active = EXCLUDED.is_active;
