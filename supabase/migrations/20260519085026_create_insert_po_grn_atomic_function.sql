/*
  # Create atomic GR insertion function

  1. Changes
    - Create `insert_po_grn_atomic` function that generates the GR number
      and inserts the record in a single transaction
    - This eliminates the race condition where the number is generated in one
      call and inserted in another, allowing duplicates

  2. Problem
    - The client calls `generate_po_grn_number` then separately does an INSERT
    - Between those two calls, another user can get the same number
    - Advisory locks don't help because the lock is released after the RPC returns

  3. Solution
    - Single function that locks, generates number, and inserts atomically
    - Returns the full inserted row as JSON
*/

CREATE OR REPLACE FUNCTION insert_po_grn_atomic(
  p_company_id uuid,
  p_purchase_order_id uuid,
  p_po_number text,
  p_vendor_id text,
  p_vendor_name text,
  p_received_by uuid,
  p_inspected_by uuid,
  p_receipt_date date,
  p_delivery_receipt_number text,
  p_receipt_type text,
  p_overall_condition text,
  p_warehouse_location text,
  p_remarks text,
  p_status text,
  p_confirmed_at timestamptz,
  p_created_by uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_prefix text := 'GR-' || v_year || '-';
  v_max integer;
  v_gr_number text;
  v_lock_key bigint;
  v_result json;
BEGIN
  -- Advisory lock to serialize within this transaction
  v_lock_key := abs(hashtext('po_grn_number_' || COALESCE(p_company_id::text, 'global') || '_' || v_year));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Get the next number
  SELECT COALESCE(MAX(NULLIF(regexp_replace(gr_number, '^GR-\d{4}-', ''), '')::integer), 0)
  INTO v_max
  FROM po_grns
  WHERE gr_number LIKE v_prefix || '%'
    AND (p_company_id IS NULL OR company_id = p_company_id);

  v_gr_number := v_prefix || lpad((v_max + 1)::text, 5, '0');

  -- Insert the record
  INSERT INTO po_grns (
    gr_number, purchase_order_id, po_number, vendor_id, vendor_name,
    company_id, received_by, inspected_by, receipt_date,
    delivery_receipt_number, receipt_type, overall_condition,
    warehouse_location, remarks, status, confirmed_at,
    created_by, updated_by
  ) VALUES (
    v_gr_number, p_purchase_order_id, p_po_number, p_vendor_id, p_vendor_name,
    p_company_id, p_received_by, p_inspected_by, p_receipt_date,
    p_delivery_receipt_number, p_receipt_type, p_overall_condition,
    p_warehouse_location, p_remarks, p_status, p_confirmed_at,
    p_created_by, p_created_by
  );

  -- Return the inserted row as JSON
  SELECT row_to_json(t) INTO v_result
  FROM (
    SELECT * FROM po_grns WHERE gr_number = v_gr_number AND (p_company_id IS NULL OR company_id = p_company_id)
  ) t;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_po_grn_atomic(uuid, uuid, text, text, text, uuid, uuid, date, text, text, text, text, text, text, timestamptz, uuid) TO authenticated;
