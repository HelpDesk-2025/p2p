/*
  # Update User Profile Trigger to Include Email Fields

  1. Changes
    - Update the handle_new_user() trigger function to include approver_email and checker_email
    - These fields will be populated from user metadata during signup
    
  2. Notes
    - Used for Executive requestor types who need designated approver and checker emails
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
    approver_email,
    checker_email,
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
    NEW.raw_user_meta_data->>'approver_email',
    NEW.raw_user_meta_data->>'checker_email',
    NEW.raw_user_meta_data->>'e_sig'
  );
  RETURN NEW;
END;
$$;
