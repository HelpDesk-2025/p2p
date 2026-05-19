/*
  # Fix GR number generation race condition

  1. Changes
    - Recreate `generate_po_grn_number` function with advisory lock
      to prevent duplicate numbers under concurrent calls
    - Uses pg_advisory_xact_lock to serialize number generation

  2. Problem
    - Concurrent calls to generate_po_grn_number can produce the same
      number because the SELECT MAX and INSERT are not atomic
    - This causes "duplicate key value violates unique constraint po_grns_gr_number_key"

  3. Fix
    - Add advisory lock keyed on company_id hash to serialize access
*/

CREATE OR REPLACE FUNCTION generate_po_grn_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_prefix text := 'GR-' || v_year || '-';
  v_max integer;
  v_lock_key bigint;
BEGIN
  -- Use advisory lock to prevent race conditions
  v_lock_key := abs(hashtext('po_grn_number_' || COALESCE(p_company_id::text, 'global') || '_' || v_year));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(NULLIF(regexp_replace(gr_number, '^GR-\d{4}-', ''), '')::integer), 0)
  INTO v_max
  FROM po_grns
  WHERE gr_number LIKE v_prefix || '%'
    AND (p_company_id IS NULL OR company_id = p_company_id);

  RETURN v_prefix || lpad((v_max + 1)::text, 5, '0');
END;
$$;
