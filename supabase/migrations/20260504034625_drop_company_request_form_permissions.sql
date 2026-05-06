/*
  # Drop legacy company_request_form_permissions table

  The page-level gating is now owned by `company_page_permissions`. Existing
  rows were already mirrored into the new table in a prior migration, so
  this legacy table is no longer used by the UI or Layout.
*/

DROP TABLE IF EXISTS public.company_request_form_permissions CASCADE;
