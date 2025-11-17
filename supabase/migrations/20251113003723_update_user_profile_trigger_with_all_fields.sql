/*
  # Update User Profile Trigger to Include All Fields

  1. Changes
    - Update the handle_new_user() trigger function to extract all user profile fields from metadata
    - Includes: full_name, company, department, role, approver_type, e_sig
    
  2. Notes
    - This ensures that when creating a user via signUp, all profile data is properly stored
    - Existing trigger is replaced with the updated version
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id, 
    email, 
    full_name, 
    company,
    department,
    role,
    approver_type,
    e_sig
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'company',
    NEW.raw_user_meta_data->>'department',
    COALESCE(NEW.raw_user_meta_data->>'role', 'standard'),
    NEW.raw_user_meta_data->>'approver_type',
    NEW.raw_user_meta_data->>'e_sig'
  );
  RETURN NEW;
END;
$$;
