/*
  # Remove API URLs from companies table

  1. Changes
    - Drop vendor_api_url column from companies table
    - Drop item_api_url column from companies table

  2. Purpose
    - Reverting the addition of API URL fields
*/

-- Drop vendor API URL column
ALTER TABLE companies DROP COLUMN IF EXISTS vendor_api_url;

-- Drop item API URL column
ALTER TABLE companies DROP COLUMN IF EXISTS item_api_url;
