/*
  # Add Admin Access to SME Requests

  1. Changes
    - Update the SELECT policy to allow admin users to view all SME requests
    - Admins can see all requests regardless of company or assignment
  
  2. Security
    - Maintains RLS protection
    - Allows proper access for requesters, SMEs, company users, and admins
*/

DROP POLICY IF EXISTS "Users can view SME requests" ON sme_requests;

CREATE POLICY "Users can view SME requests"
  ON sme_requests FOR SELECT
  TO authenticated
  USING (
    auth.uid() = requested_by OR
    auth.uid() = sme_user_id OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    ) OR
    EXISTS (
      SELECT 1 FROM user_profiles up1
      WHERE up1.id = sme_requests.requested_by
      AND up1.company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );