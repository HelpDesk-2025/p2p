/*
  # Fix Number Series RLS Policies for Admin Access

  1. Changes
    - Update RLS policies to allow admin users to manage number series for any company
    - Remove company_id restriction from admin policies
    - Keep company_id restriction for non-admin users

  2. Security
    - Admin users can manage number series for all companies
    - Regular users can only read number series for their own company
*/

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Users can read their company number series" ON number_series;
DROP POLICY IF EXISTS "Admin users can insert number series for their company" ON number_series;
DROP POLICY IF EXISTS "Admin users can update number series for their company" ON number_series;
DROP POLICY IF EXISTS "Admin users can delete number series for their company" ON number_series;

-- Create new RLS policies allowing admins to manage any company's number series
CREATE POLICY "Users can read their company number series"
  ON number_series
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND (
        user_profiles.role = 'admin'
        OR user_profiles.company_id = number_series.company_id
      )
    )
  );

CREATE POLICY "Admin users can insert number series for any company"
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

CREATE POLICY "Admin users can update number series for any company"
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

CREATE POLICY "Admin users can delete number series for any company"
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
