/*
  # Fix GR number generation to respect global unique constraint

  1. Problem
    - The `po_grns_gr_number_key` constraint is UNIQUE globally (not per company)
    - But `insert_po_grn_atomic` filtered by company_id when finding the max number
    - This caused different companies to generate the same GR number (e.g. GR-2026-00001)
      which then violated the global unique constraint

  2. Fix
    - Remove the company_id filter from the MAX query so numbers are globally unique
    - This ensures GR numbers are sequential across ALL companies
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
  -- Advisory lock to serialize (global, not per-company)
  v_lock_key := abs(hashtext('po_grn_number_global_' || v_year));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Get the next number GLOBALLY (constraint is global, not per-company)
  SELECT COALESCE(MAX(NULLIF(regexp_replace(gr_number, '^GR-\d{4}-', ''), '')::integer), 0)
  INTO v_max
  FROM po_grns
  WHERE gr_number LIKE v_prefix || '%';

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
    SELECT * FROM po_grns WHERE gr_number = v_gr_number
  ) t;

  RETURN v_result;
END;
$$;
