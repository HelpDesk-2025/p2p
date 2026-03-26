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

interface ApprovalRecord {
  approver_name: string;
  approver_esig: string | null;
  approval_date: string;
  sequence: number;
  for_checking?: boolean;
}

interface CashAdvanceFormData {
  caNumber: string;
  requestedBy: string;
  requestDate: string;
  amount: number;
  company: string;
  department: string;
  purpose: string;
  payee: string;
  payeeEsig: string | null;
  requestorEsig: string | null;
  outstandingAsl: string;
  outstandingAslDate: string;
  remarks: string;
  approvals: ApprovalRecord[];
}

export async function generateCashAdvanceForm(data: CashAdvanceFormData): Promise<Uint8Array> {
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

  // Header: Title and C.A. No.
  drawBox(margin, yPos - 30, width - 2 * margin, 30);
  drawText('Request for Cash Advance', margin + 10, yPos - 20, 14, true);
  drawText(`C.A. No.: ${data.caNumber}`, width - margin - 150, yPos - 20, 10, false);
  yPos -= 30;

  // First section: Request details
  const sectionHeight = 120;
  drawBox(margin, yPos - sectionHeight, width - 2 * margin, sectionHeight);

  const leftColX = margin + 10;
  const rightColX = width / 2 + 10;
  const valueOffset = 90;

  let detailY = yPos - 20;

  drawText('Requested By', leftColX, detailY, 10, true);
  drawText(data.requestedBy, leftColX + valueOffset, detailY, 10, false);
  drawText('Date', rightColX, detailY, 10, true);
  drawText(data.requestDate, rightColX + 85, detailY, 10, false);
  detailY -= 20;

  drawText('Amount', leftColX, detailY, 10, true);
  drawText(data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    leftColX + valueOffset, detailY, 10, false);
  drawText('Company', rightColX, detailY, 10, true);
  drawText(data.company, rightColX + 85, detailY, 10, false);
  detailY -= 20;

  drawText('', leftColX, detailY, 10, true);
  drawText('Department', rightColX, detailY, 10, true);
  drawText(data.department, rightColX + 85, detailY, 10, false);
  detailY -= 25;

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

  // Cash Advance section
  const cashAdvanceHeight = 280;
  drawBox(margin, yPos - cashAdvanceHeight, width - 2 * margin, cashAdvanceHeight);

  const midX = width / 2;
  drawLine(midX, yPos - cashAdvanceHeight, midX, yPos);

  let cashAdvY = yPos - 30;
  const centerX = width / 2;
  const titleWidth = boldFont.widthOfTextAtSize('Cash Advance', 11);

  // Draw black background rectangle for title
  page.drawRectangle({
    x: centerX - titleWidth / 2 - 10,
    y: cashAdvY - 5,
    width: titleWidth + 20,
    height: 18,
    color: rgb(0, 0, 0),
  });

  // Draw white text on black background
  page.drawText('Cash Advance', {
    x: centerX - titleWidth / 2,
    y: cashAdvY,
    size: 11,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  cashAdvY -= 30;

  // Left side: Agreement text
  const agreementText = [
    'I, the requisitioner, fully understand the Accounting',
    'policy on ASL and hereby authorize Accounting',
    'Department to deduct from my salary the amount',
    'requested if I fail to liquidate within seven (7)',
    'working days from receipt of Cash.'
  ];

  for (const line of agreementText) {
    drawText(line, leftColX, cashAdvY, 9, false);
    cashAdvY -= 13;
  }

  cashAdvY -= 10;

  // Requestor signature
  if (data.requestorEsig) {
    try {
      const esigImage = await embedSignatureImage(pdfDoc, data.requestorEsig);
      const esigDims = esigImage.scale(0.3);
      page.drawImage(esigImage, {
        x: leftColX + 20,
        y: cashAdvY - esigDims.height,
        width: esigDims.width,
        height: esigDims.height,
      });
    } catch (error) {
      console.error('Error embedding requestor e-signature:', error);
    }
  }

  cashAdvY -= 30;
  drawText(data.requestedBy, leftColX, cashAdvY, 9, false);
  cashAdvY -= 12;
  drawText('Requestor', leftColX, cashAdvY, 9, true);

  cashAdvY -= 15;

  // Payee section
  if (data.payeeEsig) {
    try {
      const esigImage = await embedSignatureImage(pdfDoc, data.payeeEsig);
      const esigDims = esigImage.scale(0.3);
      page.drawImage(esigImage, {
        x: leftColX + 20,
        y: cashAdvY - esigDims.height,
        width: esigDims.width,
        height: esigDims.height,
      });
    } catch (error) {
      console.error('Error embedding payee e-signature:', error);
    }
  }

  cashAdvY -= 30;
  drawText(data.payee, leftColX, cashAdvY, 9, false);
  cashAdvY -= 12;
  drawText('Payee', leftColX, cashAdvY, 9, true);

  // Right side: Accounting Department info
  // Get first approver for accounting section
  const firstApprover = data.approvals[0];

  let accountingY = yPos - 50;
  drawText('To be filled out by Accounting Department:', rightColX, accountingY, 9, true);
  accountingY -= 25;

  drawText('Outstanding ASL', rightColX, accountingY, 9, true);
  drawText(data.outstandingAsl || 'None', rightColX + 100, accountingY, 9, false);
  accountingY -= 18;

  drawText('Date', rightColX, accountingY, 9, true);
  const approvalDate = firstApprover
    ? new Date(firstApprover.approval_date).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      new Date(firstApprover.approval_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : data.outstandingAslDate;
  drawText(approvalDate, rightColX + 100, accountingY, 9, false);
  accountingY -= 18;

  drawText('Remarks', rightColX, accountingY, 9, true);
  drawText(data.remarks || 'OK', rightColX + 100, accountingY, 9, false);
  accountingY -= 35;

  // Accounting signature (first approver)
  if (firstApprover && firstApprover.approver_esig) {
    try {
      const esigImage = await embedSignatureImage(pdfDoc, firstApprover.approver_esig);
      const esigDims = esigImage.scale(0.35);
      page.drawImage(esigImage, {
        x: rightColX + 20,
        y: accountingY,
        width: esigDims.width,
        height: esigDims.height,
      });
    } catch (error) {
      console.error('Error embedding accounting e-signature:', error);
    }
  }

  accountingY -= 15;
  if (firstApprover) {
    drawText(firstApprover.approver_name, rightColX, accountingY, 9, false);
  }
  accountingY -= 15;
  drawText('Accounting', rightColX, accountingY, 9, true);

  yPos -= cashAdvanceHeight;

  // Approval section
  const approvalHeight = 150;
  drawBox(margin, yPos - approvalHeight, width - 2 * margin, approvalHeight);

  let approvalY = yPos - 20;

  // Define column positions
  const recByX = leftColX;
  const app1X = width / 3 + 20;
  const app2X = (2 * width) / 3 + 10;

  // Get approvers (excluding the first one who is Accounting)
  const signatureApprovers = data.approvals.length > 1 ? data.approvals.slice(1) : [];
  const recommendedByApprover = signatureApprovers[0];
  const approvedByApprovers = signatureApprovers.slice(1);

  // Draw headers
  drawText('Recommended By', recByX, approvalY, 10, true);
  if (approvedByApprovers.length > 0) {
    drawText('Approved By', app1X, approvalY, 10, true);
  }

  approvalY -= 50;

  // Draw recommended by approver (first in signature section)
  if (recommendedByApprover) {
    if (recommendedByApprover.approver_esig) {
      try {
        const esigImage = await embedSignatureImage(pdfDoc, recommendedByApprover.approver_esig);
        const esigDims = esigImage.scale(0.35);
        page.drawImage(esigImage, {
          x: recByX + 15,
          y: approvalY - 10,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding recommended by e-signature:', error);
      }
    }

    drawText(recommendedByApprover.approver_name, recByX, approvalY - 30, 9, false);

    // Add "For Checking Only" text if this is a checker
    if (recommendedByApprover.for_checking) {
      drawText('For Checking Only', recByX, approvalY - 42, 7, false);
    }

    const recommendedByDate = new Date(recommendedByApprover.approval_date);
    const dateYOffset = recommendedByApprover.for_checking ? -55 : -45;
    drawText(
      recommendedByDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      recommendedByDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      recByX, approvalY + dateYOffset, 8, false
    );
  }

  // Draw approved by approvers (max 2)
  if (approvedByApprovers.length > 0) {
    const approver1 = approvedByApprovers[0];
    if (approver1.approver_esig) {
      try {
        const esigImage = await embedSignatureImage(pdfDoc, approver1.approver_esig);
        const esigDims = esigImage.scale(0.35);
        page.drawImage(esigImage, {
          x: app1X + 15,
          y: approvalY - 10,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding approved by 1 e-signature:', error);
      }
    }

    drawText(approver1.approver_name, app1X, approvalY - 30, 9, false);

    // Add "For Checking Only" text if this is a checker
    if (approver1.for_checking) {
      drawText('For Checking Only', app1X, approvalY - 42, 7, false);
    }

    const approver1Date = new Date(approver1.approval_date);
    const app1DateYOffset = approver1.for_checking ? -55 : -45;
    drawText(
      approver1Date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      approver1Date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      app1X, approvalY + app1DateYOffset, 8, false
    );
  }

  if (approvedByApprovers.length > 1) {
    const approver2 = approvedByApprovers[1];
    if (approver2.approver_esig) {
      try {
        const esigImage = await embedSignatureImage(pdfDoc, approver2.approver_esig);
        const esigDims = esigImage.scale(0.35);
        page.drawImage(esigImage, {
          x: app2X + 15,
          y: approvalY - 10,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding approved by 2 e-signature:', error);
      }
    }

    drawText(approver2.approver_name, app2X, approvalY - 30, 9, false);

    // Add "For Checking Only" text if this is a checker
    if (approver2.for_checking) {
      drawText('For Checking Only', app2X, approvalY - 42, 7, false);
    }

    const approver2Date = new Date(approver2.approval_date);
    const app2DateYOffset = approver2.for_checking ? -55 : -45;
    drawText(
      approver2Date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      approver2Date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      app2X, approvalY + app2DateYOffset, 8, false
    );
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
