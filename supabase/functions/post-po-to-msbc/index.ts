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

  let poId: string | null = null;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const body = await req.json();
    poId = body.poId;

    if (!poId) {
      return new Response(
        JSON.stringify({ error: 'poId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting MSBC posting for PO:', poId);

    // Fetch PO with company and linked PR
    const { data: po, error: poError } = await supabaseClient
      .from('purchase_orders')
      .select(`
        *,
        requester:user_profiles!requested_by(full_name, email),
        company:companies!company_id(id, name, api_id, accounting_notification_email),
        pr:purchase_requisitions!pr_id(description, purpose, document_no)
      `)
      .eq('id', poId)
      .single();

    if (poError || !po) {
      throw new Error(`Failed to fetch PO: ${poError?.message}`);
    }

    console.log('PO Data:', {
      po_number: po.po_number,
      vendor_id: po.vendor_id,
      total_amount: po.total_amount,
    });

    // Update status to Pending
    await supabaseClient
      .from('purchase_orders')
      .update({ msbc_posting_status: 'Pending', msbc_sync_status: 'syncing' })
      .eq('id', poId);

    const companyAPIID = po.company?.api_id;
    if (!companyAPIID) {
      throw new Error('Company API ID not found. Please ensure the PO has a company with a valid API ID configured.');
    }

    // Calculate Net Payable (total_amount includes VAT; subtract EWT)
    // Fetch items to calculate EWT
    const { data: poItems } = await supabaseClient
      .from('purchase_order_items')
      .select('total_price, ewt_amount')
      .eq('purchase_order_id', poId);

    const ewtTotal = (poItems || []).reduce((sum, item) => sum + (parseFloat(item.ewt_amount) || 0), 0);
    const netPayable = parseFloat(po.total_amount) - ewtTotal;

    const documentNumber = po.po_number;
    const batchNumber = documentNumber.replace(/^(PO)0+/, '$1');
    const vendorNumber = po.vendor_id || '';
    const description = (po.pr?.description || po.pr?.purpose || '').substring(0, 70);
    const purpose = (po.pr?.purpose || '').substring(0, 200);
    const dateNeeded = po.po_date
      ? new Date(po.po_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    console.log('Variables:', {
      companyAPIID,
      documentNumber,
      batchNumber,
      netPayable,
      dateNeeded,
      vendorNumber,
      description,
    });

    // Download the merged PDF
    const mergedPdfPath = po.merged_pdf_path;
    if (!mergedPdfPath) {
      throw new Error('No merged PDF found (merged_pdf_path required)');
    }

    console.log('Downloading merged PDF from:', mergedPdfPath);
    const { data: pdfData, error: pdfDownloadError } = await supabaseClient.storage
      .from('attachments')
      .download(mergedPdfPath);

    if (pdfDownloadError || !pdfData) {
      throw new Error(`Failed to download merged PDF: ${pdfDownloadError?.message}`);
    }

    const finalPdfBytes = new Uint8Array(await pdfData.arrayBuffer());
    console.log('PDF downloaded, size:', finalPdfBytes.length);

    const sanitizedDescription = description
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);

    const attachmentFileName = `PO_${documentNumber}_${sanitizedDescription}.pdf`;

    const basicAuth = btoa(`${MSBC_USERNAME}:${MSBC_PASSWORD}`);
    const headers = {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    };

    // STEP 1: Create journal batch
    console.log('STEP 1: Creating journal batch...');
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
    console.log('STEP 1: Journal batch created, ID:', parentID);

    // STEP 4: Create journal line
    console.log('STEP 4: Creating journal line...');
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
          amount: netPayable,
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
    console.log('STEP 4: Journal line created, ID:', parentLineID);

    // STEP 7: Create attachment record
    console.log('STEP 7: Creating attachment record...');
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
    console.log('STEP 7: Attachment record created, ID:', attachmentID);

    // STEP 10: Get attachment etag
    console.log('STEP 10: Getting attachment etag...');
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
    console.log('STEP 10: Got etag:', etag);

    // STEP 13: Upload attachment content
    let attachmentUploadWarning = '';

    try {
      console.log('STEP 13: Uploading attachment content with HTTP/1.1...');

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
        console.warn('STEP 13 failed but continuing:', errorText);
        attachmentUploadWarning = `Attachment upload warning: ${errorText}`;
      } else {
        console.log('STEP 13: Attachment content uploaded successfully');
      }
    } catch (step13Error) {
      console.warn('STEP 13 failed with exception but continuing:', step13Error);
      attachmentUploadWarning = `Attachment upload warning: ${step13Error instanceof Error ? step13Error.message : String(step13Error)}`;
    }

    // Update PO with success status
    await supabaseClient
      .from('purchase_orders')
      .update({
        msbc_posting_status: 'Success',
        msbc_posting_date: new Date().toISOString(),
        msbc_journal_batch_id: parentID,
        msbc_error_message: attachmentUploadWarning || null,
        msbc_sync_status: 'synced',
        msbc_sync_date: new Date().toISOString(),
        msbc_sync_error: null,
      })
      .eq('id', poId);

    console.log('MSBC posting completed successfully!');

    // Send email notifications
    const emailRecipients: string[] = [];
    if (po.requester?.email) emailRecipients.push(po.requester.email);
    if (po.company?.accounting_notification_email) emailRecipients.push(po.company.accounting_notification_email);

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
            subject: `P2P - Purchase Order ${po.po_number} Posted to MSBC`,
            recipientName: recipient === po.requester?.email ? po.requester?.full_name : 'Accounting Team',
            requestType: 'Purchase Order',
            documentNo: po.po_number,
            requesterName: po.requester?.full_name || 'N/A',
            department: po.department || 'N/A',
            totalAmount: netPayable,
            action: 'Posted to MSBC',
            actionBy: 'System',
            comments: `Journal Batch ID: ${parentID}`,
          }),
        });

        if (emailResponse.ok) {
          console.log(`Email sent to ${recipient}`);
        } else {
          console.warn(`Failed to send email to ${recipient}`);
        }
      } catch (emailError) {
        console.warn(`Email notification error for ${recipient}:`, emailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Purchase Order posted to MSBC successfully',
        journalBatchId: parentID,
        warning: attachmentUploadWarning || undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error posting PO to MSBC:', error);

    if (poId) {
      try {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        await supabaseClient
          .from('purchase_orders')
          .update({
            msbc_posting_status: 'Failed',
            msbc_error_message: error instanceof Error ? error.message : String(error),
            msbc_sync_status: 'failed',
            msbc_sync_error: error instanceof Error ? error.message : String(error),
          })
          .eq('id', poId);
      } catch (dbError) {
        console.error('Failed to update error status in DB:', dbError);
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
