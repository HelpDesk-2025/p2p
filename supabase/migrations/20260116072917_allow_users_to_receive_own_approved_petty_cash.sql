/*
  # Allow Users to Receive Their Own Approved Petty Cash

  1. Changes
    - Add UPDATE policy to allow users to mark their own approved petty cash as received
    - This enables standard users to update the received_at, received_by, and approved_petty_cash_pdf_path fields
    - Users can only update their own requests when status is 'approved'
  
  2. Security
    - Users can only update their own petty cash requests (requester_id = auth.uid())
    - Only applies to approved requests (status = 'approved')
    - Maintains data integrity by restricting which requests can be updated
*/

-- Allow users to update their own approved petty cash to mark as received
CREATE POLICY "Users can mark own approved petty cash as received"
  ON petty_cash_requests
  FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid() AND status = 'approved')
  WITH CHECK (requester_id = auth.uid() AND status = 'approved');