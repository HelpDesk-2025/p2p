import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';

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

    console.log('🚀 Starting MSBC posting for PR:', requestId);

    const { data: pr, error: prError } = await supabaseClient
      .from('purchase_requisitions')
      .select(`
        *,
        requester:user_profiles!requester_id(
          full_name,
          company:companies(id, name, api_id)
        )
      `)
      .eq('id', requestId)
      .single();

    if (prError || !pr) {
      throw new Error(`Failed to fetch PR: ${prError?.message}`);
    }

    console.log('📄 PR Data:', {
      document_no: pr.document_no,
      payee: pr.payee,
      amount: pr.amount_net_vat,
    });

    await supabaseClient
      .from('purchase_requisitions')
      .update({ msbc_posting_status: 'Pending' })
      .eq('id', requestId);

    const companyAPIID = pr.requester?.company?.api_id;
    if (!companyAPIID) {
      throw new Error('Company API ID not found');
    }

    const documentNumber = pr.document_no;
    const batchNumber = documentNumber.replace(/0+/g, '');
    const purchaseAmount = parseFloat(pr.amount_net_vat || 0);
    const dateNeeded = pr.date_required
      ? new Date(pr.date_required).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const vendorNumber = pr.payee_number || '';
    const description = (pr.description || '').substring(0, 70);
    const purpose = (pr.purpose || '').substring(0, 200);

    console.log('📊 Variables:', {
      companyAPIID,
      documentNumber,
      batchNumber,
      purchaseAmount,
      dateNeeded,
      vendorNumber,
      description,
      purpose,
    });

    if (!pr.rfp_pdf_path) {
      throw new Error('RFP PDF not found');
    }

    console.log('📥 Downloading RFP PDF from:', pr.rfp_pdf_path);
    const { data: rfpData, error: rfpDownloadError } = await supabaseClient.storage
      .from('attachments')
      .download(pr.rfp_pdf_path);

    if (rfpDownloadError || !rfpData) {
      throw new Error(`Failed to download RFP: ${rfpDownloadError?.message}`);
    }

    const rfpBytes = new Uint8Array(await rfpData.arrayBuffer());
    console.log('✅ RFP downloaded, size:', rfpBytes.length);

    const attachmentBlobs: Array<{ data: Uint8Array; type: string }> = [];

    if (pr.merged_pdf_path) {
      console.log('📥 Downloading attachments from:', pr.merged_pdf_path);
      const { data: attachData, error: attachError } = await supabaseClient.storage
        .from('attachments')
        .download(pr.merged_pdf_path);

      if (!attachError && attachData) {
        const attachBytes = new Uint8Array(await attachData.arrayBuffer());
        attachmentBlobs.push({ data: attachBytes, type: 'application/pdf' });
        console.log('✅ Attachments downloaded, size:', attachBytes.length);
      }
    }

    console.log('🔄 Merging RFP with attachments...');
    const mergedPdf = await PDFDocument.create();

    const rfpPdf = await PDFDocument.load(rfpBytes);
    const rfpPages = await mergedPdf.copyPages(rfpPdf, rfpPdf.getPageIndices());
    rfpPages.forEach((page) => mergedPdf.addPage(page));

    for (const attachment of attachmentBlobs) {
      if (attachment.type === 'application/pdf') {
        const pdf = await PDFDocument.load(attachment.data);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }
    }

    const mergedPdfBytes = await mergedPdf.save();
    const attachmentFileName = `RFP_and_Merged_Attachment_${documentNumber}.pdf`;
    console.log('✅ PDF merged, filename:', attachmentFileName);

    const mergedFilePath = `merged/${attachmentFileName}`;
    const { error: uploadError } = await supabaseClient.storage
      .from('attachments')
      .upload(mergedFilePath, mergedPdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.warn('⚠️ Failed to upload merged PDF:', uploadError);
    } else {
      await supabaseClient
        .from('purchase_requisitions')
        .update({ merged_rfp_attachment_path: mergedFilePath })
        .eq('id', requestId);
    }

    const basicAuth = btoa(`${MSBC_USERNAME}:${MSBC_PASSWORD}`);
    const headers = {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    };

    console.log('📤 STEP 1: Creating journal batch...');
    const step1Response = await fetch(
      `${MSBC_BASE_URL}/companies(${companyAPIID})/journalPurchases`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          TemplateName: 'PURCHASESB',
          code: batchNumber,
          displayName: `${dateNeeded} - ${description}`,
        }),
      }
    );

    if (!step1Response.ok) {
      const errorText = await step1Response.text();
      throw new Error(`STEP 1 failed (${step1Response.status}): ${errorText}`);
    }

    const firstPostBody = await step1Response.json();
    const parentID = firstPostBody.id;
    console.log('✅ STEP 1: Journal batch created, ID:', parentID);

    console.log('📤 STEP 4: Creating journal line...');
    const step4Response = await fetch(
      `${MSBC_BASE_URL}/companies(${companyAPIID})/journalPurchases(${parentID})/journalLinesPurch`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          TemplateName: 'PURCHASESB',
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
        body: mergedPdfBytes,
      }
    );

    if (!step13Response.ok) {
      const errorText = await step13Response.text();
      throw new Error(`STEP 13 failed (${step13Response.status}): ${errorText}`);
    }

    console.log('✅ STEP 13: Attachment content uploaded successfully');

    await supabaseClient
      .from('purchase_requisitions')
      .update({
        msbc_posting_status: 'Success',
        msbc_posting_date: new Date().toISOString(),
        msbc_journal_batch_id: parentID,
        msbc_error_message: null,
      })
      .eq('id', requestId);

    console.log('🎉 MSBC posting completed successfully!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Purchase Requisition posted to MSBC successfully',
        journalBatchId: parentID,
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
          .from('purchase_requisitions')
          .update({
            msbc_posting_status: 'Failed',
            msbc_error_message: error instanceof Error ? error.message : String(error),
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