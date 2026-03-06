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

    console.log('🚀 Starting MSBC posting for PR:', requestId);

    const { data: pr, error: prError } = await supabaseClient
      .from('purchase_requisitions')
      .select(`
        *,
        requester:user_profiles!requester_id(full_name, email),
        company:companies!company_id(id, name, api_id, accounting_notification_email)
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

    const companyAPIID = pr.company?.api_id;
    if (!companyAPIID) {
      throw new Error('Company API ID not found. Please ensure the purchase requisition has a company with a valid API ID configured.');
    }

    const documentNumber = pr.document_no;
    const batchNumber = documentNumber.replace(/^(PR)0+/, '$1');
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

    const rfpPath = pr.rfp_pdf_path;
    const mergedAttachmentsPath = pr.merged_pdf_path;

    if (!rfpPath && !mergedAttachmentsPath) {
      throw new Error('No PDF found (rfp_pdf_path or merged_pdf_path required)');
    }

    const pdfParts: Uint8Array[] = [];

    if (rfpPath) {
      console.log('📥 Downloading RFP PDF from:', rfpPath);
      const { data: rfpData, error: rfpDownloadError } = await supabaseClient.storage
        .from('attachments')
        .download(rfpPath);

      if (rfpDownloadError || !rfpData) {
        throw new Error(`Failed to download RFP PDF: ${rfpDownloadError?.message}`);
      }
      pdfParts.push(new Uint8Array(await rfpData.arrayBuffer()));
      console.log('✅ RFP PDF downloaded, size:', pdfParts[pdfParts.length - 1].length);
    }

    if (mergedAttachmentsPath) {
      console.log('📥 Downloading merged attachments PDF from:', mergedAttachmentsPath);
      const { data: attachData, error: attachDownloadError } = await supabaseClient.storage
        .from('attachments')
        .download(mergedAttachmentsPath);

      if (attachDownloadError || !attachData) {
        console.warn('⚠️ Failed to download merged attachments PDF, continuing without it:', attachDownloadError?.message);
      } else {
        pdfParts.push(new Uint8Array(await attachData.arrayBuffer()));
        console.log('✅ Merged attachments PDF downloaded, size:', pdfParts[pdfParts.length - 1].length);
      }
    }

    let finalPdfBytes: Uint8Array;
    if (pdfParts.length > 1) {
      console.log('🔀 Merging RFP + attachments PDFs...');
      finalPdfBytes = await mergePDFs(pdfParts);
      console.log('✅ PDFs merged, final size:', finalPdfBytes.length);
    } else {
      finalPdfBytes = pdfParts[0];
      console.log('✅ Using single PDF, size:', finalPdfBytes.length);
    }

    const sanitizedDescription = description
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);

    const attachmentFileName = `RFP_${documentNumber}_${sanitizedDescription}.pdf`;
    console.log('✅ PDF ready, filename:', attachmentFileName);

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

    await supabaseClient
      .from('purchase_requisitions')
      .update({
        msbc_posting_status: 'Success',
        msbc_posting_date: new Date().toISOString(),
        msbc_journal_batch_id: parentID,
        msbc_error_message: attachmentUploadWarning || null,
      })
      .eq('id', requestId);

    console.log('🎉 MSBC posting completed successfully!');

    console.log('📧 Sending email notifications...');
    const emailRecipients: string[] = [];

    if (pr.requester?.email) {
      emailRecipients.push(pr.requester.email);
    }

    if (pr.company?.accounting_notification_email) {
      emailRecipients.push(pr.company.accounting_notification_email);
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
            subject: `Purchase Requisition ${pr.document_no} Posted to MSBC`,
            recipientName: recipient === pr.requester?.email ? pr.requester?.full_name : 'Accounting Team',
            requestType: 'Purchase Requisition',
            documentNo: pr.document_no,
            requesterName: pr.requester?.full_name || 'N/A',
            department: pr.department || 'N/A',
            totalAmount: parseFloat(pr.amount_net_vat || 0),
            action: 'Posted to MSBC',
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
        message: 'Purchase Requisition posted to MSBC successfully',
        journalBatchId: parentID,
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
