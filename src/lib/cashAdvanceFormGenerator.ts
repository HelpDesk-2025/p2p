import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface ApprovalRecord {
  approver_name: string;
  approver_esig: string | null;
  approval_date: string;
  sequence: number;
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
    return text
      .replace(/\r\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
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
  const cashAdvanceHeight = 220;
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

  cashAdvY -= 25;

  // Payee section
  if (data.payeeEsig) {
    try {
      const esigImage = await pdfDoc.embedPng(data.payeeEsig);
      const esigDims = esigImage.scale(0.35);
      page.drawImage(esigImage, {
        x: leftColX + 20,
        y: cashAdvY,
        width: esigDims.width,
        height: esigDims.height,
      });
    } catch (error) {
      console.error('Error embedding payee e-signature:', error);
    }
  }

  cashAdvY -= 15;
  drawText(data.payee, leftColX, cashAdvY, 9, false);
  cashAdvY -= 15;
  drawText('Payee', leftColX, cashAdvY, 9, true);

  // Right side: Accounting Department info
  // Get last approver for date
  const lastApprover = data.approvals[data.approvals.length - 1];

  let accountingY = yPos - 50;
  drawText('To be filled out by Accounting Department:', rightColX, accountingY, 9, true);
  accountingY -= 25;

  drawText('Outstanding ASL', rightColX, accountingY, 9, true);
  drawText(data.outstandingAsl || 'None', rightColX + 100, accountingY, 9, false);
  accountingY -= 18;

  drawText('Date', rightColX, accountingY, 9, true);
  const approvalDate = lastApprover
    ? new Date(lastApprover.approval_date).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      new Date(lastApprover.approval_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : data.outstandingAslDate;
  drawText(approvalDate, rightColX + 100, accountingY, 9, false);
  accountingY -= 18;

  drawText('Remarks', rightColX, accountingY, 9, true);
  drawText(data.remarks || 'OK', rightColX + 100, accountingY, 9, false);
  accountingY -= 35;

  // Accounting signature (last approver)
  if (lastApprover && lastApprover.approver_esig) {
    try {
      const esigImage = await pdfDoc.embedPng(lastApprover.approver_esig);
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
  if (lastApprover) {
    drawText(lastApprover.approver_name, rightColX, accountingY, 9, false);
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

  // Get approvers (excluding the last one who is Accounting)
  const approvalApprovers = data.approvals.slice(0, -1);
  const firstApprover = approvalApprovers[0];
  const middleApprovers = approvalApprovers.slice(1);

  // Draw headers
  drawText('Recommended By', recByX, approvalY, 10, true);
  drawText('Approved By', app1X, approvalY, 10, true);

  approvalY -= 50;

  // Draw first approver (Recommended By)
  if (firstApprover) {
    if (firstApprover.approver_esig) {
      try {
        const esigImage = await pdfDoc.embedPng(firstApprover.approver_esig);
        const esigDims = esigImage.scale(0.35);
        page.drawImage(esigImage, {
          x: recByX + 15,
          y: approvalY - 10,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding first approver e-signature:', error);
      }
    }

    drawText(firstApprover.approver_name, recByX, approvalY - 30, 9, false);
    const firstApprovalDate = new Date(firstApprover.approval_date);
    drawText(
      firstApprovalDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      firstApprovalDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      recByX, approvalY - 45, 8, false
    );
  }

  // Draw middle approvers (Approved By section - max 2)
  if (middleApprovers.length > 0) {
    const approver1 = middleApprovers[0];
    if (approver1.approver_esig) {
      try {
        const esigImage = await pdfDoc.embedPng(approver1.approver_esig);
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
    const approver1Date = new Date(approver1.approval_date);
    drawText(
      approver1Date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      approver1Date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      app1X, approvalY - 45, 8, false
    );
  }

  if (middleApprovers.length > 1) {
    const approver2 = middleApprovers[1];
    if (approver2.approver_esig) {
      try {
        const esigImage = await pdfDoc.embedPng(approver2.approver_esig);
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
    const approver2Date = new Date(approver2.approval_date);
    drawText(
      approver2Date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
      approver2Date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      app2X, approvalY - 45, 8, false
    );
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
