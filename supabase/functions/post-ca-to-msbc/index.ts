import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const MSBC_USERNAME = 'SJGIPA';
const MSBC_PASSWORD = 'Superteams2025';
const MSBC_BASE_URL = 'https://st-joseph-group.com:7048/BC140/api/beta';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  let requestId: string | null = null;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const body = await req.json();
    requestId = body.requestId;

    if (!requestId) {
      return new Response(
        JSON.stringify({ error: 'Request ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🚀 Starting MSBC posting for Cash Advance:', requestId);

    const { data: ca, error: caError } = await supabaseClient
      .from('cash_advance_requests')
      .select(`
        *,
        requester:user_profiles!requester_id(
          full_name,
          company:companies(id, name, api_id)
        )
      `)
      .eq('id', requestId)
      .single();

    if (caError || !ca) {
      throw new Error(`Failed to fetch Cash Advance: ${caError?.message}`);
    }

    console.log('📄 Cash Advance Data:', {
      ca_number: ca.ca_number,
      payee: ca.payee,
      amount: ca.amount,
    });

    await supabaseClient
      .from('cash_advance_requests')
      .update({ msbc_sync_status: 'syncing' })
      .eq('id', requestId);

    const companyAPIID = ca.requester?.company?.api_id;
    if (!companyAPIID) {
      throw new Error('Company API ID not found');
    }

    const documentNumber = ca.ca_number;
    const batchNumber = documentNumber.replace(/0+/g, '');
    const purchaseAmount = parseFloat(ca.amount || 0);
    const dateNeeded = ca.date_needed
      ? new Date(ca.date_needed).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const vendorNumber = ca.payee_number || '';
    const purpose = (ca.purpose || '').substring(0, 70);

    console.log('📊 Variables:', {
      companyAPIID,
      documentNumber,
      batchNumber,
      purchaseAmount,
      dateNeeded,
      vendorNumber,
      purpose,
    });

    if (!ca.approved_ca_pdf_path) {
      throw new Error('Approved Cash Advance PDF not found');
    }

    console.log('📥 Downloading Approved CA PDF from:', ca.approved_ca_pdf_path);
    const { data: pdfData, error: pdfDownloadError } = await supabaseClient.storage
      .from('attachments')
      .download(ca.approved_ca_pdf_path);

    if (pdfDownloadError || !pdfData) {
      throw new Error(`Failed to download PDF: ${pdfDownloadError?.message}`);
    }

    const pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
    const attachmentFileName = `${documentNumber}_Approved_Form.pdf`;
    console.log('✅ PDF downloaded, size:', pdfBytes.length);

    const basicAuth = btoa(`${MSBC_USERNAME}:${MSBC_PASSWORD}`);
    const headers = {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    };

    console.log('📤 STEP 1: Creating journal payment batch...');
    const step1Response = await fetch(
      `${MSBC_BASE_URL}/companies(${companyAPIID})/journalPayments`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          TemplateName: 'PAYMENTSB',
          code: batchNumber,
          displayName: `${dateNeeded} - ${purpose}`,
        }),
      }
    );

    if (!step1Response.ok) {
      const errorText = await step1Response.text();
      throw new Error(`STEP 1 failed (${step1Response.status}): ${errorText}`);
    }

    const firstPostBody = await step1Response.json();
    const parentID = firstPostBody.id;
    console.log('✅ STEP 1: Journal payment batch created, ID:', parentID);

    console.log('📤 STEP 4: Creating journal line...');
    const step4Response = await fetch(
      `${MSBC_BASE_URL}/companies(${companyAPIID})/journalPayments(${parentID})/journalLinesPayments`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          TemplateName: 'PAYMENTSB',
          AccountType: 'Vendor',
          accountNumber: vendorNumber,
          postingDate: dateNeeded,
          externalDocumentNumber: documentNumber,
          amount: purchaseAmount,
          comment: purpose,
        }),
      }
    );

    if (!step4Response.ok) {
      const errorText = await step4Response.text();
      throw new Error(`STEP 4 failed (${step4Response.status}): ${errorText}`);
    }

    const secondPostBody = await step4Response.json();
    const parentLineID = secondPostBody.id;
    console.log('✅ STEP 4: Journal line created, ID:', parentLineID);

    console.log('📤 STEP 7: Creating attachment record...');
    const step7Response = await fetch(
      `${MSBC_BASE_URL}/companies(${companyAPIID})/attachments`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          parentId: parentLineID,
          fileName: attachmentFileName,
        }),
      }
    );

    if (!step7Response.ok) {
      const errorText = await step7Response.text();
      throw new Error(`STEP 7 failed (${step7Response.status}): ${errorText}`);
    }

    const thirdPostBody = await step7Response.json();
    const attachmentID = thirdPostBody.id;
    console.log('✅ STEP 7: Attachment record created, ID:', attachmentID);

    console.log('📤 STEP 10: Getting attachment etag...');
    const step10Response = await fetch(
      `${MSBC_BASE_URL}/companies(${companyAPIID})/attachments(parentId=${parentLineID},id=${attachmentID})`,
      { method: 'GET', headers }
    );

    if (!step10Response.ok) {
      const errorText = await step10Response.text();
      throw new Error(`STEP 10 failed (${step10Response.status}): ${errorText}`);
    }

    const firstGetBody = await step10Response.json();
    const etag = firstGetBody['@odata.etag'];
    console.log('✅ STEP 10: Got etag:', etag);

    let attachmentUploadWarning = '';

    try {
      console.log('📤 STEP 13: Uploading attachment content...');
      const step13Response = await fetch(
        `${MSBC_BASE_URL}/companies(${companyAPIID})/attachments(parentId=${parentLineID},id=${attachmentID})/content`,
        {
          method: 'PATCH',
          headers: {
            ...headers,
            'If-Match': etag,
            'Content-Type': 'application/octet-stream',
          },
          body: pdfBytes,
        }
      );

      if (!step13Response.ok) {
        const errorText = await step13Response.text();
        console.warn('⚠️ STEP 13 failed but continuing:', errorText);
        attachmentUploadWarning = `Attachment upload warning: ${errorText}`;
      } else {
        console.log('✅ STEP 13: Attachment content uploaded successfully');
      }
    } catch (step13Error) {
      console.warn('⚠️ STEP 13 failed with exception but continuing:', step13Error);
      attachmentUploadWarning = `Attachment upload warning: ${step13Error instanceof Error ? step13Error.message : String(step13Error)}`;
    }

    await supabaseClient
      .from('cash_advance_requests')
      .update({
        msbc_sync_status: 'synced',
        msbc_sync_date: new Date().toISOString(),
        msbc_journal_id: parentID,
        msbc_sync_error: attachmentUploadWarning || null,
      })
      .eq('id', requestId);

    console.log('🎉 MSBC posting completed successfully!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cash Advance posted to MSBC successfully',
        journalId: parentID,
        warning: attachmentUploadWarning || undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Error posting to MSBC:', error);

    if (requestId) {
      try {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        await supabaseClient
          .from('cash_advance_requests')
          .update({
            msbc_sync_status: 'failed',
            msbc_sync_error: error instanceof Error ? error.message : String(error),
          })
          .eq('id', requestId);
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