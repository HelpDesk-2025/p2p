/*
  # Revert to Original Auto-Numbering Behavior

  1. Changes
    - Restore `get_next_number` to increment when called (on Generate button click)
    - Remove `consume_next_number` function as it's not needed
    - The number increments immediately when user clicks "Generate"
    - This is the desired behavior per user requirements

  2. Purpose
    - Number should increment when "Generate" button is clicked
    - User should use that exact number when saving (no second increment)
    - If user cancels, that number is lost (which is acceptable)
*/

-- Restore get_next_number to increment immediately (original behavior)
CREATE OR REPLACE FUNCTION get_next_number(p_series_name text)
RETURNS text AS $$
DECLARE
  v_prefix text;
  v_next_number integer;
  v_number_length integer;
  v_result text;
BEGIN
  -- Get current values and increment
  UPDATE number_series
  SET next_number = next_number + 1
  WHERE series_name = p_series_name AND is_active = true
  RETURNING prefix, next_number - 1, number_length
  INTO v_prefix, v_next_number, v_number_length;
  
  -- Check if series exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Number series "%" not found or not active', p_series_name;
  END IF;
  
  -- Format the result
  v_result := v_prefix || LPAD(v_next_number::text, v_number_length, '0');
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Drop the consume_next_number function as it's not needed
DROP FUNCTION IF EXISTS consume_next_number(text);
