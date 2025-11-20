import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabase } from './supabase';

interface PaymentModeLine {
  label: string;
  value: string;
}

interface ApprovalRecord {
  approver_name: string;
  approver_esig: string | null;
  approval_date: string;
  sequence: number;
}

interface RFPData {
  companyName: string;
  requestType: string;
  dateOfRequest: string;
  payee: string;
  purpose: string;
  dateNeeded: string;
  amount: number;
  budgeted: boolean;
  paymentMode: string;
  paymentModeLines: PaymentModeLine[];
  requestorName: string;
  requestorEsig: string | null;
  approvals: ApprovalRecord[];
}

export async function generateRFP(data: RFPData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  let yPosition = height - 80;

  // Helper function to draw text
  const drawText = (text: string, x: number, y: number, size = 10, isBold = false) => {
    page.drawText(text, {
      x,
      y,
      size,
      font: isBold ? boldFont : font,
      color: rgb(0, 0, 0),
    });
  };

  // Company Name (centered)
  const companyNameWidth = boldFont.widthOfTextAtSize(data.companyName, 16);
  drawText(data.companyName, (width - companyNameWidth) / 2, yPosition, 16, true);
  yPosition -= 30;

  // Request Type (centered)
  const locationText = data.requestType === 'Petty Cash' ? 'Taytay Rizal' : 'Taytay Rizal';
  const locationWidth = font.widthOfTextAtSize(locationText, 10);
  drawText(locationText, (width - locationWidth) / 2, yPosition, 10, false);
  yPosition -= 15;

  const rfpTitleWidth = boldFont.widthOfTextAtSize('REQUEST FOR PAYMENT', 12);
  drawText('REQUEST FOR PAYMENT', (width - rfpTitleWidth) / 2, yPosition, 12, true);
  yPosition -= 30;

  // Date (right aligned)
  const dateText = `DATE    ${data.dateOfRequest}`;
  const dateWidth = font.widthOfTextAtSize(dateText, 10);
  drawText(dateText, width - dateWidth - 50, yPosition, 10, false);
  yPosition -= 25;

  // Request Details
  const leftMargin = 90;
  const labelWidth = 130;

  drawText('PAYEE', leftMargin, yPosition, 10, true);
  drawText(data.payee, leftMargin + labelWidth, yPosition, 10, false);
  yPosition -= 20;

  drawText('PURPOSE', leftMargin, yPosition, 10, true);
  // Wrap purpose text if too long
  const maxPurposeWidth = width - leftMargin - labelWidth - 100;
  const purposeWords = data.purpose.split(' ');
  let currentLine = '';
  let purposeStartY = yPosition;

  for (const word of purposeWords) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const testWidth = font.widthOfTextAtSize(testLine, 10);

    if (testWidth > maxPurposeWidth && currentLine) {
      drawText(currentLine, leftMargin + labelWidth, yPosition, 10, false);
      yPosition -= 15;
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    drawText(currentLine, leftMargin + labelWidth, yPosition, 10, false);
  }
  yPosition -= 25;

  drawText('DATE NEEDED', leftMargin, yPosition, 10, true);
  drawText(data.dateNeeded, leftMargin + labelWidth, yPosition, 10, false);
  yPosition -= 20;

  drawText('AMOUNT', leftMargin, yPosition, 10, true);
  drawText(data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), leftMargin + labelWidth, yPosition, 10, false);
  yPosition -= 20;

  drawText('BUDGETED', leftMargin, yPosition, 10, true);
  drawText(data.budgeted ? 'Yes' : 'No', leftMargin + labelWidth, yPosition, 10, false);
  yPosition -= 20;

  drawText('MODE OF PAYMENT', leftMargin, yPosition, 10, true);
  drawText(data.paymentMode, leftMargin + labelWidth, yPosition, 10, false);
  yPosition -= 20;

  // Payment Mode Lines
  for (const line of data.paymentModeLines) {
    drawText(line.label, leftMargin, yPosition, 10, false);
    drawText(line.value, leftMargin + labelWidth, yPosition, 10, false);
    yPosition -= 15;
  }
  yPosition -= 20;

  // Requested By section
  drawText('REQUESTED BY', leftMargin, yPosition, 10, true);
  yPosition -= 10;

  // Add e-signature if available
  if (data.requestorEsig) {
    try {
      const esigData = data.requestorEsig.split(',')[1] || data.requestorEsig;
      const esigBytes = Uint8Array.from(atob(esigData), c => c.charCodeAt(0));
      const esigImage = await pdfDoc.embedPng(esigBytes);
      const esigDims = esigImage.scale(0.15);
      page.drawImage(esigImage, {
        x: leftMargin + 20,
        y: yPosition - esigDims.height,
        width: esigDims.width,
        height: esigDims.height,
      });
    } catch (error) {
      console.error('Error embedding requestor signature:', error);
    }
  }
  yPosition -= 40;

  drawText(data.requestorName, leftMargin, yPosition, 10, false);
  yPosition -= 15;
  drawText(data.dateOfRequest, leftMargin, yPosition, 10, false);
  yPosition -= 30;

  // Approvals section
  const totalApprovals = data.approvals.length;

  if (totalApprovals === 1) {
    // Single approver - APPROVED BY
    const approval = data.approvals[0];
    drawText('APPROVED BY', leftMargin, yPosition, 10, true);
    yPosition -= 10;

    if (approval.approver_esig) {
      try {
        const esigData = approval.approver_esig.split(',')[1] || approval.approver_esig;
        const esigBytes = Uint8Array.from(atob(esigData), c => c.charCodeAt(0));
        const esigImage = await pdfDoc.embedPng(esigBytes);
        const esigDims = esigImage.scale(0.15);
        page.drawImage(esigImage, {
          x: leftMargin + 20,
          y: yPosition - esigDims.height,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding approver signature:', error);
      }
    }
    yPosition -= 40;

    drawText(approval.approver_name, leftMargin, yPosition, 10, false);
    yPosition -= 15;
    drawText(approval.approval_date, leftMargin, yPosition, 10, false);
  } else if (totalApprovals > 1) {
    // Multiple approvers - split into recommending and final approval
    const recommendingApprovers = data.approvals.slice(0, -1);
    const finalApprover = data.approvals[data.approvals.length - 1];

    // Recommending Approval(s) on the left
    let leftY = yPosition;
    drawText('RECOMMENDING APPROVAL', leftMargin, leftY, 10, true);
    leftY -= 20;

    for (const approval of recommendingApprovers) {
      if (approval.approver_esig) {
        try {
          const esigData = approval.approver_esig.split(',')[1] || approval.approver_esig;
          const esigBytes = Uint8Array.from(atob(esigData), c => c.charCodeAt(0));
          const esigImage = await pdfDoc.embedPng(esigBytes);
          const esigDims = esigImage.scale(0.15);
          page.drawImage(esigImage, {
            x: leftMargin + 20,
            y: leftY - esigDims.height,
            width: esigDims.width,
            height: esigDims.height,
          });
        } catch (error) {
          console.error('Error embedding recommending approver signature:', error);
        }
      }
      leftY -= 40;

      drawText(approval.approver_name, leftMargin, leftY, 10, false);
      leftY -= 15;
      drawText(approval.approval_date, leftMargin, leftY, 10, false);
      leftY -= 30;
    }

    // Final Approval on the right
    const rightMargin = width / 2 + 50;
    let rightY = yPosition;
    drawText('APPROVED BY', rightMargin, rightY, 10, true);
    rightY -= 20;

    if (finalApprover.approver_esig) {
      try {
        const esigData = finalApprover.approver_esig.split(',')[1] || finalApprover.approver_esig;
        const esigBytes = Uint8Array.from(atob(esigData), c => c.charCodeAt(0));
        const esigImage = await pdfDoc.embedPng(esigBytes);
        const esigDims = esigImage.scale(0.15);
        page.drawImage(esigImage, {
          x: rightMargin + 20,
          y: rightY - esigDims.height,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding final approver signature:', error);
      }
    }
    rightY -= 40;

    drawText(finalApprover.approver_name, rightMargin, rightY, 10, false);
    rightY -= 15;
    drawText(finalApprover.approval_date, rightMargin, rightY, 10, false);

    yPosition = Math.min(leftY, rightY);
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

export async function generateAndUploadRFP(
  requestType: 'petty_cash' | 'reimbursement' | 'purchase_requisition',
  requestId: string,
  requestNumber: string
): Promise<string> {
  try {
    console.log('Starting RFP generation for:', { requestType, requestId, requestNumber });

    // Fetch request data
    const tableName = requestType === 'purchase_requisition' ? 'purchase_requisitions' :
                      requestType === 'petty_cash' ? 'petty_cash_requests' : 'reimbursement_requests';

    // Different query for PR vs others (PR doesn't have company_id directly)
    const selectQuery = requestType === 'purchase_requisition'
      ? `
        *,
        requester:user_profiles!requester_id(full_name, e_sig, company:companies(name)),
        payment_mode:payment_modes!payment_mode_id(mode_name, line_names)
      `
      : `
        *,
        requester:user_profiles!requester_id(full_name, e_sig),
        company:companies!company_id(name),
        payment_mode:payment_modes!payment_mode_id(mode_name, line_names)
      `;

    const { data: request, error: requestError } = await supabase
      .from(tableName)
      .select(selectQuery)
      .eq('id', requestId)
      .single();

    if (requestError) {
      console.error('Error fetching request:', requestError);
      throw requestError;
    }
    if (!request) throw new Error('Request not found');

    console.log('Request data fetched:', request);

    // Fetch approval records
    const requestTypeName = requestType === 'purchase_requisition' ? 'Purchase Requisition' :
                           requestType === 'petty_cash' ? 'Petty Cash' : 'Reimbursement';

    const { data: approvals, error: approvalsError } = await supabase
      .from('approval_ledger')
      .select(`
        approval_date,
        sequence,
        approver:user_profiles!approver_id(full_name, e_sig)
      `)
      .eq('request_id', requestId)
      .eq('request_type', requestTypeName)
      .eq('action', 'Approved')
      .order('sequence', { ascending: true });

    if (approvalsError) {
      console.error('Error fetching approvals:', approvalsError);
      throw approvalsError;
    }

    console.log('Approvals fetched:', approvals);

    // Format payment mode lines
    const paymentModeLines: PaymentModeLine[] = [];

    // For PR, use payment_mode_lines if available
    if (requestType === 'purchase_requisition' && request.payment_mode_lines && Array.isArray(request.payment_mode_lines)) {
      paymentModeLines.push(...request.payment_mode_lines);
    } else if (request.payment_mode?.line_names && Array.isArray(request.payment_mode.line_names)) {
      for (const lineName of request.payment_mode.line_names) {
        paymentModeLines.push({
          label: lineName,
          value: '' // Values would come from request data if stored
        });
      }
    }

    // Prepare RFP data - handle different field names between PR and others
    const rfpData: RFPData = {
      companyName: requestType === 'purchase_requisition'
        ? (request.requester?.company?.name || 'Company Name')
        : (request.company?.name || 'Company Name'),
      requestType: requestType === 'purchase_requisition' ? 'Purchase Requisition' :
                   requestType === 'petty_cash' ? 'Petty Cash' : 'Reimbursement',
      dateOfRequest: new Date(request.request_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }),
      payee: request.payee || '',
      purpose: request.purpose || request.description || '',
      dateNeeded: (request.date_needed || request.date_required || request.required_date)
        ? new Date(request.date_needed || request.date_required || request.required_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          })
        : '',
      amount: parseFloat(request.amount || request.total_amount || request.amount_net_vat) || 0,
      budgeted: requestType === 'purchase_requisition' ? (request.is_budgeted !== false) : (request.budgeted !== false),
      paymentMode: request.payment_mode?.mode_name || '',
      paymentModeLines,
      requestorName: request.requester?.full_name || '',
      requestorEsig: request.requester?.e_sig || null,
      approvals: (approvals || []).map((a: any) => ({
        approver_name: a.approver?.full_name || '',
        approver_esig: a.approver?.e_sig || null,
        approval_date: new Date(a.approval_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }),
        sequence: a.sequence
      }))
    };

    // Generate PDF
    console.log('Generating PDF with data:', rfpData);
    const pdfBytes = await generateRFP(rfpData);
    console.log('PDF generated, size:', pdfBytes.length);

    // Upload to storage
    const fileName = `rfp_${requestNumber}_${Date.now()}.pdf`;
    const filePath = `rfp/${fileName}`;

    console.log('Uploading PDF to:', filePath);
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    console.log('PDF uploaded successfully');

    // Update request with RFP path
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ rfp_pdf_path: filePath })
      .eq('id', requestId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw updateError;
    }

    console.log('Request updated with RFP path:', filePath);

    return filePath;
  } catch (error) {
    console.error('Error generating RFP:', error);
    throw error;
  }
}
