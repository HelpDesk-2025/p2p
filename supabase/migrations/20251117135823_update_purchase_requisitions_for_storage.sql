/*
  # Update Purchase Requisitions for Storage-based Attachments

  1. Changes to purchase_requisitions table
    - Replace merged_pdf_data (text) with attachment_paths (jsonb array)
    - Store array of file paths instead of base64 data
    - Each path references a file in Supabase Storage
  
  2. Data Migration
    - Keep existing merged_pdf_data for backward compatibility temporarily
    - New submissions will use attachment_paths
  
  3. Benefits
    - Support much larger files (up to 50MB each)
    - Better database performance
    - Reduced storage costs
*/

-- Add new column for storing attachment file paths
ALTER TABLE purchase_requisitions 
ADD COLUMN IF NOT EXISTS attachment_paths jsonb DEFAULT '[]'::jsonb;

-- Add comment explaining the new structure
COMMENT ON COLUMN purchase_requisitions.attachment_paths IS 
'Array of attachment file paths in Supabase Storage. Format: [{"path": "attachments/...", "name": "...", "type": "..."}]';
