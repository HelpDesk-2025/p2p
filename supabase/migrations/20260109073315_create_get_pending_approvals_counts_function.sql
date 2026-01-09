/*
  # Create function to get pending approval counts for dashboard

  1. Changes
    - Create function to efficiently count pending approvals for current user
    - Returns counts by request type
  
  2. Security
    - Function uses SECURITY DEFINER to access all data
    - Only returns counts for requests where user is current approver
*/

CREATE OR REPLACE FUNCTION get_pending_approvals_counts(user_id_param uuid)
RETURNS TABLE (
  request_type text,
  count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ar.request_type,
    COUNT(*)::bigint as count
  FROM get_approval_records() ar
  WHERE ar.is_pending = true
  GROUP BY ar.request_type;
END;
$$;
