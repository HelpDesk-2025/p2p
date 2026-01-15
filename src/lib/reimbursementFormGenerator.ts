import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface ExpenseItem {
  date: string;
  description: string;
  amount: number;
}

interface ApprovalRecord {
  approver_name: string;
  approver_esig: string | null;
  approval_date: string;
  sequence: number;
}

interface ReimbursementFormData {
  reimbNumber: string;
  requestType: string;
  requestedBy: string;
  requestDate: string;
  company: string;
  department: string;
  linkedRequestNumber?: string;
  purpose: string;
  expenseItems: ExpenseItem[];
  totalExpenditures: number;
  cashAdvance: number;
  netAmount: number;
  payee: string;
  payeeEsig: string | null;
  approvals: ApprovalRecord[];
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

  // Header: Title and Document No.
  drawBox(margin, yPos - 30, width - 2 * margin, 30);
  const titleText = `${data.requestType} Request`;
  drawText(titleText, margin + 10, yPos - 20, 14, true);
  drawText(`${data.requestType === 'Liquidation' ? 'Liquidation' : 'Reimbursement'} No.: ${data.reimbNumber}`,
    width - margin - 200, yPos - 20, 10, false);
  yPos -= 30;

  // First section: Request details
  const sectionHeight = data.linkedRequestNumber ? 140 : 120;
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

  drawText('Company', leftColX, detailY, 10, true);
  drawText(data.company, leftColX + valueOffset, detailY, 10, false);
  drawText('Department', rightColX, detailY, 10, true);
  drawText(data.department, rightColX + 85, detailY, 10, false);
  detailY -= 20;

  if (data.linkedRequestNumber) {
    drawText('Linked Request', leftColX, detailY, 10, true);
    drawText(data.linkedRequestNumber, leftColX + valueOffset, detailY, 10, false);
    detailY -= 20;
  }

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

  // Expense Itemization section
  const itemsPerPage = 8;
  const itemHeight = 15;
  const headerHeight = 20;
  const footerHeight = 60;
  const expenseTableHeight = headerHeight + (Math.min(data.expenseItems.length, itemsPerPage) * itemHeight) + footerHeight;

  drawBox(margin, yPos - expenseTableHeight, width - 2 * margin, expenseTableHeight);

  let expenseY = yPos - 15;

  // Table header
  drawText('Expense Itemization', margin + 10, expenseY, 11, true);
  expenseY -= headerHeight;

  // Draw table header line
  drawLine(margin, expenseY + 5, width - margin, expenseY + 5);

  // Column headers
  const dateColX = margin + 10;
  const descColX = margin + 100;
  const amountColX = width - margin - 100;

  drawText('Date', dateColX, expenseY, 9, true);
  drawText('Supplier Name/Vendor Name', descColX, expenseY, 9, true);
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
  expenseY -= 18;

  // Draw final line
  drawLine(amountColX - 160, expenseY + 5, width - margin - 10, expenseY + 5);
  expenseY -= 5;

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

  // Calculate column widths based on number of approvers
  const totalApprovers = data.approvals.length + 1; // +1 for payee
  const colWidth = (width - 2 * margin) / totalApprovers;

  // Draw headers
  drawText('Payee', leftColX, signatoryY, 10, true);

  for (let i = 0; i < data.approvals.length; i++) {
    const colX = margin + ((i + 1) * colWidth) + 10;
    const label = i === 0 ? 'Recommended By' : 'Approved By';
    drawText(label, colX, signatoryY, 10, true);
  }

  signatoryY -= 50;

  // Draw payee signature
  if (data.payeeEsig) {
    try {
      const esigImage = await pdfDoc.embedPng(data.payeeEsig);
      const esigDims = esigImage.scale(0.35);
      page.drawImage(esigImage, {
        x: leftColX + 15,
        y: signatoryY - 10,
        width: esigDims.width,
        height: esigDims.height,
      });
    } catch (error) {
      console.error('Error embedding payee e-signature:', error);
    }
  }

  drawText(data.payee, leftColX, signatoryY - 30, 9, false);
  drawText(data.requestDate, leftColX, signatoryY - 45, 8, false);

  // Draw approver signatures
  for (let i = 0; i < data.approvals.length; i++) {
    const approver = data.approvals[i];
    const colX = margin + ((i + 1) * colWidth) + 10;

    if (approver.approver_esig) {
      try {
        const esigImage = await pdfDoc.embedPng(approver.approver_esig);
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
    drawText(new Date(approver.approval_date).toLocaleDateString(), colX, signatoryY - 45, 8, false);
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
