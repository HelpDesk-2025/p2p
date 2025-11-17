/*
  # Add API ID to companies table

  1. Changes
    - Add api_id column to companies table (text type, nullable)

  2. Purpose
    - Stores API identifier for external system integration
*/

-- Add API ID column
ALTER TABLE companies ADD COLUMN IF NOT EXISTS api_id text;
