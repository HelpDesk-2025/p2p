import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { email, otpCode } = await req.json();

    if (!email || !otpCode) {
      throw new Error('Email and OTP code are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find valid OTP
    const { data: otpData, error: otpError } = await supabase
      .from('signup_otps')
      .select('*')
      .eq('email', email)
      .eq('otp_code', otpCode)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError || !otpData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired OTP code' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Create the user account
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: otpData.email,
      password: otpData.password,
      email_confirm: true,
      user_metadata: {
        full_name: otpData.full_name,
        department: otpData.department,
        company_id: otpData.company_id,
        company_name: otpData.company_name,
      },
    });

    if (authError) {
      console.error('Failed to create user:', authError);
      throw new Error('Failed to create account: ' + authError.message);
    }

    // Mark OTP as used
    await supabase
      .from('signup_otps')
      .update({ used: true })
      .eq('id', otpData.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Account created successfully! Your account is pending approval.' 
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('Error verifying OTP:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});