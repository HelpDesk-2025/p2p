/*
  # Create announcements table

  Adds a configurable announcements feature that surfaces messages on the
  user dashboard. Admins manage the list from Configuration.

  1. New Tables
    - `announcements`
      - `id` (uuid, primary key)
      - `title` (text, required)
      - `message` (text, required)
      - `priority` (text, one of info|success|warning|critical)
      - `is_active` (boolean, default true)
      - `starts_at` (timestamptz, optional)
      - `ends_at` (timestamptz, optional)
      - `company_id` (uuid, optional - null = all companies)
      - `created_by` (uuid, references auth.users)
      - `created_at`, `updated_at` (timestamptz)

  2. Security
    - RLS enabled
    - Authenticated users can read currently-active announcements
      (active flag true and within optional date window)
    - Admins can fully manage announcements
*/

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  priority text NOT NULL DEFAULT 'info',
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_priority_check
    CHECK (priority IN ('info','success','warning','critical'))
);

CREATE INDEX IF NOT EXISTS announcements_active_idx
  ON announcements (is_active, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS announcements_company_idx
  ON announcements (company_id);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read active announcements" ON announcements;
CREATE POLICY "Authenticated users can read active announcements"
  ON announcements FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

DROP POLICY IF EXISTS "Admins can read all announcements" ON announcements;
CREATE POLICY "Admins can read all announcements"
  ON announcements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert announcements" ON announcements;
CREATE POLICY "Admins can insert announcements"
  ON announcements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update announcements" ON announcements;
CREATE POLICY "Admins can update announcements"
  ON announcements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete announcements" ON announcements;
CREATE POLICY "Admins can delete announcements"
  ON announcements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );
