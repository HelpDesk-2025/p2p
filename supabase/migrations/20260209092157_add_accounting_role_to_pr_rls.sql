/*
  # Add accounting role to purchase requisitions RLS policies
  
  1. Changes
    - Update SELECT policy to allow 'accounting' role to view all purchase requisitions
    - Update UPDATE policy to allow 'accounting' role to update requisition status
  
  2. Security
    - Maintains existing security model while adding accounting role access
    - Accounting users need to view and update PRs for their approval workflow
*/

-- Drop and recreate the SELECT policy to include accounting role
DROP POLICY IF EXISTS "Approvers and Procurement can view all purchase requisitions" ON purchase_requisitions;

CREATE POLICY "Approvers, Procurement and Accounting can view all purchase requisitions"
  ON purchase_requisitions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  );

-- Drop and recreate the UPDATE policy to include accounting role
DROP POLICY IF EXISTS "Approvers can update requisition status" ON purchase_requisitions;

CREATE POLICY "Approvers, Procurement and Accounting can update requisition status"
  ON purchase_requisitions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('approver', 'admin', 'procurement', 'accounting')
      AND user_profiles.is_active = true
    )
  );
