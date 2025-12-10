/*
  # Add Canvass Recommendation Fields

  1. Updates to `canvass_requests` table
    - Add `recommended_quotation_index` (integer) - Index of the recommended quotation (0-based)
    - Add `recommendation_remarks` (text) - Remarks for the recommended quotation
    - Add `department` (text) - Department from the linked PR for approval flow

  2. Updates to `purchase_requisitions` table
    - Add `canvass_id` (uuid) - Link to canvass request that uses this PR
    - Prevent PRs from being used in multiple canvass requests
*/

-- Add fields to canvass_requests table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvass_requests' AND column_name = 'recommended_quotation_index'
  ) THEN
    ALTER TABLE canvass_requests ADD COLUMN recommended_quotation_index integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvass_requests' AND column_name = 'recommendation_remarks'
  ) THEN
    ALTER TABLE canvass_requests ADD COLUMN recommendation_remarks text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'canvass_requests' AND column_name = 'department'
  ) THEN
    ALTER TABLE canvass_requests ADD COLUMN department text;
  END IF;
END $$;

-- Add canvass_id to purchase_requisitions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_requisitions' AND column_name = 'canvass_id'
  ) THEN
    ALTER TABLE purchase_requisitions ADD COLUMN canvass_id uuid REFERENCES canvass_requests(id);
  END IF;
END $$;