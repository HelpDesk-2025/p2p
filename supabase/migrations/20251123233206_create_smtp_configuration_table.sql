/*
  # Create SMTP Configuration Table

  1. New Tables
    - `smtp_configurations`
      - `id` (uuid, primary key)
      - `company_id` (uuid, foreign key to companies) - NULLABLE for system-wide config
      - `mailer` (text) - Mailer type (e.g., 'smtp')
      - `host` (text) - SMTP server host
      - `port` (integer) - SMTP port number
      - `username` (text) - SMTP username
      - `password` (text) - SMTP password (encrypted in practice)
      - `encryption` (text) - Encryption type (tls, ssl)
      - `from_address` (text) - Email address to send from
      - `from_name` (text) - Display name for sender
      - `is_active` (boolean) - Whether this configuration is active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `smtp_configurations` table
    - Admin users can read and manage SMTP configurations
    - Standard users cannot access SMTP configurations
    
  3. Notes
    - Only one active configuration per company (or system-wide)
    - Password should be encrypted but for simplicity storing as text
    - Sensitive data protected by RLS
*/

-- Create smtp_configurations table
CREATE TABLE IF NOT EXISTS smtp_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  mailer text DEFAULT 'smtp' NOT NULL,
  host text NOT NULL,
  port integer DEFAULT 587 NOT NULL,
  username text NOT NULL,
  password text NOT NULL,
  encryption text DEFAULT 'tls' NOT NULL CHECK (encryption IN ('tls', 'ssl', 'none')),
  from_address text NOT NULL,
  from_name text DEFAULT 'Procure to Pay' NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE smtp_configurations ENABLE ROW LEVEL SECURITY;

-- Create policies

-- Admin users can view all SMTP configurations
CREATE POLICY "Admin users can view all SMTP configurations"
  ON smtp_configurations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Admin users can insert SMTP configurations
CREATE POLICY "Admin users can insert SMTP configurations"
  ON smtp_configurations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Admin users can update SMTP configurations
CREATE POLICY "Admin users can update SMTP configurations"
  ON smtp_configurations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Admin users can delete SMTP configurations
CREATE POLICY "Admin users can delete SMTP configurations"
  ON smtp_configurations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_smtp_configurations_company_id 
ON smtp_configurations(company_id);

CREATE INDEX IF NOT EXISTS idx_smtp_configurations_is_active 
ON smtp_configurations(is_active);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_smtp_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_smtp_configurations_updated_at_trigger
  BEFORE UPDATE ON smtp_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_smtp_configurations_updated_at();

-- Insert default SMTP configuration
INSERT INTO smtp_configurations (
  company_id,
  mailer,
  host,
  port,
  username,
  password,
  encryption,
  from_address,
  from_name,
  is_active
)
VALUES (
  NULL,
  'smtp',
  'smtp.office365.com',
  587,
  'approvals2@stjoseph-group.com',
  '88GEG2ie',
  'tls',
  'approvals2@stjoseph-group.com',
  'Procure to Pay System',
  true
)
ON CONFLICT DO NOTHING;
