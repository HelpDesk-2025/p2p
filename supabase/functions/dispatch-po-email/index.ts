import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DispatchRequest {
  purchaseOrderId: string;
  vendorEmail: string;
  poNumber: string;
  vendorName: string;
  totalAmount: number;
  companyName?: string;
  remarks?: string;
}

function generateDispatchEmailHTML(data: DispatchRequest): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f3f4f6;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #0f766e 0%, #115e59 100%); padding: 32px 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">Purchase Order</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 16px;">${data.poNumber}</p>
        </div>

        <div style="padding: 32px 24px;">
          <p style="margin: 0 0 16px 0; font-size: 16px;">Dear ${data.vendorName},</p>

          <p style="margin: 0 0 24px 0; color: #6b7280;">
            Please find attached the Purchase Order <strong>${data.poNumber}</strong> from <strong>${data.companyName || 'our company'}</strong>.
          </p>

          <div style="background: #f0fdfa; border-left: 4px solid #0f766e; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; color: #134e4a; font-weight: 600;">Purchase Order Details</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-weight: 600;">PO Number:</td>
                <td style="padding: 6px 0; color: #111827; font-family: monospace;">${data.poNumber}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-weight: 600;">Total Amount:</td>
                <td style="padding: 6px 0; color: #111827; font-weight: bold;">PHP ${data.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </table>
          </div>

          ${data.remarks ? `
          <div style="background: #fffbeb; border-left: 4px solid #d97706; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; color: #78350f; font-weight: 600;">Remarks</p>
            <p style="margin: 8px 0 0 0; color: #78350f;">${data.remarks}</p>
          </div>
          ` : ''}

          <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px;">
            Please review the attached PO document. If you have any questions or concerns, please contact us immediately.
          </p>
        </div>

        <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">This is an automated notification. Please contact the sender if you need assistance.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function sendEmailWithAttachment(
  smtpConfig: any,
  to: string,
  subject: string,
  htmlContent: string,
  attachment: { filename: string; content: Uint8Array; contentType: string } | null
) {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2)}`;
  const encoder = new TextEncoder();

  const encodedFromName = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(smtpConfig.from_name)))}?=`;

  let messageParts = [
    `From: ${encodedFromName} <${smtpConfig.from_address}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
  ];

  if (attachment) {
    messageParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    messageParts.push('');
    messageParts.push(`--${boundary}`);
    messageParts.push('Content-Type: text/html; charset=utf-8');
    messageParts.push('Content-Transfer-Encoding: 7bit');
    messageParts.push('');
    messageParts.push(htmlContent);
    messageParts.push('');
    messageParts.push(`--${boundary}`);
    messageParts.push(`Content-Type: ${attachment.contentType}; name="${attachment.filename}"`);
    messageParts.push('Content-Transfer-Encoding: base64');
    messageParts.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
    messageParts.push('');

    const base64Content = btoa(String.fromCharCode(...attachment.content));
    const chunkSize = 76;
    for (let i = 0; i < base64Content.length; i += chunkSize) {
      messageParts.push(base64Content.slice(i, i + chunkSize));
    }
    messageParts.push('');
    messageParts.push(`--${boundary}--`);
  } else {
    messageParts.push('Content-Type: text/html; charset=utf-8');
    messageParts.push('');
    messageParts.push(htmlContent);
  }

  const message = messageParts.join('\r\n');

  const conn = await Deno.connect({
    hostname: smtpConfig.host,
    port: smtpConfig.port,
  });

  const reader = conn.readable.getReader();
  const writer = conn.writable.getWriter();

  const read = async () => {
    const { value } = await reader.read();
    if (value) return new TextDecoder().decode(value);
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

    const tlsConn = await Deno.startTls(conn, { hostname: smtpConfig.host });
    const tlsReader = tlsConn.readable.getReader();
    const tlsWriter = tlsConn.writable.getWriter();

    const tlsRead = async () => {
      const { value } = await tlsReader.read();
      if (value) return new TextDecoder().decode(value);
      return '';
    };
    const tlsWrite = async (data: string) => {
      await tlsWriter.write(encoder.encode(data + '\r\n'));
    };

    await tlsWrite(`EHLO ${smtpConfig.host}`);
    await tlsRead();
    await tlsWrite('AUTH LOGIN');
    await tlsRead();
    await tlsWrite(btoa(smtpConfig.username));
    await tlsRead();
    await tlsWrite(btoa(smtpConfig.password));
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
    await write(btoa(smtpConfig.username));
    await read();
    await write(btoa(smtpConfig.password));
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
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const data: DispatchRequest = await req.json();

    if (!data.vendorEmail || !data.purchaseOrderId || !data.poNumber) {
      throw new Error('Missing required fields: vendorEmail, purchaseOrderId, poNumber');
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
      return new Response(
        JSON.stringify({
          success: false,
          message: 'SMTP not configured. Please set up SMTP configuration first.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let attachment: { filename: string; content: Uint8Array; contentType: string } | null = null;

    const { data: poRecord } = await supabase
      .from('purchase_orders')
      .select('merged_pdf_path')
      .eq('id', data.purchaseOrderId)
      .maybeSingle();

    if (poRecord?.merged_pdf_path) {
      const { data: fileData } = await supabase.storage
        .from('attachments')
        .download(poRecord.merged_pdf_path);

      if (fileData) {
        const arrayBuffer = await fileData.arrayBuffer();
        attachment = {
          filename: `${data.poNumber}.pdf`,
          content: new Uint8Array(arrayBuffer),
          contentType: 'application/pdf',
        };
      }
    }

    const htmlContent = generateDispatchEmailHTML(data);
    const subject = `Purchase Order ${data.poNumber} - ${data.companyName || ''}`.trim();

    await sendEmailWithAttachment(smtpConfig, data.vendorEmail, subject, htmlContent, attachment);

    return new Response(
      JSON.stringify({ success: true, message: 'PO dispatched to vendor successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error dispatching PO email:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
