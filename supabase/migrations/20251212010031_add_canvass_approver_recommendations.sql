/*
  # Add Canvass Approver Recommendations

  1. New Table
    - `canvass_approver_recommendations`
      - `id` (uuid, primary key)
      - `canvass_request_id` (uuid, foreign key to canvass_requests)
      - `approver_id` (uuid, foreign key to auth.users)
      - `approver_level` (text) - e.g., "Procurement", "Canvass Approver 1", etc.
      - `recommended_quotation_index` (integer) - Index of recommended vendor (0-2)
      - `recommendation_remarks` (text, nullable) - Optional notes from approver
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on `canvass_approver_recommendations` table
    - Add policies for authenticated users to:
      - Create their own recommendations
      - View recommendations for canvass requests they can access
*/

CREATE TABLE IF NOT EXISTS canvass_approver_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canvass_request_id uuid NOT NULL REFERENCES canvass_requests(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approver_level text NOT NULL,
  recommended_quotation_index integer NOT NULL CHECK (recommended_quotation_index >= 0 AND recommended_quotation_index <= 2),
  recommendation_remarks text,
  created_at timestamptz DEFAULT now()
);

-- Add unique constraint to prevent duplicate recommendations from same approver
ALTER TABLE canvass_approver_recommendations 
ADD CONSTRAINT unique_approver_per_canvass 
UNIQUE (canvass_request_id, approver_id);

-- Enable RLS
ALTER TABLE canvass_approver_recommendations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view recommendations for canvass requests they can access
CREATE POLICY "Users can view canvass recommendations"
  ON canvass_approver_recommendations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM canvass_requests cr
      WHERE cr.id = canvass_request_id
      AND (cr.requester_id = auth.uid() OR auth.uid() IN (
        SELECT id FROM user_profiles WHERE role IN ('Admin', 'Procurement', 'Canvass Approver 1', 'Canvass Approver 2', 'President')
      ))
    )
  );

-- Policy: Authenticated users can create their own recommendations
CREATE POLICY "Users can create their own recommendations"
  ON canvass_approver_recommendations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = approver_id);

-- Policy: Users can update their own recommendations (in case they change their mind before final approval)
CREATE POLICY "Users can update their own recommendations"
  ON canvass_approver_recommendations FOR UPDATE
  TO authenticated
  USING (auth.uid() = approver_id)
  WITH CHECK (auth.uid() = approver_id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_canvass_approver_recommendations_canvass_id 
ON canvass_approver_recommendations(canvass_request_id);

CREATE INDEX IF NOT EXISTS idx_canvass_approver_recommendations_approver_id 
ON canvass_approver_recommendations(approver_id);