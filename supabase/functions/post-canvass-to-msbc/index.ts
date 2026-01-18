import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const MSBC_USERNAME = 'SJGIPA';
const MSBC_PASSWORD = 'Superteams2025';
const MSBC_BASE_URL = 'https://st-joseph-group.com:7048/BC140/api/beta';

// Create HTTP/1.1 client for MSBC API
const http11Client = Deno.createHttpClient({
  http1: true,
  http2: false,
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  let canvassId: string | null = null;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const body = await req.json();
    canvassId = body.canvass_id;

    if (!canvassId) {
      return new Response(
        JSON.stringify({ error: 'canvass_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🚀 Starting MSBC posting for Canvass:', canvassId);

    const { data: canvass, error: canvassError } = await supabaseClient
      .from('canvass_requests')
      .select(`
        *,
        requester:user_profiles!requester_id(full_name, email),
        company:companies!company_id(id, name, api_id, accounting_notification_email),
        pr:purchase_requisitions!pr_id(purpose, required_date)
      `)
      .eq('id', canvassId)
      .maybeSingle();

    if (canvassError || !canvass) {
      throw new Error(`Failed to fetch canvass: ${canvassError?.message}`);
    }

    if (canvass.status !== 'approved') {
      throw new Error('Canvass must be approved before posting to MSBC');
    }

    if (!canvass.winning_vendor_number) {
      throw new Error('Winning vendor number not found. Please ensure a winning vendor was selected during approval.');
    }

    console.log('📄 Canvass Data:', {
      canvass_number: canvass.canvass_number,
      status: canvass.status,
      winning_vendor_number: canvass.winning_vendor_number,
    });

    await supabaseClient
      .from('canvass_requests')
      .update({
        msbc_posting_status: 'Pending',
        msbc_sync_status: 'syncing'
      })
      .eq('id', canvassId);

    const companyAPIID = canvass.company?.api_id;
    if (!companyAPIID) {
      throw new Error('Company API ID not found. Please ensure the canvass request has a company with a valid API ID configured.');
    }

    const winningVendorIndex = canvass.recommended_quotation_index ?? 0;
    const winningVendorData = canvass.suppliers?.[winningVendorIndex];

    if (!winningVendorData) {
      throw new Error('Winning vendor data not found in canvass');
    }

    const vendorNumber = canvass.winning_vendor_number;
    const documentNumber = canvass.canvass_number;
    const dateNeeded = canvass.pr?.required_date
      ? new Date(canvass.pr.required_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const purpose = (canvass.pr?.purpose || 'Canvass Request').substring(0, 200);

    console.log('📊 Invoice Variables:', {
      companyAPIID,
      vendorNumber,
      documentNumber,
      dateNeeded,
      purpose,
    });

    if (!canvass.rfp_pdf_path) {
      throw new Error('CVS and RFP PDF not found');
    }

    console.log('📥 Downloading CVS and RFP PDF from:', canvass.rfp_pdf_path);
    const { data: rfpData, error: rfpDownloadError } = await supabaseClient.storage
      .from('attachments')
      .download(canvass.rfp_pdf_path);

    if (rfpDownloadError || !rfpData) {
      throw new Error(`Failed to download CVS and RFP: ${rfpDownloadError?.message}`);
    }

    const rfpBytes = new Uint8Array(await rfpData.arrayBuffer());
    console.log('✅ CVS and RFP downloaded, size:', rfpBytes.length);

    const attachmentFileName = `CVS_RFP_${documentNumber}.pdf`;
    console.log('✅ PDF ready, filename:', attachmentFileName);

    const basicAuth = btoa(`${MSBC_USERNAME}:${MSBC_PASSWORD}`);
    const headers = {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    };

    console.log('📤 STEP 1: Creating purchase invoice...');
    const step1Response = await fetch(
      `${MSBC_BASE_URL}/companies(${companyAPIID})/purchaseInvoices`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          vendorNumber: vendorNumber,
          invoiceDate: dateNeeded,
          dueDate: dateNeeded,
          vendorInvoiceNumber: documentNumber,
        }),
      }
    );

    if (!step1Response.ok) {
      const errorText = await step1Response.text();
      throw new Error(`STEP 1 failed (${step1Response.status}): ${errorText}`);
    }

    const invoiceBody = await step1Response.json();
    const invoiceID = invoiceBody.id;
    console.log('✅ STEP 1: Purchase invoice created, ID:', invoiceID);

    console.log('📤 STEP 2: Adding invoice lines...');
    const items = winningVendorData.items || [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`  Adding line ${i + 1}/${items.length}: ${item.description}`);

      const lineResponse = await fetch(
        `${MSBC_BASE_URL}/companies(${companyAPIID})/purchaseInvoices(${invoiceID})/purchaseInvoiceLines`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            lineType: 'Item',
            itemId: item.item_id || '',
            description: item.description || '',
            quantity: parseFloat(item.quantity) || 1,
            unitCost: parseFloat(item.unit_price) || 0,
            lineAmount: parseFloat(item.amount) || 0,
          }),
        }
      );

      if (!lineResponse.ok) {
        const errorText = await lineResponse.text();
        console.warn(`  ⚠️ Failed to add line ${i + 1}:`, errorText);
      } else {
        console.log(`  ✅ Line ${i + 1} added successfully`);
      }
    }

    console.log('✅ STEP 2: All invoice lines processed');

    console.log('📤 STEP 3: Creating attachment record...');
    const step3Response = await fetch(
      `${MSBC_BASE_URL}/companies(${companyAPIID})/attachments`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          parentId: invoiceID,
          fileName: attachmentFileName,
        }),
      }
    );

    if (!step3Response.ok) {
      const errorText = await step3Response.text();
      throw new Error(`STEP 3 failed (${step3Response.status}): ${errorText}`);
    }

    const attachmentBody = await step3Response.json();
    const attachmentID = attachmentBody.id;
    console.log('✅ STEP 3: Attachment record created, ID:', attachmentID);

    console.log('📤 STEP 4: Getting attachment etag...');
    const step4Response = await fetch(
      `${MSBC_BASE_URL}/companies(${companyAPIID})/attachments(parentId=${invoiceID},id=${attachmentID})`,
      { method: 'GET', headers }
    );

    if (!step4Response.ok) {
      const errorText = await step4Response.text();
      throw new Error(`STEP 4 failed (${step4Response.status}): ${errorText}`);
    }

    const attachmentGetBody = await step4Response.json();
    const etag = attachmentGetBody['@odata.etag'];
    console.log('✅ STEP 4: Got etag:', etag);

    let attachmentUploadWarning = '';

    try {
      console.log('📤 STEP 5: Uploading attachment content using HTTP/1.1...');
      const step5Response = await fetch(
        `${MSBC_BASE_URL}/companies(${companyAPIID})/attachments(parentId=${invoiceID},id=${attachmentID})/content`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'If-Match': etag,
            'Content-Type': 'application/octet-stream',
          },
          body: rfpBytes,
          client: http11Client,
        }
      );

      if (!step5Response.ok) {
        const errorText = await step5Response.text();
        console.warn('⚠️ STEP 5 failed but continuing:', errorText);
        attachmentUploadWarning = `Attachment upload warning (HTTP ${step5Response.status}): ${errorText}`;
      } else {
        console.log('✅ STEP 5: Attachment content uploaded successfully via HTTP/1.1');
      }
    } catch (step5Error) {
      console.warn('⚠️ STEP 5 failed with exception but continuing:', step5Error);
      attachmentUploadWarning = `Attachment upload warning: ${step5Error instanceof Error ? step5Error.message : String(step5Error)}`;
    }

    await supabaseClient
      .from('canvass_requests')
      .update({
        msbc_posting_status: 'Success',
        msbc_posting_date: new Date().toISOString(),
        msbc_invoice_id: invoiceID,
        msbc_error_message: attachmentUploadWarning || null,
        msbc_sync_status: 'synced',
        msbc_sync_date: new Date().toISOString(),
        msbc_sync_error: null,
      })
      .eq('id', canvassId);

    console.log('🎉 MSBC posting completed successfully!');

    console.log('📧 Sending email notifications...');
    const emailRecipients: string[] = [];

    if (canvass.requester?.email) {
      emailRecipients.push(canvass.requester.email);
    }

    if (canvass.company?.accounting_notification_email) {
      emailRecipients.push(canvass.company.accounting_notification_email);
    }

    const totalAmount = canvass.suppliers?.[canvass.recommended_quotation_index ?? 0]?.items?.reduce(
      (sum: number, item: any) => sum + parseFloat(item.amount || 0),
      0
    ) || 0;

    for (const recipient of emailRecipients) {
      try {
        const emailResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-approval-email`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: recipient,
            subject: `Canvass ${canvass.canvass_number} Posted to MSBC`,
            recipientName: recipient === canvass.requester?.email ? canvass.requester?.full_name : 'Accounting Team',
            requestType: 'Canvass Request',
            documentNo: canvass.canvass_number,
            requesterName: canvass.requester?.full_name || 'N/A',
            department: 'N/A',
            totalAmount: totalAmount,
            action: 'Posted to MSBC',
            actionBy: 'System',
            comments: `Invoice ID: ${invoiceID}`,
          }),
        });

        if (emailResponse.ok) {
          console.log(`✅ Email sent to ${recipient}`);
        } else {
          console.warn(`⚠️ Failed to send email to ${recipient}`);
        }
      } catch (emailError) {
        console.warn(`⚠️ Email notification error for ${recipient}:`, emailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Canvass posted to MSBC successfully',
        invoiceId: invoiceID,
        warning: attachmentUploadWarning || undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Error posting to MSBC:', error);

    if (canvassId) {
      try {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        await supabaseClient
          .from('canvass_requests')
          .update({
            msbc_posting_status: 'Failed',
            msbc_error_message: error instanceof Error ? error.message : String(error),
            msbc_sync_status: 'failed',
            msbc_sync_error: error instanceof Error ? error.message : String(error),
          })
          .eq('id', canvassId);
      } catch (dbError) {
        console.error('❌ Failed to update error status in DB:', dbError);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to post to MSBC',
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});