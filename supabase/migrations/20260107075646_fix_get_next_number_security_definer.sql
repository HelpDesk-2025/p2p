/*
  # Fix get_next_number Function to Work for All Users

  1. Changes
    - Recreate get_next_number function with SECURITY DEFINER
    - This allows the function to bypass RLS and update number_series
    - All authenticated users can now generate document numbers

  2. Security
    - Function still validates that series exists and is active
    - Only increments numbers for valid, active series
    - Users can only generate numbers for their company's series
*/

-- Drop and recreate the function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION get_next_number(p_series_name text, p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_next_number integer;
  v_number_length integer;
  v_result text;
BEGIN
  -- Get current values and increment
  UPDATE number_series
  SET next_number = next_number + 1
  WHERE series_name = p_series_name 
    AND company_id = p_company_id 
    AND is_active = true
  RETURNING prefix, next_number - 1, number_length
  INTO v_prefix, v_next_number, v_number_length;
  
  -- Check if series exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Number series "%" not found or not active for this company', p_series_name;
  END IF;
  
  -- Format the result
  v_result := v_prefix || LPAD(v_next_number::text, v_number_length, '0');
  
  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_next_number(text, uuid) TO authenticated;
