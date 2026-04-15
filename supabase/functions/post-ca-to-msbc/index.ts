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

    console.log('🚀 Starting MSBC posting for Cash Advance:', requestId);

    const { data: ca, error: caError } = await supabaseClient
      .from('cash_advance_requests')
      .select(`
        *,
        requester:user_profiles!requester_id(full_name, email),
        company:companies!company_id(id, name, api_id, accounting_notification_email)
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

    const companyAPIID = ca.company?.api_id;
    if (!companyAPIID) {
      throw new Error('Company API ID not found. Please ensure the cash advance request has a company with a valid API ID configured.');
    }

    const documentNumber = ca.ca_number;
    const batchNumber = documentNumber.replace(/^(CA)0+/, '$1');
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

    const rfpPath = ca.rfp_pdf_path;
    const approvedCaPdfPath = ca.approved_ca_pdf_path;
    const attachmentsPdfPath = ca.attachments_pdf_path;

    if (!rfpPath && !approvedCaPdfPath && !attachmentsPdfPath) {
      throw new Error('No PDF found (rfp_pdf_path, approved_ca_pdf_path, or attachments_pdf_path required)');
    }

    const pdfParts: Uint8Array[] = [];

    if (!rfpPath && approvedCaPdfPath) {
      console.log('📥 No separate RFP path - approved_ca_pdf_path is the complete merged document');
      const { data: caFormData, error: caFormDownloadError } = await supabaseClient.storage
        .from('attachments')
        .download(approvedCaPdfPath);

      if (caFormDownloadError || !caFormData) {
        throw new Error(`Failed to download merged PDF: ${caFormDownloadError?.message}`);
      }
      pdfParts.push(new Uint8Array(await caFormData.arrayBuffer()));
      console.log('✅ Complete merged PDF downloaded, size:', pdfParts[pdfParts.length - 1].length);
    } else {
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

      if (approvedCaPdfPath) {
        console.log('📥 Downloading approved CA form PDF from:', approvedCaPdfPath);
        const { data: caFormData, error: caFormDownloadError } = await supabaseClient.storage
          .from('attachments')
          .download(approvedCaPdfPath);

        if (caFormDownloadError || !caFormData) {
          console.warn('⚠️ Failed to download CA form PDF, continuing without it:', caFormDownloadError?.message);
        } else {
          pdfParts.push(new Uint8Array(await caFormData.arrayBuffer()));
          console.log('✅ CA form PDF downloaded, size:', pdfParts[pdfParts.length - 1].length);
        }
      }

      if (attachmentsPdfPath) {
        console.log('📥 Downloading uploaded attachments PDF from:', attachmentsPdfPath);
        const { data: attachData, error: attachDownloadError } = await supabaseClient.storage
          .from('attachments')
          .download(attachmentsPdfPath);

        if (attachDownloadError || !attachData) {
          console.warn('⚠️ Failed to download attachments PDF, continuing without it:', attachDownloadError?.message);
        } else {
          pdfParts.push(new Uint8Array(await attachData.arrayBuffer()));
          console.log('✅ Attachments PDF downloaded, size:', pdfParts[pdfParts.length - 1].length);
        }
      }
    }

    let finalPdfBytes: Uint8Array;
    if (pdfParts.length > 1) {
      console.log('🔀 Merging PDFs...');
      finalPdfBytes = await mergePDFs(pdfParts);
      console.log('✅ PDFs merged, final size:', finalPdfBytes.length);
    } else {
      finalPdfBytes = pdfParts[0];
      console.log('✅ Using single PDF, size:', finalPdfBytes.length);
    }

    const attachmentFileName = `${documentNumber}_RFP&CA_FORM.pdf`;
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
          displayName: `${dateNeeded} - ${purpose}`,
        }),
      }
    );

    if (!step1Response.ok) {
      const errorText = await step1Response.text();
      throw new Error(`STEP 1 failed (${step1Response.status}): ${errorText}`);
    }

    const parentJournal = await step1Response.json();
    const parentID = parentJournal.id;
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
          CVPostingGroup: 'ASL',
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

    const attachmentRecord = await step7Response.json();
    const attachmentID = attachmentRecord.id;
    const etag = step7Response.headers.get('ETag') || '*';
    console.log('✅ STEP 7: Attachment record created, ID:', attachmentID, 'ETag:', etag);

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
      .from('cash_advance_requests')
      .update({
        msbc_sync_status: 'synced',
        msbc_sync_date: new Date().toISOString(),
        msbc_journal_id: parentID,
        msbc_sync_error: null,
      })
      .eq('id', requestId);

    console.log('🎉 MSBC posting completed successfully!');

    console.log('📧 Sending email notifications...');
    const emailRecipients: string[] = [];

    if (ca.requester?.email) {
      emailRecipients.push(ca.requester.email);
    }

    if (ca.company?.accounting_notification_email) {
      emailRecipients.push(ca.company.accounting_notification_email);
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
            subject: `P2P - Cash Advance ${ca.ca_number} Posted to MSBC`,
            recipientName: recipient === ca.requester?.email ? ca.requester?.full_name : 'Accounting Team',
            requestType: 'Cash Advance',
            documentNo: ca.ca_number,
            requesterName: ca.requester?.full_name || 'N/A',
            department: ca.department || 'N/A',
            totalAmount: parseFloat(ca.amount || 0),
            action: 'Posted to MSBC',
            actionBy: 'System',
            comments: `Journal ID: ${parentID}`,
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
        message: 'Cash Advance posted to MSBC successfully',
        journalId: parentID,
        journalLineId: parentLineID,
        attachmentId: attachmentID,
        warning: attachmentUploadWarning || null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Error posting to MSBC:', error);

    if (requestId) {
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
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
