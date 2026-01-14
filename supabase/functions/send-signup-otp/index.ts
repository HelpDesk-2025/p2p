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

function generateSignUpOTPEmailHTML(otpCode: string, fullName: string): string {
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
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">Welcome to Point to Point!</h1>
        </div>
        
        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 16px 0; font-size: 16px;">Hello ${fullName},</p>
          
          <p style="margin: 0 0 24px 0; color: #6b7280;">Thank you for signing up! Please verify your email address by entering the OTP code below to complete your registration.</p>
          
          <div style="background: #f0f9ff; border: 2px solid #3b82f6; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 8px 0; color: #1e40af; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your OTP Code</p>
            <p style="margin: 0; color: #1e3a8a; font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">${otpCode}</p>
          </div>
          
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #78350f; font-size: 14px;"><strong>Important:</strong> This code will expire in 10 minutes.</p>
          </div>
          
          <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px;">If you did not create an account, please ignore this email or contact support if you have concerns.</p>
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
  const message = [
    `From: ${smtpConfig.from_name} <${smtpConfig.from_address}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlContent,
  ].join('\r\n');

  const encoder = new TextEncoder();
  const base64Message = btoa(
    String.fromCharCode(...encoder.encode(message))
  );

  try {
    const conn = await Deno.connect({
      hostname: smtpConfig.host,
      port: smtpConfig.port,
    });

    const reader = conn.readable.getReader();
    const writer = conn.writable.getWriter();

    const read = async () => {
      const { value } = await reader.read();
      if (value) {
        return new TextDecoder().decode(value);
      }
      return '';
    };

    const write = async (data: string) => {
      await writer.write(encoder.encode(data + '\r\n'));
    };

    await read();
    await write(`EHLO ${smtpConfig.host}`);
    await read();

    if (smtpConfig.encryption === 'tls') {
      await write('STARTTLS');
      await read();
      
      const tlsConn = await Deno.startTls(conn, {
        hostname: smtpConfig.host,
      });

      const tlsReader = tlsConn.readable.getReader();
      const tlsWriter = tlsConn.writable.getWriter();

      const tlsRead = async () => {
        const { value } = await tlsReader.read();
        if (value) {
          return new TextDecoder().decode(value);
        }
        return '';
      };

      const tlsWrite = async (data: string) => {
        await tlsWriter.write(encoder.encode(data + '\r\n'));
      };

      await tlsWrite(`EHLO ${smtpConfig.host}`);
      await tlsRead();

      await tlsWrite('AUTH LOGIN');
      await tlsRead();

      const base64Username = btoa(smtpConfig.username);
      await tlsWrite(base64Username);
      await tlsRead();

      const base64Password = btoa(smtpConfig.password);
      await tlsWrite(base64Password);
      await tlsRead();

      await tlsWrite(`MAIL FROM:<${smtpConfig.from_address}>`);
      await tlsRead();

      await tlsWrite(`RCPT TO:<${to}>`);
      await tlsRead();

      await tlsWrite('DATA');
      await tlsRead();

      await tlsWrite(message + '\r\n.');
      await tlsRead();

      await tlsWrite('QUIT');
      await tlsRead();

      tlsConn.close();
    } else {
      await write('AUTH LOGIN');
      await read();

      const base64Username = btoa(smtpConfig.username);
      await write(base64Username);
      await read();

      const base64Password = btoa(smtpConfig.password);
      await write(base64Password);
      await read();

      await write(`MAIL FROM:<${smtpConfig.from_address}>`);
      await read();

      await write(`RCPT TO:<${to}>`);
      await read();

      await write('DATA');
      await read();

      await write(message + '\r\n.');
      await read();

      await write('QUIT');
      await read();

      conn.close();
    }

    return { success: true };
  } catch (error: any) {
    console.error('SMTP Error:', error);
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
    const { email, fullName, password, department, companyId, companyName } = await req.json();

    if (!email || !fullName || !password || !department || !companyId || !companyName) {
      throw new Error('All fields are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if user already exists
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    const userExists = userData?.users.some(u => u.email === email);

    if (userExists) {
      return new Response(
        JSON.stringify({ success: false, error: 'An account with this email already exists' }),
        {
          status: 409,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in database
    const { error: otpError } = await supabase
      .from('signup_otps')
      .insert({
        email,
        otp_code: otpCode,
        full_name: fullName,
        password,
        department,
        company_id: companyId,
        company_name: companyName,
        expires_at: expiresAt.toISOString(),
      });

    if (otpError) {
      console.error('Failed to store OTP:', otpError);
      throw new Error('Failed to generate OTP');
    }

    // Get SMTP config
    const { data: smtpConfig, error: configError } = await supabase
      .from('smtp_configurations')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    if (configError || !smtpConfig) {
      console.error('Failed to fetch SMTP configuration:', configError);
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

    // Send OTP email
    const htmlContent = generateSignUpOTPEmailHTML(otpCode, fullName);
    await sendEmailWithSMTP(smtpConfig, email, 'Verify Your Email - Point to Point', htmlContent);

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
    console.error('Error sending OTP:', error);
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