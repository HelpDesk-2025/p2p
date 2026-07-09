import { PDFDocument, rgb, StandardFonts, PDFImage, PDFPage, PDFFont } from 'pdf-lib';

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

function sanitizeText(text: string): string {
  if (!text) return '';
  const str = String(text);
  let sanitized = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\r\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  sanitized = sanitized
    .replace(/["\u201C\u201D]/g, '"')
    .replace(/['\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2122/g, '(TM)').replace(/\u00AE/g, '(R)').replace(/\u00A9/g, '(C)')
    .replace(/\u20AC/g, 'EUR').replace(/\u00A3/g, 'GBP').replace(/\u00A5/g, 'JPY');

  sanitized = sanitized.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  return sanitized;
}

export async function generateReimbursementForm(data: ReimbursementFormData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 50;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let yPos = pageHeight - 60;

  const drawTextOnPage = (currentPage: PDFPage, text: string, x: number, y: number, size = 10, isBold = false) => {
    if (!text || text.trim() === '') return;
    const sanitized = sanitizeText(text);
    if (!sanitized || sanitized.trim() === '') return;
    currentPage.drawText(sanitized, {
      x,
      y,
      size,
      font: isBold ? boldFont : font,
      color: rgb(0, 0, 0),
    });
  };

  const drawLineOnPage = (currentPage: PDFPage, x1: number, y1: number, x2: number, y2: number) => {
    currentPage.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
  };

  const drawBoxOnPage = (currentPage: PDFPage, x: number, y: number, w: number, h: number) => {
    currentPage.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
  };

  // Header: Title and Document No.
  drawBoxOnPage(page, margin, yPos - 30, pageWidth - 2 * margin, 30);
  const titleText = `${data.requestType} Request`;
  drawTextOnPage(page, titleText, margin + 10, yPos - 20, 14, true);
  drawTextOnPage(page, `${data.requestType === 'Liquidation' ? 'Liquidation' : 'Reimbursement'} No.: ${data.reimbNumber}`,
    pageWidth - margin - 200, yPos - 20, 10, false);
  yPos -= 30;

  // First section: Request details
  const sectionHeight = 120;
  drawBoxOnPage(page, margin, yPos - sectionHeight, pageWidth - 2 * margin, sectionHeight);

  const leftColX = margin + 10;
  const rightColX = pageWidth / 2 + 10;
  const valueOffset = 90;

  let detailY = yPos - 20;

  drawTextOnPage(page, 'Payee', leftColX, detailY, 10, true);
  drawTextOnPage(page, data.payee, leftColX + valueOffset, detailY, 10, false);
  drawTextOnPage(page, 'Date', rightColX, detailY, 10, true);
  drawTextOnPage(page, data.requestDate, rightColX + 85, detailY, 10, false);
  detailY -= 20;

  drawTextOnPage(page, 'Company', leftColX, detailY, 10, true);
  drawTextOnPage(page, data.company, leftColX + valueOffset, detailY, 10, false);
  drawTextOnPage(page, 'Department', rightColX, detailY, 10, true);
  drawTextOnPage(page, data.department, rightColX + 85, detailY, 10, false);
  detailY -= 20;

  drawTextOnPage(page, 'Purpose', leftColX, detailY, 10, true);
  detailY -= 15;

  const maxPurposeWidth = pageWidth - 2 * margin - 20;
  const purposeWords = data.purpose.split(' ');
  let currentLine = '';
  let purposeY = detailY;

  for (const word of purposeWords) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const lineWidth = font.widthOfTextAtSize(testLine, 10);

    if (lineWidth > maxPurposeWidth && currentLine !== '') {
      drawTextOnPage(page, currentLine, leftColX, purposeY, 10, false);
      currentLine = word;
      purposeY -= 15;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    drawTextOnPage(page, currentLine, leftColX, purposeY, 10, false);
  }

  yPos -= sectionHeight + 10;

  // Linked request details section (for Liquidation requests)
  if (data.requestType === 'Liquidation' && data.linkedRequestNumber) {
    const linkedSectionHeight = 100;
    drawBoxOnPage(page, margin, yPos - linkedSectionHeight, pageWidth - 2 * margin, linkedSectionHeight);

    let linkedY = yPos - 20;

    drawTextOnPage(page, 'Linked Request Details', margin + 10, linkedY, 11, true);
    linkedY -= 20;

    if (data.linkedRequestType) {
      drawTextOnPage(page, 'Type:', leftColX, linkedY, 10, true);
      drawTextOnPage(page, data.linkedRequestType, leftColX + valueOffset, linkedY, 10, false);
    }

    drawTextOnPage(page, 'Number:', rightColX, linkedY, 10, true);
    drawTextOnPage(page, data.linkedRequestNumber, rightColX + 85, linkedY, 10, false);
    linkedY -= 20;

    if (data.linkedRequestDate) {
      drawTextOnPage(page, 'Request Date:', leftColX, linkedY, 10, true);
      drawTextOnPage(page, data.linkedRequestDate, leftColX + valueOffset, linkedY, 10, false);
    }

    if (data.linkedRequestAmount !== undefined) {
      drawTextOnPage(page, 'Amount:', rightColX, linkedY, 10, true);
      drawTextOnPage(page, `P${data.linkedRequestAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        rightColX + 85, linkedY, 10, false);
    }
    linkedY -= 20;

    if (data.linkedRequestPurpose) {
      drawTextOnPage(page, 'Purpose:', leftColX, linkedY, 10, true);
      const linkedMaxWidth = pageWidth - 2 * margin - valueOffset - 20;
      const linkedPurpose = data.linkedRequestPurpose;
      const purposeText = font.widthOfTextAtSize(linkedPurpose, 10) > linkedMaxWidth
        ? linkedPurpose.substring(0, 60) + '...'
        : linkedPurpose;
      drawTextOnPage(page, purposeText, leftColX + valueOffset, linkedY, 10, false);
    }

    yPos -= linkedSectionHeight + 10;
  }

  // Expense Itemization section with multi-page support
  const itemHeight = 15;
  const dateColX = margin + 10;
  const descColX = margin + 100;
  const amountColX = pageWidth - margin - 100;

  // Space needed for summary + signatories after items
  const summaryAndSignatorySpace = 270;
  const minYForItems = margin + summaryAndSignatorySpace;

  // Draw table header on current page
  const drawTableHeader = (currentPage: PDFPage, y: number): number => {
    drawTextOnPage(currentPage, 'Expense Itemization', margin + 10, y, 11, true);
    y -= 20;
    drawTextOnPage(currentPage, 'Date', dateColX, y, 9, true);
    drawTextOnPage(currentPage, 'Supplier Name & Particulars', descColX, y, 9, true);
    drawTextOnPage(currentPage, 'Amount', amountColX, y, 9, true);
    y -= 15;
    return y;
  };

  let expenseY = yPos - 15;
  expenseY = drawTableHeader(page, expenseY);

  let itemsDrawn = 0;
  const totalItems = data.expenseItems.length;

  for (let idx = 0; idx < totalItems; idx++) {
    const item = data.expenseItems[idx];

    // Check if we need a new page
    if (expenseY < minYForItems) {
      // Draw continuation note
      drawTextOnPage(page, `(continued on next page...)`, margin + 10, expenseY, 8, false);

      // Start new page
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPos = pageHeight - 60;

      // Draw page header
      drawBoxOnPage(page, margin, yPos - 25, pageWidth - 2 * margin, 25);
      drawTextOnPage(page, `${data.requestType} Request - ${data.reimbNumber} (continued)`, margin + 10, yPos - 17, 10, true);
      yPos -= 35;

      expenseY = yPos;
      expenseY = drawTableHeader(page, expenseY);
    }

    drawTextOnPage(page, new Date(item.date).toLocaleDateString(), dateColX, expenseY, 9, false);

    const maxDescWidth = amountColX - descColX - 10;
    let description = item.description;
    if (font.widthOfTextAtSize(description, 9) > maxDescWidth) {
      while (font.widthOfTextAtSize(description + '...', 9) > maxDescWidth && description.length > 0) {
        description = description.slice(0, -1);
      }
      description += '...';
    }
    drawTextOnPage(page, description, descColX, expenseY, 9, false);

    drawTextOnPage(page, `P${item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      amountColX, expenseY, 9, false);
    expenseY -= itemHeight;
    itemsDrawn++;
  }

  // Draw footer line
  drawLineOnPage(page, margin, expenseY + 10, pageWidth - margin, expenseY + 10);
  expenseY -= 5;

  // Summary calculations
  drawTextOnPage(page, 'Total Expenditures:', amountColX - 150, expenseY, 10, true);
  drawTextOnPage(page, `P${data.totalExpenditures.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    amountColX, expenseY, 10, true);
  expenseY -= 18;

  drawTextOnPage(page, 'Less: Cash Advance:', amountColX - 150, expenseY, 10, true);
  drawTextOnPage(page, `P${data.cashAdvance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    amountColX, expenseY, 10, false);
  expenseY -= 20;

  const isReimbursement = data.netAmount >= 0;
  drawTextOnPage(page, isReimbursement ? 'Over for Reimbursement:' : 'Excess for Deposit:',
    amountColX - 150, expenseY, 11, true);
  drawTextOnPage(page, `P${Math.abs(data.netAmount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    amountColX, expenseY, 11, true);

  yPos = expenseY - 20;

  // Check if signatories fit on current page
  const signatoryHeight = 150;
  if (yPos - signatoryHeight < margin) {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    yPos = pageHeight - 60;
  }

  // Signatories section
  drawBoxOnPage(page, margin, yPos - signatoryHeight, pageWidth - 2 * margin, signatoryHeight);

  let signatoryY = yPos - 20;

  const isManComReimbursement = data.requestType === 'Reimbursement' && data.expenseCategory === 'ManCom Expense' && data.approvals.length >= 2;

  if (isManComReimbursement) {
    const remainingApprovals = data.approvals.slice(1);
    const totalColumns = 1 + remainingApprovals.length;
    const colWidth = (pageWidth - 2 * margin) / totalColumns;

    drawTextOnPage(page, 'Prepared By', leftColX, signatoryY, 10, true);

    for (let i = 0; i < remainingApprovals.length; i++) {
      const colX = margin + ((i + 1) * colWidth) + 10;
      const isChecker = remainingApprovals[i].for_checking === true ||
        (!remainingApprovals.some(a => a.for_checking) && i === remainingApprovals.length - 1);
      const label = isChecker ? 'Noted/Checked By' : 'Approved By';
      drawTextOnPage(page, label, colX, signatoryY, 10, true);
    }

    signatoryY -= 35;

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

    drawTextOnPage(page, data.requestedBy, leftColX, signatoryY - 22, 8, false);
    drawTextOnPage(page, data.requestDate, leftColX, signatoryY - 33, 7, false);

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

    drawTextOnPage(page, firstApprover.approver_name, leftColX, firstApproverY - 22, 8, false);
    const firstApproverDate = new Date(firstApprover.approval_date);
    drawTextOnPage(page,
      firstApproverDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      firstApproverDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      leftColX, firstApproverY - 33, 7, false
    );

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

      drawTextOnPage(page, approver.approver_name, colX, signatoryY - 30, 9, false);
      const approverDate = new Date(approver.approval_date);
      drawTextOnPage(page,
        approverDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
        approverDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        colX, signatoryY - 45, 8, false
      );
    }
  } else {
    const totalApprovers = data.approvals.length + 1;
    const colWidth = (pageWidth - 2 * margin) / totalApprovers;

    drawTextOnPage(page, 'Prepared By', leftColX, signatoryY, 10, true);

    for (let i = 0; i < data.approvals.length; i++) {
      const colX = margin + ((i + 1) * colWidth) + 10;
      const isChecker = data.approvals[i].for_checking === true ||
        (!data.approvals.some(a => a.for_checking) && i === data.approvals.length - 1);
      const label = isChecker ? 'Noted/Checked By' : 'Approved By';
      drawTextOnPage(page, label, colX, signatoryY, 10, true);
    }

    signatoryY -= 50;

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

    drawTextOnPage(page, data.requestedBy, leftColX, signatoryY - 30, 9, false);
    drawTextOnPage(page, data.requestDate, leftColX, signatoryY - 45, 8, false);

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

      drawTextOnPage(page, approver.approver_name, colX, signatoryY - 30, 9, false);
      const approverDate = new Date(approver.approval_date);
      drawTextOnPage(page,
        approverDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
        approverDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        colX, signatoryY - 45, 8, false
      );
    }
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
