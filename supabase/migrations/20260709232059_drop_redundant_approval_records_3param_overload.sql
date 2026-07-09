/*
# Drop redundant 3-param overload of get_approval_records_with_signatures

1. Problem
   - Two overloads exist: (p_request_id, p_request_type) and (p_request_id, p_request_type, p_requester_id DEFAULT NULL)
   - PostgreSQL cannot resolve which to call when only 2 params are passed (PGRST203 error)
   - The 3-param version has an unused p_requester_id parameter and outdated logic

2. Fix
   - Drop the 3-param overload, keeping only the 2-param version which has the correct
     updated logic (includes for_checking records for Reimbursement/Liquidation types)

3. Important Notes
   - The p_requester_id parameter was never used in the function body
   - The 2-param version was updated in migration 20260709124856 with correct filter logic
   - No callers pass p_requester_id, so removing this overload has no functional impact
*/

DROP FUNCTION IF EXISTS public.get_approval_records_with_signatures(uuid, text, uuid);
