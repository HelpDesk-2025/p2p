/*
  # Fix Number Series Admin Access

  1. Changes
    - Update RLS policy to allow admins to see number series for all companies
    - Non-admin users can only see their own company's number series

  2. Security
    - Admins can view and manage number series across all companies
    - Regular users are restricted to their own company
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can read their company number series" ON number_series;

-- Create new policy that allows admins to see all number series
CREATE POLICY "Users can read number series"
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

-- Update insert policy to allow admins for any company
DROP POLICY IF EXISTS "Admin users can insert number series for their company" ON number_series;

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

-- Update update policy to allow admins for any company
DROP POLICY IF EXISTS "Admin users can update number series for their company" ON number_series;

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

-- Update delete policy to allow admins for any company
DROP POLICY IF EXISTS "Admin users can delete number series for their company" ON number_series;

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
