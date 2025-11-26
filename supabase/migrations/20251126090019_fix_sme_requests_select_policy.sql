/*
  # Fix SME Requests SELECT Policy

  1. Changes
    - Drop the existing restrictive SELECT policy
    - Create a new SELECT policy that allows:
      - Users to view requests they created
      - SME users to view requests assigned to them
      - Users in the same company to view all SME requests
  
  2. Security
    - Maintains RLS protection
    - Allows proper access for both requesters and assigned SMEs
*/

DROP POLICY IF EXISTS "Users can view SME requests for their company" ON sme_requests;

CREATE POLICY "Users can view SME requests"
  ON sme_requests FOR SELECT
  TO authenticated
  USING (
    auth.uid() = requested_by OR
    auth.uid() = sme_user_id OR
    EXISTS (
      SELECT 1 FROM user_profiles up1
      WHERE up1.id = sme_requests.requested_by
      AND up1.company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );