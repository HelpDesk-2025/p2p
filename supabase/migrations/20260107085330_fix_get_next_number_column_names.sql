/*
  # Fix get_next_number Function Column Names

  1. Changes
    - Fix get_next_number function to use correct column names
    - Column is `next_number` not `current_number`
    - Column is `number_length` not `padding`
    - There is no `suffix` column in the table

  2. Security
    - Maintains SECURITY DEFINER for RLS bypass
    - Maintains SET search_path for security
*/

-- Fix get_next_number function with correct column names
CREATE OR REPLACE FUNCTION get_next_number(p_series_name text, p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prefix text;
  v_next_number integer;
  v_number_length integer;
  v_result text;
BEGIN
  -- Get current values and increment
  UPDATE number_series
  SET next_number = next_number + 1,
      updated_at = now()
  WHERE series_name = p_series_name
    AND company_id = p_company_id
    AND is_active = true
  RETURNING prefix, next_number - 1, number_length
  INTO v_prefix, v_next_number, v_number_length;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Number series % not found or not active for company', p_series_name;
  END IF;

  -- Format the result (no suffix, just prefix + padded number)
  v_result := v_prefix || LPAD(v_next_number::text, v_number_length, '0');

  RETURN v_result;
END;
$$;

-- Ensure execute permission for authenticated users
GRANT EXECUTE ON FUNCTION get_next_number(text, uuid) TO authenticated;
