/*
  # Create Sign-Up OTPs Table

  1. New Tables
    - `signup_otps`
      - `id` (uuid, primary key)
      - `email` (text, not null) - Email address for sign-up verification
      - `otp_code` (text, not null) - 6-digit OTP code
      - `full_name` (text, not null) - User's full name
      - `password` (text, not null) - Encrypted password to set after verification
      - `department` (text, not null) - Department
      - `company_id` (uuid, not null) - Company ID
      - `company_name` (text, not null) - Company name
      - `expires_at` (timestamptz, not null) - OTP expiration time (10 minutes)
      - `used` (boolean, default false) - Whether OTP has been used
      - `created_at` (timestamptz, default now())
      
  2. Security
    - Enable RLS on `signup_otps` table
    - Allow anyone to insert OTPs (for sign-up requests)
    - No read access (OTPs are verified server-side)
    
  3. Indexes
    - Index on email and expires_at for efficient OTP lookup
    - Index on used status for cleanup queries
*/

CREATE TABLE IF NOT EXISTS signup_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  otp_code text NOT NULL,
  full_name text NOT NULL,
  password text NOT NULL,
  department text NOT NULL,
  company_id uuid NOT NULL,
  company_name text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create index for efficient OTP lookup
CREATE INDEX IF NOT EXISTS idx_signup_otps_email_expires 
  ON signup_otps(email, expires_at) 
  WHERE used = false;

-- Create index for cleanup
CREATE INDEX IF NOT EXISTS idx_signup_otps_expires 
  ON signup_otps(expires_at);

-- Enable RLS
ALTER TABLE signup_otps ENABLE ROW LEVEL SECURITY;

-- Allow anyone to request OTP (insert)
CREATE POLICY "Anyone can request sign-up OTP"
  ON signup_otps
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- No direct read access (verification happens server-side)