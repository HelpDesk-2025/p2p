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

async function mergePDFs(pdfByteArrays: Uint8Array[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();
  for (const pdfBytes of pdfByteArrays) {
    try {
      const pdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    } catch (error) {
      console.warn('Error loading PDF for merge:', error);
    }
  }
  return await mergedPdf.save();
}

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

    console.log('🚀 Starting MSBC posting for Reimbursement:', requestId);

    const { data: reimb, error: reimbError } = await supabaseClient
      .from('reimbursement_requests')
      .select(`
        *,
        requester:user_profiles!requester_id(full_name, email),
        company:companies!company_id(id, name, api_id, accounting_notification_email),
        payment_mode:payment_modes!payment_mode_id(mode_name)
      `)
      .eq('id', requestId)
      .single();

    if (reimbError || !reimb) {
      throw new Error(`Failed to fetch Reimbursement request: ${reimbError?.message}`);
    }

    if (reimb.request_type !== 'Reimbursement') {
      throw new Error('This function only handles Reimbursement type requests. Use post-liquidation-to-msbc for Liquidation type.');
    }

    if (reimb.status !== 'approved') {
      throw new Error('Request must be fully approved before posting to MSBC.');
    }

    console.log('📄 Reimbursement Data:', {
      reimb_number: reimb.reimb_number,
      payee: reimb.payee,
      amount: reimb.amount,
    });

    await supabaseClient
      .from('reimbursement_requests')
      .update({ msbc_posting_status: 'Pending' })
      .eq('id', requestId);

    const companyAPIID = reimb.company?.api_id;
    if (!companyAPIID) {
      throw new Error('Company API ID not found. Please ensure the request has a company with a valid API ID configured.');
    }

    const documentNumber = reimb.reimb_number;
    const batchNumber = documentNumber.replace(/^([A-Za-z]+)0+/, '$1');
    const purchaseAmount = parseFloat(reimb.amount || 0);
    const dateNeeded = reimb.date_needed
      ? new Date(reimb.date_needed).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const vendorNumber = reimb.payee_number || '';
    const purpose = (reimb.purpose || '').substring(0, 200);
    const paymentModeName = reimb.payment_mode?.mode_name || '';
    const paymentModeLines = reimb.payment_mode_lines || [];

    console.log('📊 Variables:', {
      companyAPIID,
      documentNumber,
      batchNumber,
      purchaseAmount,
      dateNeeded,
      vendorNumber,
      purpose,
      paymentModeName,
    });

    // Download and merge Reimbursement Form + Attachments + RFP PDFs
    const rfpPath = reimb.rfp_pdf_path;
    const reimbFormPath = reimb.reimbursement_form_pdf_path;

    if (!rfpPath) {
      throw new Error('No RFP PDF found. Please generate the RFP before posting to MSBC.');
    }

    if (!reimbFormPath) {
      throw new Error('No Reimbursement Form PDF found. Please generate the Reimbursement Form before posting to MSBC.');
    }

    const pdfParts: Uint8Array[] = [];

    // 1. RFP first
    console.log('📥 Downloading RFP PDF from:', rfpPath);
    const { data: rfpData, error: rfpDownloadError } = await supabaseClient.storage
      .from('attachments')
      .download(rfpPath);

    if (rfpDownloadError || !rfpData) {
      throw new Error(`Failed to download RFP PDF: ${rfpDownloadError?.message}`);
    }
    pdfParts.push(new Uint8Array(await rfpData.arrayBuffer()));
    console.log('✅ RFP PDF downloaded, size:', pdfParts[pdfParts.length - 1].length);

    // 2. Reimbursement Form
    console.log('📥 Downloading Reimbursement Form PDF from:', reimbFormPath);
    const { data: formData, error: formDownloadError } = await supabaseClient.storage
      .from('attachments')
      .download(reimbFormPath);

    if (formDownloadError || !formData) {
      throw new Error(`Failed to download Reimbursement Form PDF: ${formDownloadError?.message}`);
    }
    pdfParts.push(new Uint8Array(await formData.arrayBuffer()));
    console.log('✅ Reimbursement Form PDF downloaded, size:', pdfParts[pdfParts.length - 1].length);

    // 3. User attachments (merged_pdf_path) if available
    const mergedAttachmentsPath = reimb.merged_pdf_path;
    if (mergedAttachmentsPath) {
      console.log('📥 Downloading user attachments PDF from:', mergedAttachmentsPath);
      const { data: attachData, error: attachDownloadError } = await supabaseClient.storage
        .from('attachments')
        .download(mergedAttachmentsPath);

      if (attachDownloadError || !attachData) {
        console.warn('⚠️ Failed to download user attachments PDF, continuing without:', attachDownloadError?.message);
      } else {
        pdfParts.push(new Uint8Array(await attachData.arrayBuffer()));
        console.log('✅ User attachments PDF downloaded, size:', pdfParts[pdfParts.length - 1].length);
      }
    }

    // Merge all PDFs: RFP + Reimbursement Form + Attachments
    console.log('🔀 Merging RFP + Reimbursement Form + Attachments PDFs...');
    const finalPdfBytes = await mergePDFs(pdfParts);
    console.log('✅ PDFs merged, final size:', finalPdfBytes.length);

    const attachmentFileName = `RFP_REIMB_${documentNumber}.pdf`;
    console.log('✅ PDF ready, filename:', attachmentFileName);

    const basicAuth = btoa(`${MSBC_USERNAME}:${MSBC_PASSWORD}`);
    const headers = {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    };

    // STEP 1: Create journal batch in Purchase Journal (same as PR)
    console.log('📤 STEP 1: Creating journal batch...');
    const step1Response = await fetch(
      `${MSBC_BASE_URL}/companies(${companyAPIID})/journalPurchases`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          TemplateName: 'PURCHASESB',
          code: batchNumber,
          displayName: `${dateNeeded} - ${purpose.substring(0, 70)}`,
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

    // STEP 4: Create journal line
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
          comment: purpose.substring(0, 70),
          description: paymentModeName ? `${paymentModeName}` : '',
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

    // STEP 7: Create attachment record
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

    // STEP 10: Get attachment etag
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

    // STEP 13: Upload attachment content
    let attachmentUploadWarning = '';

    try {
      console.log('📤 STEP 13: Uploading attachment content with HTTP/1.1...');

      const http1Client = Deno.createHttpClient({
        alpnProtocols: ['http/1.1'],
      });

      const step13Response = await fetch(
        `${MSBC_BASE_URL}/companies(${companyAPIID})/attachments(parentId=${parentLineID},id=${attachmentID})/content`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'If-Match': etag,
            'Content-Type': 'application/octet-stream',
          },
          body: finalPdfBytes,
          client: http1Client,
        }
      );

      http1Client.close();

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

    // Update status to Success
    await supabaseClient
      .from('reimbursement_requests')
      .update({
        msbc_posting_status: 'Success',
        msbc_posting_date: new Date().toISOString(),
        msbc_journal_batch_id: parentID,
        msbc_error_message: attachmentUploadWarning || null,
      })
      .eq('id', requestId);

    console.log('🎉 MSBC posting completed successfully!');

    // Send email notifications
    console.log('📧 Sending email notifications...');
    const emailRecipients: string[] = [];

    if (reimb.requester?.email) {
      emailRecipients.push(reimb.requester.email);
    }

    if (reimb.company?.accounting_notification_email) {
      emailRecipients.push(reimb.company.accounting_notification_email);
    }

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
            subject: `P2P - Reimbursement ${reimb.reimb_number} Posted to MSBC`,
            recipientName: recipient === reimb.requester?.email ? reimb.requester?.full_name : 'Accounting Team',
            requestType: 'Reimbursement',
            documentNo: reimb.reimb_number,
            requesterName: reimb.requester?.full_name || 'N/A',
            department: reimb.department || 'N/A',
            totalAmount: purchaseAmount,
            action: 'Posted to MSBC (Purchase Journal)',
            actionBy: 'System',
            comments: `Journal Batch ID: ${parentID}`,
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
        message: 'Reimbursement posted to MSBC Purchase Journal successfully',
        journalBatchId: parentID,
        warning: attachmentUploadWarning || undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Error posting Reimbursement to MSBC:', error);

    if (requestId) {
      try {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        await supabaseClient
          .from('reimbursement_requests')
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
        error: 'Failed to post Reimbursement to MSBC',
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
