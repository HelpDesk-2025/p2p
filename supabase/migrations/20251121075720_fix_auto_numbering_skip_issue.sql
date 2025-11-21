/*
  # Fix Auto-Numbering Skip Issue

  1. Changes
    - Rename existing `get_next_number` to `consume_next_number`
    - Create new `get_next_number` that ONLY previews without incrementing
    - This prevents numbers from being skipped when users cancel forms

  2. Purpose
    - `get_next_number` - Preview the next number without consuming it
    - `consume_next_number` - Actually increment and consume the next number (called when saving)

  3. Important Notes
    - Frontend will call `get_next_number` to preview
    - Backend will call `consume_next_number` when actually creating the record
    - This prevents skipped numbers when users cancel after previewing
*/

-- Rename the old function to consume_next_number (for actual usage)
CREATE OR REPLACE FUNCTION consume_next_number(p_series_name text)
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

-- Create new get_next_number that only previews (no increment)
CREATE OR REPLACE FUNCTION get_next_number(p_series_name text)
RETURNS text AS $$
DECLARE
  v_prefix text;
  v_next_number integer;
  v_number_length integer;
  v_result text;
BEGIN
  -- Get current values WITHOUT incrementing
  SELECT prefix, next_number, number_length
  INTO v_prefix, v_next_number, v_number_length
  FROM number_series
  WHERE series_name = p_series_name AND is_active = true;
  
  -- Check if series exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Number series "%" not found or not active', p_series_name;
  END IF;
  
  -- Format the result (preview only, don't consume)
  v_result := v_prefix || LPAD(v_next_number::text, v_number_length, '0');
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
