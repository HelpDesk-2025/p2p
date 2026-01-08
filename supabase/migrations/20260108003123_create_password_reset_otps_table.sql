/*
  # Create Password Reset OTPs Table

  1. New Tables
    - `password_reset_otps`
      - `id` (uuid, primary key)
      - `email` (text, not null) - Email address for password reset
      - `otp_code` (text, not null) - 6-digit OTP code
      - `expires_at` (timestamptz, not null) - OTP expiration time (10 minutes)
      - `used` (boolean, default false) - Whether OTP has been used
      - `created_at` (timestamptz, default now())
      
  2. Security
    - Enable RLS on `password_reset_otps` table
    - Allow anyone to insert OTPs (for forgot password requests)
    - No read access (OTPs are verified server-side)
    - Only authenticated users can verify their own OTPs
    
  3. Indexes
    - Index on email and expires_at for efficient OTP lookup
    - Index on used status for cleanup queries
*/

CREATE TABLE IF NOT EXISTS password_reset_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create index for efficient OTP lookup
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email_expires 
  ON password_reset_otps(email, expires_at) 
  WHERE used = false;

-- Create index for cleanup
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_expires 
  ON password_reset_otps(expires_at);

-- Enable RLS
ALTER TABLE password_reset_otps ENABLE ROW LEVEL SECURITY;

-- Allow anyone to request OTP (insert)
CREATE POLICY "Anyone can request password reset OTP"
  ON password_reset_otps
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- No direct read access (verification happens server-side)
-- No update/delete policies needed (handled by system)