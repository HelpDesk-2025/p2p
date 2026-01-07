/*
  # Add Company ID to Number Series Table

  1. Changes
    - Add `company_id` column to `number_series` table with foreign key to `companies`
    - Drop existing unique constraint on `series_name`
    - Add new unique constraint on `series_name` + `company_id` combination
    - Update RLS policies to filter by company
    - Update `get_next_number` function to use company_id parameter
    - Migrate existing data to assign to companies

  2. Security
    - Update RLS policies to ensure company isolation
    - Users can only see/manage number series for their own company

  3. Notes
    - Each company will have their own independent number series
    - Default series will be created for each existing company
*/

-- Add company_id column (nullable initially for migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'number_series' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE number_series ADD COLUMN company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Assign existing number series to the first company (for existing data)
DO $$
DECLARE
  first_company_id uuid;
BEGIN
  SELECT id INTO first_company_id FROM companies LIMIT 1;
  
  IF first_company_id IS NOT NULL THEN
    UPDATE number_series 
    SET company_id = first_company_id 
    WHERE company_id IS NULL;
  END IF;
END $$;

-- Make company_id NOT NULL after migration
ALTER TABLE number_series ALTER COLUMN company_id SET NOT NULL;

-- Drop old unique constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'number_series_series_name_key'
  ) THEN
    ALTER TABLE number_series DROP CONSTRAINT number_series_series_name_key;
  END IF;
END $$;

-- Add new unique constraint for series_name per company
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'number_series_series_name_company_id_key'
  ) THEN
    ALTER TABLE number_series 
    ADD CONSTRAINT number_series_series_name_company_id_key 
    UNIQUE (series_name, company_id);
  END IF;
END $$;

-- Drop old RLS policies
DROP POLICY IF EXISTS "Authenticated users can read number series" ON number_series;
DROP POLICY IF EXISTS "Admin users can insert number series" ON number_series;
DROP POLICY IF EXISTS "Admin users can update number series" ON number_series;
DROP POLICY IF EXISTS "Admin users can delete number series" ON number_series;

-- Create new company-specific RLS policies
CREATE POLICY "Users can read their company number series"
  ON number_series
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.company_id = number_series.company_id
    )
  );

CREATE POLICY "Admin users can insert number series for their company"
  ON number_series
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.company_id = number_series.company_id
    )
  );

CREATE POLICY "Admin users can update number series for their company"
  ON number_series
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.company_id = number_series.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.company_id = number_series.company_id
    )
  );

CREATE POLICY "Admin users can delete number series for their company"
  ON number_series
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
      AND user_profiles.company_id = number_series.company_id
    )
  );

-- Update get_next_number function to include company_id
CREATE OR REPLACE FUNCTION get_next_number(p_series_name text, p_company_id uuid)
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
$$ LANGUAGE plpgsql;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_number_series_company_id 
ON number_series(company_id);

-- Create default number series for all existing companies that don't have them
DO $$
DECLARE
  company_record RECORD;
BEGIN
  FOR company_record IN SELECT id FROM companies LOOP
    INSERT INTO number_series (series_name, prefix, next_number, number_length, format_example, company_id)
    VALUES 
      ('Purchase Requisition', 'PR', 1, 9, 'PR000000001', company_record.id),
      ('Purchase Order', 'PO', 1, 9, 'PO000000001', company_record.id),
      ('Invoice', 'INV', 1, 9, 'INV000000001', company_record.id),
      ('Petty Cash', 'PC', 1, 9, 'PC000000001', company_record.id),
      ('Reimbursement', 'REIMB', 1, 9, 'REIMB000000001', company_record.id),
      ('Cash Advance', 'CA', 1, 9, 'CA000000001', company_record.id),
      ('Canvass', 'CANV', 1, 9, 'CANV000000001', company_record.id)
    ON CONFLICT (series_name, company_id) DO NOTHING;
  END LOOP;
END $$;
