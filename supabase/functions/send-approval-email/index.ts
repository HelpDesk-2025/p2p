import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailRequest {
  to: string;
  subject: string;
  recipientName: string;
  requestType: string;
  documentNo: string;
  requesterName: string;
  department: string;
  totalAmount: number;
  action: string;
  actionBy?: string;
  comments?: string;
  nextApprover?: string;
}

function generateEmailHTML(data: EmailRequest): string {
  const isProcurementNotification = data.action === 'Ready for Procurement Checking';
  const isFullyApproved = data.action === 'Fully Approved';

  const actionColor = data.action === 'Submitted' ? '#3b82f6' :
                      data.action === 'Approved' || isFullyApproved ? '#22c55e' :
                      isProcurementNotification ? '#f97316' : '#ef4444';

  const headerBg = isProcurementNotification
    ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
    : isFullyApproved
    ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
    : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)';

  const introText = isProcurementNotification
    ? `A <strong>${data.requestType}</strong> with Purchase Type <strong>Purchase Order</strong> has been fully approved and is now ready for Procurement Checking. Please review the request and mark it as Ready for Canvass.`
    : `A ${data.requestType.toLowerCase()} has been ${data.action.toLowerCase()} and requires your attention.`;

  const actionSection = data.action === 'Submitted'
    ? `
      <div style="background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0;">
        <p style="margin: 0; color: #1e40af; font-weight: 600;">Action Required</p>
        <p style="margin: 8px 0 0 0; color: #1e3a8a;">This request requires your approval.</p>
      </div>
    `
    : isProcurementNotification
    ? `
      <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 16px; margin: 20px 0;">
        <p style="margin: 0; color: #9a3412; font-weight: 600;">Procurement Checking Required</p>
        <p style="margin: 8px 0 0 0; color: #7c2d12;">This Purchase Order PR has been fully approved. Please proceed with procurement checking and set it as Ready for Canvass.</p>
        ${data.comments ? `<p style="margin: 8px 0 0 0; color: #7c2d12;">Note: ${data.comments}</p>` : ''}
      </div>
    `
    : `
      <div style="background: #fef3c7; border-left: 4px solid ${actionColor}; padding: 16px; margin: 20px 0;">
        <p style="margin: 0; color: #78350f; font-weight: 600;">${data.action} by ${data.actionBy}</p>
        ${data.comments ? `<p style="margin: 8px 0 0 0; color: #78350f;">Comments: ${data.comments}</p>` : ''}
      </div>
    `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="background: ${headerBg}; padding: 32px 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">${data.requestType} ${data.action}</h1>
        </div>

        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 16px 0; font-size: 16px;">Hello ${data.recipientName},</p>

          <p style="margin: 0 0 24px 0; color: #6b7280;">${introText}</p>

          ${actionSection}
          
          <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #111827;">Request Details</h2>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Document No:</td>
                <td style="padding: 8px 0; color: #111827; font-family: monospace;">${data.documentNo}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Requester:</td>
                <td style="padding: 8px 0; color: #111827;">${data.requesterName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Department:</td>
                <td style="padding: 8px 0; color: #111827;">${data.department}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 600;">Total Amount:</td>
                <td style="padding: 8px 0; color: #111827; font-weight: bold;">₱${data.totalAmount.toLocaleString()}</td>
              </tr>
            </table>
          </div>
          
          ${data.nextApprover ? `
            <div style="background: #eff6ff; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #1e40af;"><strong>Current Approver:</strong> ${data.nextApprover}</p>
            </div>
          ` : ''}

          <div style="text-align: center; margin: 32px 0;">
            <a href="https://procure-to-pay-web-a-cw8j.bolt.host/"
               style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              Access the System
            </a>
          </div>

          <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; text-align: center;">Please log in to the system to review and take action on this request.</p>
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
    const emailData: EmailRequest = await req.json();

    const { to, subject } = emailData;

    if (!to || !subject) {
      throw new Error('Missing required fields: to, subject');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
          message: 'Email service not configured. Please contact administrator.' 
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const htmlContent = generateEmailHTML(emailData);

    await sendEmailWithSMTP(smtpConfig, to, subject, htmlContent);

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully' }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('Error sending email:', error);
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