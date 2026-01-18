/*
  # Add Accounting Notification Email to Companies

  1. Changes
    - Add `accounting_notification_email` column to `companies` table
    - This field will be used to send email notifications when requests are posted to MSBC
  
  2. Notes
    - Field is optional (nullable)
    - No RLS changes needed as companies table already has proper policies
*/

-- Add accounting notification email field to companies table
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS accounting_notification_email text;

COMMENT ON COLUMN companies.accounting_notification_email IS 'Email address for accounting notifications when requests are posted to MSBC';
