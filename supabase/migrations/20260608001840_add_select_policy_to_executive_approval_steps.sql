-- Ensure all authenticated users can read executive_approval_steps
-- This is needed so that the ManCom expense routing can look up
-- the payee's budgeted executive approval flow during PR submission.

DO $$
BEGIN
  -- Check if RLS is enabled
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'executive_approval_steps' 
    AND schemaname = 'public'
  ) THEN
    -- Enable RLS if not already
    ALTER TABLE executive_approval_steps ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing select policy if any to avoid conflict
    DROP POLICY IF EXISTS "authenticated_select_executive_approval_steps" ON executive_approval_steps;
    
    -- Allow all authenticated users to read executive_approval_steps
    CREATE POLICY "authenticated_select_executive_approval_steps"
      ON executive_approval_steps FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
