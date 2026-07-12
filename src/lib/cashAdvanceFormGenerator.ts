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
  drawText(Number(data.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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
  const purposeWords = (data.purpose || '').replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 0);
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
  // Get the for_checking approver for accounting section (fall back to first approver)
  const accountingApprover = data.approvals.find(a => a.for_checking) || data.approvals[0];

  let accountingY = yPos - 50;
  drawText('To be filled out by Accounting Department:', rightColX, accountingY, 9, true);
  accountingY -= 25;

  drawText('Outstanding ASL', rightColX, accountingY, 9, true);
  drawText(data.outstandingAsl || '', rightColX + 100, accountingY, 9, false);
  accountingY -= 18;

  drawText('Date', rightColX, accountingY, 9, true);
  const approvalDate = accountingApprover
    ? new Date(accountingApprover.approval_date).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      new Date(accountingApprover.approval_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : data.outstandingAslDate;
  drawText(approvalDate, rightColX + 100, accountingY, 9, false);
  accountingY -= 18;

  drawText('Remarks', rightColX, accountingY, 9, true);
  drawText(data.remarks || '', rightColX + 100, accountingY, 9, false);
  accountingY -= 35;

  // Accounting signature
  if (accountingApprover && accountingApprover.approver_esig) {
    try {
      const esigImage = await embedSignatureImage(pdfDoc, accountingApprover.approver_esig);
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
  if (accountingApprover) {
    drawText(accountingApprover.approver_name, rightColX, accountingY, 9, false);
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

  // Get approvers (excluding the accounting/for_checking approver)
  const signatureApprovers = data.approvals.filter(a => a !== accountingApprover);
  const recommendedByApprovers = signatureApprovers.length > 1 ? signatureApprovers.slice(0, -1) : [];
  const approvedByApprover = signatureApprovers.length > 0 ? signatureApprovers[signatureApprovers.length - 1] : null;

  const columnXs = [recByX, app1X, app2X];
  const headerY = approvalY;
  const signatureY = approvalY - 50;

  recommendedByApprovers.forEach((_, idx) => {
    if (idx < columnXs.length) {
      drawText('Recommended By', columnXs[idx], headerY, 10, true);
    }
  });

  if (approvedByApprover) {
    const approvedColIdx = Math.min(recommendedByApprovers.length, columnXs.length - 1);
    drawText('Approved By', columnXs[approvedColIdx], headerY, 10, true);
  }

  const drawApprover = async (approver: typeof signatureApprovers[number], colX: number) => {
    if (approver.approver_esig) {
      try {
        const esigImage = await embedSignatureImage(pdfDoc, approver.approver_esig);
        const esigDims = esigImage.scale(0.35);
        page.drawImage(esigImage, {
          x: colX + 15,
          y: signatureY - 10,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding e-signature:', error);
      }
    }

    drawText(approver.approver_name, colX, signatureY - 30, 9, false);

    if (approver.for_checking) {
      drawText('For Checking Only', colX, signatureY - 42, 7, false);
    }

    const approvalDate = new Date(approver.approval_date);
    const dateYOffset = approver.for_checking ? -55 : -45;
    drawText(
      approvalDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      approvalDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      colX, signatureY + dateYOffset, 8, false
    );
  };

  for (let i = 0; i < recommendedByApprovers.length && i < columnXs.length; i++) {
    await drawApprover(recommendedByApprovers[i], columnXs[i]);
  }

  if (approvedByApprover) {
    const approvedColIdx = Math.min(recommendedByApprovers.length, columnXs.length - 1);
    await drawApprover(approvedByApprover, columnXs[approvedColIdx]);
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
