/*
  # Add API URLs to companies table

  1. Changes
    - Add vendor_api_url column to companies table
    - Add item_api_url column to companies table
    - Both columns are text type and nullable

  2. Purpose
    - Stores external API endpoints for vendor data integration
    - Stores external API endpoints for item/product data integration
*/

-- Add vendor API URL column
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vendor_api_url text;

-- Add item API URL column
ALTER TABLE companies ADD COLUMN IF NOT EXISTS item_api_url text;
