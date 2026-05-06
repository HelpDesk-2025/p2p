/*
  # Add API Integration configuration permission

  Adds a permission row `config_api_integrations` under the configuration module
  so roles can be granted access to the new API Integration sub-page.
*/

INSERT INTO public.permissions (name, module, description)
SELECT 'config_api_integrations', 'configuration', 'Access to API Integration configuration page'
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions WHERE name = 'config_api_integrations'
);
