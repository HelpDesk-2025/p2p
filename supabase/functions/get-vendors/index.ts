import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Please log in again.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const url = new URL(req.url);
    const companyIdParam = url.searchParams.get('company_id');

    let companyId = companyIdParam;

    if (!companyId) {
      const { data: profile, error: profileError } = await supabaseClient
        .from('user_profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        return new Response(
          JSON.stringify({ error: `Profile error: ${profileError.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (!profile?.company_id) {
        return new Response(
          JSON.stringify({
            error: 'Your user profile does not have a company assigned. Please contact your administrator to assign a company to your account.'
          }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      companyId = profile.company_id;
    }

    const { data: company, error: companyError } = await supabaseClient
      .from('companies')
      .select('api_id, name')
      .eq('id', companyId)
      .maybeSingle();

    if (companyError) {
      return new Response(
        JSON.stringify({ error: `Company lookup error: ${companyError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!company?.api_id) {
      return new Response(
        JSON.stringify({
          error: `The company "${company?.name || 'Unknown'}" does not have an API ID configured. Please contact your administrator to configure the API ID for this company.`
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const apiUrl = `https://st-joseph-group.com:7048/BC140/api/beta/companies(${company.api_id})/vendors`;
    const username = 'SJGIPA';
    const password = 'Superteams2025';
    const basicAuth = btoa(`${username}:${password}`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({
          error: `MSBC API returned status ${response.status}`,
          details: errorText,
          apiUrl: apiUrl.replace(company.api_id, '[REDACTED]')
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const vendors = await response.json();

    const isNotBlocked = (blocked: any) =>
      blocked === null || blocked === undefined || blocked === false || String(blocked).trim() === '';

    const hasVendorPostingGroup = (v: any) => {
      const value =
        v?.vendorPostingGroup ??
        v?.Vendor_Posting_Group ??
        v?.vendor_posting_group;
      return typeof value === 'string' && value.trim().length > 0;
    };

    const passesFilters = (v: any) => isNotBlocked(v.blocked) && hasVendorPostingGroup(v);

    const filteredVendors = Array.isArray(vendors?.value)
      ? { ...vendors, value: vendors.value.filter(passesFilters) }
      : Array.isArray(vendors)
      ? vendors.filter(passesFilters)
      : vendors;

    return new Response(
      JSON.stringify(filteredVendors),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: error.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});