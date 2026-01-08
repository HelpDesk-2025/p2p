/*
  # Fix User Profile Trigger to Lookup Company Name

  1. Changes
    - Update the handle_new_user() trigger function to automatically lookup company name from company_id
    - When a user signs up with company_id, the trigger will fetch the company name from the companies table
    
  2. Notes
    - This ensures that both company and company_id are properly populated in user_profiles
    - Fixes the issue where newly registered users show "-" for company in the user management interface
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_company_name text;
BEGIN
  -- Get company_id from metadata
  v_company_id := CASE 
    WHEN NEW.raw_user_meta_data->>'company_id' IS NOT NULL 
    THEN (NEW.raw_user_meta_data->>'company_id')::uuid
    ELSE NULL
  END;
  
  -- Lookup company name if company_id exists
  IF v_company_id IS NOT NULL THEN
    SELECT name INTO v_company_name
    FROM public.companies
    WHERE id = v_company_id;
  END IF;

  INSERT INTO public.user_profiles (
    id, 
    email, 
    full_name, 
    company,
    company_id,
    department,
    role,
    approver_type,
    e_sig
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(v_company_name, NEW.raw_user_meta_data->>'company'),
    v_company_id,
    NEW.raw_user_meta_data->>'department',
    COALESCE(NEW.raw_user_meta_data->>'role', 'standard'),
    NEW.raw_user_meta_data->>'approver_type',
    NEW.raw_user_meta_data->>'e_sig'
  );
  RETURN NEW;
END;
$$;