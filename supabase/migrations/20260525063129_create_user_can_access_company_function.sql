/*
  # Create user_can_access_company helper function

  1. New Functions
    - `user_can_access_company(p_company_id uuid)` - Returns true if the current user can access data for the given company
  
  2. Logic
    - Returns true if user's role has full_access (admin or any role with has_full_access = true)
    - Returns true if user has multi-company enabled and the company is in their allowed_companies list
    - Returns true if the company matches the user's primary company_id
    - Returns false otherwise
  
  3. Security
    - SECURITY DEFINER to bypass RLS when checking user_profiles and roles
    - Used in RLS policies to enforce company-scoped access
*/

CREATE OR REPLACE FUNCTION public.user_can_access_company(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT 
    up.company_id,
    up.enable_multi_company_requests,
    up.allowed_companies,
    up.role,
    up.is_active,
    COALESCE(r.has_full_access, false) AS has_full_access
  INTO v_profile
  FROM user_profiles up
  LEFT JOIN roles r ON lower(r.name) = lower(up.role)
  WHERE up.id = v_uid;

  IF v_profile IS NULL OR v_profile.is_active = false THEN
    RETURN false;
  END IF;

  IF lower(v_profile.role) = 'admin' OR v_profile.has_full_access = true THEN
    RETURN true;
  END IF;

  IF v_profile.enable_multi_company_requests = true 
     AND v_profile.allowed_companies IS NOT NULL 
     AND jsonb_array_length(v_profile.allowed_companies) > 0 THEN
    RETURN v_profile.allowed_companies ? p_company_id::text;
  END IF;

  RETURN v_profile.company_id = p_company_id;
END;
$$;