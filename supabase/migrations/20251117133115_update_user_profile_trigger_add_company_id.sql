/*
  # Update User Profile Trigger to Include company_id

  1. Changes
    - Update the handle_new_user() trigger function to extract company_id from metadata
    - Converts company_id string to UUID when inserting into user_profiles
    
  2. Notes
    - This ensures that when creating a user via signUp, the company_id is properly stored
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
    NEW.raw_user_meta_data->>'company',
    CASE 
      WHEN NEW.raw_user_meta_data->>'company_id' IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'company_id')::uuid
      ELSE NULL
    END,
    NEW.raw_user_meta_data->>'department',
    COALESCE(NEW.raw_user_meta_data->>'role', 'standard'),
    NEW.raw_user_meta_data->>'approver_type',
    NEW.raw_user_meta_data->>'e_sig'
  );
  RETURN NEW;
END;
$$;
