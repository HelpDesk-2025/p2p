/*
  # Add Unique Constraint to SME Requests

  1. Changes
    - Add unique constraint on pr_id to ensure only one SME request per PR
    - This prevents duplicate SME requests at the database level
  
  2. Security
    - Enforces business rule: one SME request per Purchase Requisition
    - Prevents race conditions where multiple requests could be submitted simultaneously
*/

-- Add unique constraint to ensure only one SME request per PR
ALTER TABLE sme_requests
ADD CONSTRAINT sme_requests_pr_id_unique UNIQUE (pr_id);