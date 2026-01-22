/*
  # Add Procurement Notification Email to Companies

  1. Changes
    - Add `procurement_notification_email` column to `companies` table
    - This field will be used to send email notifications when PR requests with purchase type "Purchase Order" are set to "Ready for Canvass"
  
  2. Notes
    - Field is optional (nullable)
    - No RLS changes needed as companies table already has proper policies
*/

-- Add procurement notification email field to companies table
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS procurement_notification_email text;

COMMENT ON COLUMN companies.procurement_notification_email IS 'Email address for procurement notifications when Purchase Order PRs are ready for canvass';
