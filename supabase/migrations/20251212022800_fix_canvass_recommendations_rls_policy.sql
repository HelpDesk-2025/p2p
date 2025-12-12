/*
  # Fix Canvass Recommendations RLS Policy

  1. Problem
    - The RLS policy for viewing canvass_approver_recommendations was checking for incorrect role values
    - Policy was checking for capitalized roles ('Admin', 'Procurement', etc.) but actual roles are lowercase ('admin', 'approver', 'standard')
    - This caused recommendations to not be visible to users

  2. Changes
    - Drop the old policy
    - Create a new policy that properly checks user access based on actual roles and company context
    - Allow users to view recommendations for canvass requests in their company
*/

-- Drop the old incorrect policy
DROP POLICY IF EXISTS "Users can view canvass recommendations" ON canvass_approver_recommendations;

-- Create new policy with correct logic
CREATE POLICY "Users can view canvass recommendations"
  ON canvass_approver_recommendations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM canvass_requests cr
      JOIN user_profiles up_requester ON cr.requester_id = up_requester.id
      JOIN user_profiles up_viewer ON up_viewer.id = auth.uid()
      WHERE cr.id = canvass_request_id
      AND up_requester.company_id = up_viewer.company_id
      AND (
        cr.requester_id = auth.uid() 
        OR up_viewer.role IN ('admin', 'approver')
      )
    )
  );