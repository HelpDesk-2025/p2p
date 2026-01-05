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
  drawText(data.requestDate, rightColX + 50, detailY, 10, false);
  detailY -= 20;

  drawText('Amount', leftColX, detailY, 10, true);
  drawText(data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    leftColX + valueOffset, detailY, 10, false);
  drawText('Company', rightColX, detailY, 10, true);
  drawText(data.company, rightColX + 50, detailY, 10, false);
  detailY -= 20;

  drawText('', leftColX, detailY, 10, true);
  drawText('Department', rightColX, detailY, 10, true);
  drawText(data.department, rightColX + 50, detailY, 10, false);
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

  yPos -= sectionHeight;

  // Cash Advance section
  const cashAdvanceHeight = 200;
  drawBox(margin, yPos - cashAdvanceHeight, width - 2 * margin, cashAdvanceHeight);

  const midX = width / 2;
  drawLine(midX, yPos - cashAdvanceHeight, midX, yPos);

  let cashAdvY = yPos - 20;
  const centerX = width / 2;
  const titleWidth = boldFont.widthOfTextAtSize('Cash Advance', 11);
  drawText('Cash Advance', centerX - titleWidth / 2, cashAdvY, 11, true);
  cashAdvY -= 25;

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
    cashAdvY -= 12;
  }

  cashAdvY -= 30;

  // Payee section
  if (data.payeeEsig) {
    try {
      const esigImage = await pdfDoc.embedPng(data.payeeEsig);
      const esigDims = esigImage.scale(0.15);
      page.drawImage(esigImage, {
        x: leftColX + 20,
        y: cashAdvY - 5,
        width: esigDims.width,
        height: esigDims.height,
      });
    } catch (error) {
      console.error('Error embedding payee e-signature:', error);
    }
  }

  cashAdvY -= 25;
  drawText(data.payee, leftColX, cashAdvY, 9, false);
  cashAdvY -= 15;
  drawText('Payee', leftColX, cashAdvY, 9, true);

  // Right side: Accounting Department info
  let accountingY = yPos - 45;
  drawText('To be filled out by Accounting Department:', rightColX, accountingY, 9, true);
  accountingY -= 20;

  drawText('Outstanding ASL', rightColX, accountingY, 9, true);
  drawText(data.outstandingAsl || 'None', rightColX + 100, accountingY, 9, false);
  accountingY -= 15;

  drawText('Date', rightColX, accountingY, 9, true);
  drawText(data.outstandingAslDate, rightColX + 100, accountingY, 9, false);
  accountingY -= 15;

  drawText('Remarks', rightColX, accountingY, 9, true);
  drawText(data.remarks || 'OK', rightColX + 100, accountingY, 9, false);
  accountingY -= 40;

  // Accounting signature (last approver)
  const lastApprover = data.approvals[data.approvals.length - 1];
  if (lastApprover && lastApprover.approver_esig) {
    try {
      const esigImage = await pdfDoc.embedPng(lastApprover.approver_esig);
      const esigDims = esigImage.scale(0.15);
      page.drawImage(esigImage, {
        x: rightColX + 20,
        y: accountingY - 5,
        width: esigDims.width,
        height: esigDims.height,
      });
    } catch (error) {
      console.error('Error embedding accounting e-signature:', error);
    }
  }

  accountingY -= 25;
  if (lastApprover) {
    drawText(lastApprover.approver_name, rightColX, accountingY, 9, false);
  }
  accountingY -= 15;
  drawText('Accounting', rightColX, accountingY, 9, true);

  yPos -= cashAdvanceHeight;

  // Approval section
  const approvalHeight = 200;
  drawBox(margin, yPos - approvalHeight, width - 2 * margin, approvalHeight);

  let approvalY = yPos - 20;

  // Recommended By (first approver)
  drawText('Recommended By', leftColX, approvalY, 10, true);

  // Approved By (middle approvers)
  const approvedByX = width / 2 - 50;
  drawText('Approved By', approvedByX, approvalY, 10, true);

  approvalY -= 30;

  // Draw first approver (Recommended By)
  if (data.approvals.length > 0) {
    const firstApprover = data.approvals[0];
    if (firstApprover.approver_esig) {
      try {
        const esigImage = await pdfDoc.embedPng(firstApprover.approver_esig);
        const esigDims = esigImage.scale(0.15);
        page.drawImage(esigImage, {
          x: leftColX + 20,
          y: approvalY,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding first approver e-signature:', error);
      }
    }

    drawText(firstApprover.approver_name, leftColX, approvalY - 30, 9, false);
    drawText(new Date(firstApprover.approval_date).toLocaleDateString(), leftColX, approvalY - 45, 9, false);
  }

  // Draw middle approvers (Approved By section)
  const middleApprovers = data.approvals.slice(1, -1);
  let approvedByY = approvalY;

  for (let i = 0; i < middleApprovers.length; i++) {
    const approver = middleApprovers[i];
    const approverX = i % 2 === 0 ? approvedByX : width - margin - 120;
    const currentY = approvedByY - Math.floor(i / 2) * 80;

    if (approver.approver_esig) {
      try {
        const esigImage = await pdfDoc.embedPng(approver.approver_esig);
        const esigDims = esigImage.scale(0.15);
        page.drawImage(esigImage, {
          x: approverX + 10,
          y: currentY,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding middle approver e-signature:', error);
      }
    }

    drawText(approver.approver_name, approverX, currentY - 30, 9, false);
    drawText(new Date(approver.approval_date).toLocaleDateString(), approverX, currentY - 45, 9, false);
  }

  // Additional "Approved By" label if needed
  if (middleApprovers.length > 0) {
    approvalY -= 80;
    drawText('Approved By', leftColX, approvalY, 10, true);

    approvalY -= 30;

    // Draw rest of middle approvers in this section
    for (let i = 2; i < middleApprovers.length; i++) {
      const approver = middleApprovers[i];

      if (approver.approver_esig) {
        try {
          const esigImage = await pdfDoc.embedPng(approver.approver_esig);
          const esigDims = esigImage.scale(0.15);
          page.drawImage(esigImage, {
            x: leftColX + 20,
            y: approvalY,
            width: esigDims.width,
            height: esigDims.height,
          });
        } catch (error) {
          console.error('Error embedding additional approver e-signature:', error);
        }
      }

      drawText(approver.approver_name, leftColX, approvalY - 30, 9, false);
      drawText(new Date(approver.approval_date).toLocaleDateString(), leftColX, approvalY - 45, 9, false);
      approvalY -= 70;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
