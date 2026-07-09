import { PDFDocument, rgb, StandardFonts, PDFImage } from 'pdf-lib';

async function embedSignatureImage(pdfDoc: PDFDocument, esigData: string): Promise<PDFImage> {
  const mimeMatch = esigData.match(/^data:(image\/[a-zA-Z+]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : 'image/png';
  const base64 = esigData.split(',')[1] || esigData;
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return pdfDoc.embedJpg(bytes);
  }
  return pdfDoc.embedPng(bytes);
}

interface ExpenseItem {
  date: string;
  description: string;
  amount: number;
}

interface ApprovalRecord {
  approver_name: string;
  approver_esig: string | null;
  approval_date: string;
  for_checking?: boolean;
}

interface ReimbursementFormData {
  reimbNumber: string;
  requestType: string;
  requestedBy: string;
  requestedByEsig: string | null;
  requestDate: string;
  company: string;
  department: string;
  linkedRequestType?: string;
  linkedRequestNumber?: string;
  linkedRequestDate?: string;
  linkedRequestAmount?: number;
  linkedRequestPurpose?: string;
  purpose: string;
  expenseItems: ExpenseItem[];
  totalExpenditures: number;
  cashAdvance: number;
  netAmount: number;
  payee: string;
  approvals: ApprovalRecord[];
  expenseCategory?: string;
}

export async function generateReimbursementForm(data: ReimbursementFormData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 50;

  const sanitizeText = (text: string): string => {
    if (!text) return '';

    // Convert to string if needed
    const str = String(text);

    // First normalize Unicode characters to their closest ASCII equivalents
    let sanitized = str
      .normalize('NFD') // Decompose combined characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/\r\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Remove ALL control chars including 0x0A

    // Replace common problematic characters with safe alternatives
    sanitized = sanitized
      .replace(/[""]/g, '"') // Smart quotes
      .replace(/['']/g, "'") // Smart apostrophes
      .replace(/[–—]/g, '-') // En dash, em dash
      .replace(/…/g, '...') // Ellipsis
      .replace(/™/g, '(TM)').replace(/®/g, '(R)').replace(/©/g, '(C)') // Symbols
      .replace(/€/g, 'EUR').replace(/£/g, 'GBP').replace(/¥/g, 'JPY'); // Currency

    // Remove any remaining characters outside WinAnsi safe range
    sanitized = sanitized.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');

    // Clean up multiple spaces
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  };

  const drawText = (text: string, x: number, y: number, size = 10, isBold = false) => {
    if (!text || text.trim() === '') return;
    const sanitized = sanitizeText(text);
    if (!sanitized || sanitized.trim() === '') return;
    page.drawText(sanitized, {
      x,
      y,
      size,
      font: isBold ? boldFont : font,
      color: rgb(0, 0, 0),
    });
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
  };

  const drawBox = (x: number, y: number, width: number, height: number) => {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
  };

  let yPos = height - 60;

  // Header: Title and Document No.
  drawBox(margin, yPos - 30, width - 2 * margin, 30);
  const titleText = `${data.requestType} Request`;
  drawText(titleText, margin + 10, yPos - 20, 14, true);
  drawText(`${data.requestType === 'Liquidation' ? 'Liquidation' : 'Reimbursement'} No.: ${data.reimbNumber}`,
    width - margin - 200, yPos - 20, 10, false);
  yPos -= 30;

  // First section: Request details
  const sectionHeight = 120;
  drawBox(margin, yPos - sectionHeight, width - 2 * margin, sectionHeight);

  const leftColX = margin + 10;
  const rightColX = width / 2 + 10;
  const valueOffset = 90;

  let detailY = yPos - 20;

  drawText('Payee', leftColX, detailY, 10, true);
  drawText(data.payee, leftColX + valueOffset, detailY, 10, false);
  drawText('Date', rightColX, detailY, 10, true);
  drawText(data.requestDate, rightColX + 85, detailY, 10, false);
  detailY -= 20;

  drawText('Company', leftColX, detailY, 10, true);
  drawText(data.company, leftColX + valueOffset, detailY, 10, false);
  drawText('Department', rightColX, detailY, 10, true);
  drawText(data.department, rightColX + 85, detailY, 10, false);
  detailY -= 20;

  drawText('Purpose', leftColX, detailY, 10, true);
  detailY -= 15;

  const maxPurposeWidth = width - 2 * margin - 20;
  const purposeWords = data.purpose.split(' ');
  let currentLine = '';
  let purposeY = detailY;

  for (const word of purposeWords) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const lineWidth = font.widthOfTextAtSize(testLine, 10);

    if (lineWidth > maxPurposeWidth && currentLine !== '') {
      drawText(currentLine, leftColX, purposeY, 10, false);
      currentLine = word;
      purposeY -= 15;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    drawText(currentLine, leftColX, purposeY, 10, false);
  }

  yPos -= sectionHeight + 10;

  // Linked request details section (for Liquidation requests)
  if (data.requestType === 'Liquidation' && data.linkedRequestNumber) {
    const linkedSectionHeight = 100;
    drawBox(margin, yPos - linkedSectionHeight, width - 2 * margin, linkedSectionHeight);

    let linkedY = yPos - 20;

    drawText('Linked Request Details', margin + 10, linkedY, 11, true);
    linkedY -= 20;

    if (data.linkedRequestType) {
      drawText('Type:', leftColX, linkedY, 10, true);
      drawText(data.linkedRequestType, leftColX + valueOffset, linkedY, 10, false);
    }

    drawText('Number:', rightColX, linkedY, 10, true);
    drawText(data.linkedRequestNumber, rightColX + 85, linkedY, 10, false);
    linkedY -= 20;

    if (data.linkedRequestDate) {
      drawText('Request Date:', leftColX, linkedY, 10, true);
      drawText(data.linkedRequestDate, leftColX + valueOffset, linkedY, 10, false);
    }

    if (data.linkedRequestAmount !== undefined) {
      drawText('Amount:', rightColX, linkedY, 10, true);
      drawText(`P${data.linkedRequestAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        rightColX + 85, linkedY, 10, false);
    }
    linkedY -= 20;

    if (data.linkedRequestPurpose) {
      drawText('Purpose:', leftColX, linkedY, 10, true);
      const maxPurposeWidth = width - 2 * margin - valueOffset - 20;
      const linkedPurpose = data.linkedRequestPurpose;
      const purposeText = font.widthOfTextAtSize(linkedPurpose, 10) > maxPurposeWidth
        ? linkedPurpose.substring(0, 60) + '...'
        : linkedPurpose;
      drawText(purposeText, leftColX + valueOffset, linkedY, 10, false);
    }

    yPos -= linkedSectionHeight + 10;
  }

  // Expense Itemization section
  const itemsPerPage = 8;
  const itemHeight = 15;
  const headerHeight = 20;
  const footerHeight = 90;
  const expenseTableHeight = headerHeight + (Math.min(data.expenseItems.length, itemsPerPage) * itemHeight) + footerHeight;

  drawBox(margin, yPos - expenseTableHeight, width - 2 * margin, expenseTableHeight);

  let expenseY = yPos - 15;

  // Table header
  drawText('Expense Itemization', margin + 10, expenseY, 11, true);
  expenseY -= headerHeight;

  // Column headers
  const dateColX = margin + 10;
  const descColX = margin + 100;
  const amountColX = width - margin - 100;

  drawText('Date', dateColX, expenseY, 9, true);
  drawText('Supplier Name & Particulars', descColX, expenseY, 9, true);
  drawText('Amount', amountColX, expenseY, 9, true);
  expenseY -= 15;

  // Draw expense items
  for (const item of data.expenseItems.slice(0, itemsPerPage)) {
    drawText(new Date(item.date).toLocaleDateString(), dateColX, expenseY, 9, false);

    const maxDescWidth = amountColX - descColX - 10;
    let description = item.description;
    if (font.widthOfTextAtSize(description, 9) > maxDescWidth) {
      while (font.widthOfTextAtSize(description + '...', 9) > maxDescWidth && description.length > 0) {
        description = description.slice(0, -1);
      }
      description += '...';
    }
    drawText(description, descColX, expenseY, 9, false);

    drawText(`P${item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      amountColX, expenseY, 9, false);
    expenseY -= itemHeight;
  }

  // Draw footer line
  drawLine(margin, expenseY + 10, width - margin, expenseY + 10);
  expenseY -= 5;

  // Summary calculations
  drawText('Total Expenditures:', amountColX - 150, expenseY, 10, true);
  drawText(`P${data.totalExpenditures.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    amountColX, expenseY, 10, true);
  expenseY -= 18;

  drawText('Less: Cash Advance:', amountColX - 150, expenseY, 10, true);
  drawText(`P${data.cashAdvance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    amountColX, expenseY, 10, false);
  expenseY -= 20;

  const isReimbursement = data.netAmount >= 0;
  drawText(isReimbursement ? 'Over for Reimbursement:' : 'Excess for Deposit:',
    amountColX - 150, expenseY, 11, true);
  drawText(`P${Math.abs(data.netAmount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    amountColX, expenseY, 11, true);

  yPos -= expenseTableHeight + 10;

  // Signatories section
  const signatoryHeight = 150;
  drawBox(margin, yPos - signatoryHeight, width - 2 * margin, signatoryHeight);

  let signatoryY = yPos - 20;

  const isManComReimbursement = data.requestType === 'Reimbursement' && data.expenseCategory === 'ManCom Expense' && data.approvals.length >= 2;

  if (isManComReimbursement) {
    // ManCom layout: "Prepared By" (Requestor + First Approver), "Approved By" (middle), "Noted By" (last)
    const remainingApprovals = data.approvals.slice(1);
    const totalColumns = 1 + remainingApprovals.length; // Prepared By + remaining approvers
    const colWidth = (width - 2 * margin) / totalColumns;

    // Draw headers
    drawText('Prepared By', leftColX, signatoryY, 10, true);

    for (let i = 0; i < remainingApprovals.length; i++) {
      const colX = margin + ((i + 1) * colWidth) + 10;
      const isChecker = remainingApprovals[i].for_checking === true ||
        (!remainingApprovals.some(a => a.for_checking) && i === remainingApprovals.length - 1);
      const label = isChecker ? 'Noted/Checked By' : 'Approved By';
      drawText(label, colX, signatoryY, 10, true);
    }

    signatoryY -= 35;

    // Draw requester signature in "Prepared By" column
    if (data.requestedByEsig) {
      try {
        const esigImage = await embedSignatureImage(pdfDoc, data.requestedByEsig);
        const esigDims = esigImage.scale(0.25);
        page.drawImage(esigImage, {
          x: leftColX + 5,
          y: signatoryY - 5,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding requester e-signature:', error);
      }
    }

    drawText(data.requestedBy, leftColX, signatoryY - 22, 8, false);
    drawText(data.requestDate, leftColX, signatoryY - 33, 7, false);

    // Draw first approver signature below requester in same "Prepared By" column
    const firstApprover = data.approvals[0];
    const firstApproverY = signatoryY - 50;

    if (firstApprover.approver_esig) {
      try {
        const esigImage = await embedSignatureImage(pdfDoc, firstApprover.approver_esig);
        const esigDims = esigImage.scale(0.25);
        page.drawImage(esigImage, {
          x: leftColX + 5,
          y: firstApproverY - 5,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding first approver e-signature:', error);
      }
    }

    drawText(firstApprover.approver_name, leftColX, firstApproverY - 22, 8, false);
    const firstApproverDate = new Date(firstApprover.approval_date);
    drawText(
      firstApproverDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      firstApproverDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      leftColX, firstApproverY - 33, 7, false
    );

    // Draw remaining approver signatures
    for (let i = 0; i < remainingApprovals.length; i++) {
      const approver = remainingApprovals[i];
      const colX = margin + ((i + 1) * colWidth) + 10;

      if (approver.approver_esig) {
        try {
          const esigImage = await embedSignatureImage(pdfDoc, approver.approver_esig);
          const esigDims = esigImage.scale(0.35);
          page.drawImage(esigImage, {
            x: colX + 15,
            y: signatoryY - 10,
            width: esigDims.width,
            height: esigDims.height,
          });
        } catch (error) {
          console.error(`Error embedding approver ${i + 2} e-signature:`, error);
        }
      }

      drawText(approver.approver_name, colX, signatoryY - 30, 9, false);
      const approverDate = new Date(approver.approval_date);
      drawText(
        approverDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
        approverDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        colX, signatoryY - 45, 8, false
      );
    }
  } else {
    // Default layout: "Prepared By" (Requestor), "Approved By" (non-checker approvers), "Noted/Checked By" (checker/validator)
    const totalApprovers = data.approvals.length + 1; // +1 for payee
    const colWidth = (width - 2 * margin) / totalApprovers;

    // Draw headers
    drawText('Prepared By', leftColX, signatoryY, 10, true);

    for (let i = 0; i < data.approvals.length; i++) {
      const colX = margin + ((i + 1) * colWidth) + 10;
      const isChecker = data.approvals[i].for_checking === true ||
        (!data.approvals.some(a => a.for_checking) && i === data.approvals.length - 1);
      const label = isChecker ? 'Noted/Checked By' : 'Approved By';
      drawText(label, colX, signatoryY, 10, true);
    }

    signatoryY -= 50;

    // Draw requester signature
    if (data.requestedByEsig) {
      try {
        const esigImage = await embedSignatureImage(pdfDoc, data.requestedByEsig);
        const esigDims = esigImage.scale(0.35);
        page.drawImage(esigImage, {
          x: leftColX + 15,
          y: signatoryY - 10,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding requester e-signature:', error);
      }
    }

    drawText(data.requestedBy, leftColX, signatoryY - 30, 9, false);
    drawText(data.requestDate, leftColX, signatoryY - 45, 8, false);

    // Draw approver signatures
    for (let i = 0; i < data.approvals.length; i++) {
      const approver = data.approvals[i];
      const colX = margin + ((i + 1) * colWidth) + 10;

      if (approver.approver_esig) {
        try {
          const esigImage = await embedSignatureImage(pdfDoc, approver.approver_esig);
          const esigDims = esigImage.scale(0.35);
          page.drawImage(esigImage, {
            x: colX + 15,
            y: signatoryY - 10,
            width: esigDims.width,
            height: esigDims.height,
          });
        } catch (error) {
          console.error(`Error embedding approver ${i + 1} e-signature:`, error);
        }
      }

      drawText(approver.approver_name, colX, signatoryY - 30, 9, false);
      const approverDate = new Date(approver.approval_date);
      drawText(
        approverDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
        approverDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        colX, signatoryY - 45, 8, false
      );
    }
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
