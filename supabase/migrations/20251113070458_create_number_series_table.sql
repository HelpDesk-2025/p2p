/*
  # Create Number Series Configuration Table

  1. New Tables
    - `number_series`
      - `id` (uuid, primary key)
      - `series_name` (text) - Name/type of the series (e.g., 'Purchase Requisition', 'Purchase Order')
      - `prefix` (text) - Prefix for the number (e.g., 'PR', 'PO')
      - `next_number` (integer) - Next number to be used
      - `number_length` (integer) - Total length of number part (for padding)
      - `format_example` (text) - Example format (e.g., 'PR000000001')
      - `is_active` (boolean) - Whether this series is currently active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `number_series` table
    - Add policy for authenticated users to read number series
    - Add policy for admin users to manage number series

  3. Notes
    - This table will store configuration for auto-incrementing number series
    - Each document type (PR, PO, Invoice, etc.) can have its own series
*/

CREATE TABLE IF NOT EXISTS number_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_name text UNIQUE NOT NULL,
  prefix text NOT NULL,
  next_number integer DEFAULT 1 NOT NULL,
  number_length integer DEFAULT 9 NOT NULL,
  format_example text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE number_series ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read number series
CREATE POLICY "Authenticated users can read number series"
  ON number_series
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy for admin users to insert number series
CREATE POLICY "Admin users can insert number series"
  ON number_series
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Policy for admin users to update number series
CREATE POLICY "Admin users can update number series"
  ON number_series
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Policy for admin users to delete number series
CREATE POLICY "Admin users can delete number series"
  ON number_series
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_number_series_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_number_series_updated_at_trigger
  BEFORE UPDATE ON number_series
  FOR EACH ROW
  EXECUTE FUNCTION update_number_series_updated_at();

-- Insert default number series
INSERT INTO number_series (series_name, prefix, next_number, number_length, format_example)
VALUES 
  ('Purchase Requisition', 'PR', 1, 9, 'PR000000001'),
  ('Purchase Order', 'PO', 1, 9, 'PO000000001'),
  ('Invoice', 'INV', 1, 9, 'INV000000001')
ON CONFLICT (series_name) DO NOTHING;

-- Create function to get and increment next number
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

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_number_series_series_name 
ON number_series(series_name);

CREATE INDEX IF NOT EXISTS idx_number_series_is_active 
ON number_series(is_active);
