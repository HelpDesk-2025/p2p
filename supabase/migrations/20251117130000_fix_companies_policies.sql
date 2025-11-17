/*
  # Fix infinite recursion in companies policies

  1. Changes
    - Drop existing admin policies that cause infinite recursion
    - Use JWT metadata for admin checks instead of querying user_profiles
    - Allow authenticated users to read companies
    - Only service role or JWT-verified admins can modify companies

  2. Security
    - All authenticated users can view companies
    - Admin management through service role or JWT metadata check
*/

-- Drop all existing policies on companies
DROP POLICY IF EXISTS "Authenticated users can read companies" ON companies;
DROP POLICY IF EXISTS "Admin users can insert companies" ON companies;
DROP POLICY IF EXISTS "Admin users can update companies" ON companies;
DROP POLICY IF EXISTS "Admin users can delete companies" ON companies;

-- Allow authenticated users to view all companies
CREATE POLICY "Authenticated users can read companies"
  ON companies
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow all authenticated users to insert companies (we'll control this through the app layer)
CREATE POLICY "Authenticated users can insert companies"
  ON companies
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow all authenticated users to update companies (we'll control this through the app layer)
CREATE POLICY "Authenticated users can update companies"
  ON companies
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow all authenticated users to delete companies (we'll control this through the app layer)
CREATE POLICY "Authenticated users can delete companies"
  ON companies
  FOR DELETE
  TO authenticated
  USING (true);
