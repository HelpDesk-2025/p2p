/*
  # Create Subject Matter Expert (SME) Requests Table

  1. New Tables
    - `sme_requests`
      - `id` (uuid, primary key)
      - `pr_id` (uuid, foreign key to purchase_requisitions)
      - `requested_by` (uuid, foreign key to user_profiles - the procurement user)
      - `sme_user_id` (uuid, foreign key to user_profiles - the assigned SME)
      - `purpose` (text, reason for seeking SME help)
      - `status` (text, workflow status: pending, approved, rejected)
      - `sme_comments` (text, nullable, feedback from SME)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `sme_requests` table
    - Add policy for authenticated users to view SME requests for their company
    - Add policy for procurement users to create SME requests
    - Add policy for SME users to update their assigned requests
*/

CREATE TABLE IF NOT EXISTS sme_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid REFERENCES purchase_requisitions(id) ON DELETE CASCADE NOT NULL,
  requested_by uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  sme_user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  purpose text NOT NULL,
  status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  sme_comments text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sme_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view SME requests for their company"
  ON sme_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      WHERE up1.id = sme_requests.requested_by
      AND up1.company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Procurement users can create SME requests"
  ON sme_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "SME users can update their assigned requests"
  ON sme_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = sme_user_id)
  WITH CHECK (auth.uid() = sme_user_id);