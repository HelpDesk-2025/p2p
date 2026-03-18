import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateOTPEmailHTML(otpCode: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">Password Reset Request</h1>
        </div>
        
        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 16px 0; font-size: 16px;">Hello,</p>
          
          <p style="margin: 0 0 24px 0; color: #6b7280;">We received a request to reset your password. Use the OTP code below to proceed with resetting your password.</p>
          
          <div style="background: #f0f9ff; border: 2px solid #3b82f6; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 8px 0; color: #1e40af; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your OTP Code</p>
            <p style="margin: 0; color: #1e3a8a; font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">${otpCode}</p>
          </div>
          
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #78350f; font-size: 14px;"><strong>Important:</strong> This code will expire in 10 minutes.</p>
          </div>
          
          <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px;">If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
        </div>
        
        <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">This is an automated notification. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function sendEmailWithSMTP(
  smtpConfig: any,
  to: string,
  subject: string,
  htmlContent: string
) {
  console.log(`[SMTP] Attempting to send email to: ${to}`);
  console.log(`[SMTP] Using host: ${smtpConfig.host}:${smtpConfig.port}`);
  console.log(`[SMTP] Encryption: ${smtpConfig.encryption}`);

  const normalizedHtml = htmlContent.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

  const message = [
    `From: ${smtpConfig.from_name} <${smtpConfig.from_address}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    normalizedHtml,
  ].join('\r\n');

  const encoder = new TextEncoder();

  try {
    console.log(`[SMTP] Connecting to ${smtpConfig.host}:${smtpConfig.port}`);
    const conn = await Deno.connect({
      hostname: smtpConfig.host,
      port: smtpConfig.port,
    });
    console.log('[SMTP] Connection established');

    const reader = conn.readable.getReader();
    const writer = conn.writable.getWriter();

    const read = async () => {
      const { value } = await reader.read();
      if (value) {
        const response = new TextDecoder().decode(value);
        console.log(`[SMTP] Received: ${response.substring(0, 100)}`);
        return response;
      }
      return '';
    };

    const write = async (data: string) => {
      console.log(`[SMTP] Sending: ${data.substring(0, 50)}${data.length > 50 ? '...' : ''}`);
      await writer.write(encoder.encode(data + '\r\n'));
    };

    await read();
    await write(`EHLO ${smtpConfig.host}`);
    await read();

    if (smtpConfig.encryption === 'tls') {
      console.log('[SMTP] Starting TLS...');
      await write('STARTTLS');
      await read();

      const tlsConn = await Deno.startTls(conn, {
        hostname: smtpConfig.host,
      });
      console.log('[SMTP] TLS connection established');

      const tlsReader = tlsConn.readable.getReader();
      const tlsWriter = tlsConn.writable.getWriter();

      const tlsRead = async () => {
        const { value } = await tlsReader.read();
        if (value) {
          const response = new TextDecoder().decode(value);
          console.log(`[SMTP/TLS] Received: ${response.substring(0, 100)}`);
          return response;
        }
        return '';
      };

      const tlsWrite = async (data: string) => {
        const logData = data.includes('AUTH') && data.length > 20 ? 'AUTH [REDACTED]' : data.substring(0, 50);
        console.log(`[SMTP/TLS] Sending: ${logData}${data.length > 50 ? '...' : ''}`);
        await tlsWriter.write(encoder.encode(data + '\r\n'));
      };

      await tlsWrite(`EHLO ${smtpConfig.host}`);
      await tlsRead();

      console.log('[SMTP] Authenticating...');
      await tlsWrite('AUTH LOGIN');
      await tlsRead();

      const base64Username = btoa(smtpConfig.username);
      await tlsWrite(base64Username);
      await tlsRead();

      const base64Password = btoa(smtpConfig.password);
      await tlsWrite(base64Password);
      const authResponse = await tlsRead();

      if (!authResponse.includes('235')) {
        console.error('[SMTP] Authentication failed:', authResponse);
        throw new Error('SMTP authentication failed');
      }
      console.log('[SMTP] Authentication successful');

      await tlsWrite(`MAIL FROM:<${smtpConfig.from_address}>`);
      await tlsRead();

      await tlsWrite(`RCPT TO:<${to}>`);
      const rcptResponse = await tlsRead();

      if (!rcptResponse.includes('250')) {
        console.error('[SMTP] Recipient rejected:', rcptResponse);
        throw new Error(`Recipient email rejected by server: ${to}`);
      }

      await tlsWrite('DATA');
      await tlsRead();

      await tlsWrite(message + '\r\n.');
      const dataResponse = await tlsRead();

      if (!dataResponse.includes('250')) {
        console.error('[SMTP] Message rejected:', dataResponse);
        throw new Error('Email message rejected by server');
      }
      console.log('[SMTP] Email sent successfully');

      await tlsWrite('QUIT');
      await tlsRead();

      tlsConn.close();
    } else {
      console.log('[SMTP] Using non-encrypted connection');
      await write('AUTH LOGIN');
      await read();

      const base64Username = btoa(smtpConfig.username);
      await write(base64Username);
      await read();

      const base64Password = btoa(smtpConfig.password);
      await write(base64Password);
      const authResponse = await read();

      if (!authResponse.includes('235')) {
        console.error('[SMTP] Authentication failed:', authResponse);
        throw new Error('SMTP authentication failed');
      }
      console.log('[SMTP] Authentication successful');

      await write(`MAIL FROM:<${smtpConfig.from_address}>`);
      await read();

      await write(`RCPT TO:<${to}>`);
      const rcptResponse = await read();

      if (!rcptResponse.includes('250')) {
        console.error('[SMTP] Recipient rejected:', rcptResponse);
        throw new Error(`Recipient email rejected by server: ${to}`);
      }

      await write('DATA');
      await read();

      await write(message + '\r\n.');
      const dataResponse = await read();

      if (!dataResponse.includes('250')) {
        console.error('[SMTP] Message rejected:', dataResponse);
        throw new Error('Email message rejected by server');
      }
      console.log('[SMTP] Email sent successfully');

      await write('QUIT');
      await read();

      conn.close();
    }

    console.log('[SMTP] Connection closed successfully');
    return { success: true };
  } catch (error: any) {
    console.error('[SMTP] ERROR:', error);
    console.error('[SMTP] Stack trace:', error.stack);
    throw new Error(`Failed to send email via SMTP: ${error.message}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log('[Main] Password reset OTP request received');
    const { email } = await req.json();

    if (!email) {
      console.error('[Main] Email is missing in request');
      throw new Error('Email is required');
    }

    console.log(`[Main] Processing request for email: ${email}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if user exists by querying the user_profiles table
    console.log('[Main] Checking if user exists...');
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email')
      .ilike('email', email)
      .maybeSingle();

    if (profileError) {
      console.error('[Main] Error checking user profile:', profileError);
    }

    if (!userProfile) {
      console.log('[Main] User not found');
      return new Response(
        JSON.stringify({ success: false, error: 'No account found with this email address' }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log(`[Main] User found: ${userProfile.email}`);

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    console.log(`[Main] Generated OTP code: ${otpCode}, expires at: ${expiresAt.toISOString()}`);

    // Store OTP in database
    console.log('[Main] Storing OTP in database...');
    const { error: otpError } = await supabase
      .from('password_reset_otps')
      .insert({
        email: userProfile.email,
        otp_code: otpCode,
        expires_at: expiresAt.toISOString(),
      });

    if (otpError) {
      console.error('[Main] Failed to store OTP:', otpError);
      throw new Error('Failed to generate OTP');
    }

    console.log('[Main] OTP stored successfully');

    // Get SMTP config
    console.log('[Main] Fetching SMTP configuration...');
    const { data: smtpConfig, error: configError } = await supabase
      .from('smtp_configurations')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    if (configError || !smtpConfig) {
      console.error('[Main] Failed to fetch SMTP configuration:', configError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email service not configured. Please contact administrator.'
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('[Main] SMTP configuration retrieved successfully');

    // Send OTP email
    console.log(`[Main] Sending OTP email to: ${userProfile.email}`);
    const htmlContent = generateOTPEmailHTML(otpCode);
    await sendEmailWithSMTP(smtpConfig, userProfile.email, 'P2P - Password Reset OTP', htmlContent);

    console.log('[Main] OTP email sent successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'OTP sent to your email' }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('[Main] Error sending OTP:', error);
    console.error('[Main] Error stack:', error.stack);
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