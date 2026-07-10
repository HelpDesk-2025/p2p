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

interface ExpenseTypeItem {
  expense_type_id: string;
  expense_type_name: string;
  sub_item_name: string;
  status: string;
  specify_value?: string;
}

interface LinkedPettyCashRequest {
  pcNumber: string;
  requestDate: string;
  amount: number;
  purpose: string;
  payee: string;
  status: string;
}

interface ApproverSignatory {
  name: string;
  esig: string | null;
  date: string;
  label?: string;
}

interface LiquidationFormData {
  pcNumber: string;
  accountable: string;
  requestDate: string;
  purpose: string;
  cashAdvanceAmount: number;
  expenseItems: ExpenseItem[];
  expenseTypeItems?: ExpenseTypeItem[];
  noOfPax: number;
  dateOfTransaction: string;
  company: string;
  department: string;
  totalExpenses: number;
  cashAdvanceReceived: number;
  balance: number;
  preparedByName: string;
  preparedByEsig: string | null;
  preparedByDate: string;
  approvedByName: string;
  approvedByEsig: string | null;
  approvedByDate: string;
  approvers?: ApproverSignatory[];
  linkedPettyCashRequest?: LinkedPettyCashRequest | null;
}

function sanitizeText(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return '';
  const str = typeof text === 'number' ? text.toString() : String(text);
  if (!str) return '';

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

function wrapText(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  const avgCharWidth = fontSize * 0.5;

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = testLine.length * avgCharWidth;

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

export async function generateLiquidationForm(data: LiquidationFormData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 50;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let currentY = pageHeight - margin;

  const leftCol = margin;
  const rightCol = pageWidth / 2 + 30;

  // Space needed for summary + signatures
  const summaryAndSignatureSpace = 220;

  page.drawText(sanitizeText(data.company), {
    x: margin,
    y: currentY,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  currentY -= 25;

  page.drawText('LIQUIDATION REPORT', {
    x: pageWidth / 2 - 90,
    y: currentY,
    size: 16,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  currentY -= 30;

  page.drawLine({
    start: { x: margin, y: currentY },
    end: { x: pageWidth - margin, y: currentY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  currentY -= 20;

  page.drawText('Document No:', { x: leftCol, y: currentY, size: 10, font: boldFont });
  page.drawText(sanitizeText(data.pcNumber), { x: leftCol + 90, y: currentY, size: 10, font });

  page.drawText('Date:', { x: rightCol, y: currentY, size: 10, font: boldFont });
  page.drawText(sanitizeText(data.requestDate), { x: rightCol + 40, y: currentY, size: 10, font });
  currentY -= 15;

  page.drawText('Accountable Person:', { x: leftCol, y: currentY, size: 10, font: boldFont });
  page.drawText(sanitizeText(data.accountable), { x: leftCol + 120, y: currentY, size: 10, font });
  currentY -= 15;

  page.drawText('Department:', { x: leftCol, y: currentY, size: 10, font: boldFont });
  page.drawText(sanitizeText(data.department), { x: leftCol + 90, y: currentY, size: 10, font });
  currentY -= 15;

  page.drawText('Purpose:', { x: leftCol, y: currentY, size: 10, font: boldFont });
  const maxPurposeWidth = pageWidth - margin - leftCol - 80;
  const purposeLines = wrapText(sanitizeText(data.purpose), maxPurposeWidth, 10, font);
  purposeLines.forEach((line, index) => {
    page.drawText(line, {
      x: leftCol + (index === 0 ? 60 : 0),
      y: currentY - (index * 12),
      size: 10,
      font
    });
  });
  currentY -= (purposeLines.length * 12) + 10;

  page.drawText('Date of Transaction:', { x: leftCol, y: currentY, size: 10, font: boldFont });
  page.drawText(sanitizeText(data.dateOfTransaction), { x: leftCol + 130, y: currentY, size: 10, font });
  currentY -= 15;

  page.drawText('No. of Pax:', { x: leftCol, y: currentY, size: 10, font: boldFont });
  page.drawText(sanitizeText(data.noOfPax), { x: leftCol + 70, y: currentY, size: 10, font });
  currentY -= 25;

  if (data.linkedPettyCashRequest) {
    page.drawRectangle({
      x: margin,
      y: currentY - 75,
      width: pageWidth - 2 * margin,
      height: 85,
      color: rgb(0.95, 0.98, 0.95),
      borderColor: rgb(0.7, 0.85, 0.7),
      borderWidth: 1,
    });
    currentY -= 10;

    page.drawText('Linked Petty Cash Advance Request', {
      x: leftCol + 5,
      y: currentY,
      size: 10,
      font: boldFont,
      color: rgb(0, 0.5, 0),
    });
    currentY -= 18;

    const col1X = leftCol + 10;
    const col1ValueX = col1X + 110;
    const col2X = leftCol + 280;
    const col2ValueX = col2X + 90;

    page.drawText('PC Number:', { x: col1X, y: currentY, size: 8, font: boldFont });
    page.drawText(sanitizeText(data.linkedPettyCashRequest.pcNumber), { x: col1ValueX, y: currentY, size: 8, font });

    page.drawText('Request Date:', { x: col2X, y: currentY, size: 8, font: boldFont });
    page.drawText(sanitizeText(data.linkedPettyCashRequest.requestDate), { x: col2ValueX, y: currentY, size: 8, font });
    currentY -= 14;

    page.drawText('Advance Amount:', { x: col1X, y: currentY, size: 8, font: boldFont });
    page.drawText(`PHP ${sanitizeText(data.linkedPettyCashRequest.amount.toFixed(2))}`, { x: col1ValueX, y: currentY, size: 8, font });

    page.drawText('Status:', { x: col2X, y: currentY, size: 8, font: boldFont });
    page.drawText(sanitizeText(data.linkedPettyCashRequest.status), { x: col2ValueX, y: currentY, size: 8, font, color: rgb(0, 0.6, 0) });
    currentY -= 14;

    page.drawText('Purpose:', { x: col1X, y: currentY, size: 8, font: boldFont });
    const purposeText = sanitizeText(data.linkedPettyCashRequest.purpose);
    const maxPurposeLen = 60;
    const displayPurpose = purposeText.length > maxPurposeLen
      ? purposeText.substring(0, maxPurposeLen) + '...'
      : purposeText;
    page.drawText(displayPurpose, { x: col1ValueX, y: currentY, size: 8, font });
    currentY -= 14;

    page.drawText('Payee:', { x: col1X, y: currentY, size: 8, font: boldFont });
    page.drawText(sanitizeText(data.linkedPettyCashRequest.payee), { x: col1ValueX, y: currentY, size: 8, font });
    currentY -= 25;
  }

  // EXPENSE ITEMS section with multi-page support
  page.drawText('EXPENSE ITEMS', {
    x: leftCol,
    y: currentY,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  currentY -= 20;

  const tableX = margin;
  const colWidths = {
    date: 80,
    description: 280,
    amount: 100,
  };
  const tableWidth = colWidths.date + colWidths.description + colWidths.amount;

  const drawExpenseTableHeader = (p: PDFPage, y: number): number => {
    p.drawRectangle({
      x: tableX,
      y: y - 15,
      width: tableWidth,
      height: 18,
      color: rgb(0.9, 0.9, 0.9),
    });

    p.drawText('Date', { x: tableX + 5, y: y, size: 9, font: boldFont });
    p.drawText('Description', { x: tableX + colWidths.date + 5, y: y, size: 9, font: boldFont });
    p.drawText('Amount', { x: tableX + colWidths.date + colWidths.description + 5, y: y, size: 9, font: boldFont });
    y -= 18;

    p.drawLine({
      start: { x: tableX, y: y },
      end: { x: tableX + tableWidth, y: y },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    y -= 12;
    return y;
  };

  currentY = drawExpenseTableHeader(page, currentY);

  for (let idx = 0; idx < data.expenseItems.length; idx++) {
    const item = data.expenseItems[idx];
    const descLines = wrapText(sanitizeText(item.description), colWidths.description - 10, 8, font);
    const rowHeight = Math.max(15, descLines.length * 10);

    // Check if we need a new page
    if (currentY - rowHeight < margin + summaryAndSignatureSpace) {
      page.drawText('(continued on next page...)', { x: tableX + 5, y: currentY, size: 7, font });

      page = pdfDoc.addPage([pageWidth, pageHeight]);
      currentY = pageHeight - margin;

      page.drawText(sanitizeText(data.company), {
        x: margin, y: currentY, size: 10, font: boldFont, color: rgb(0, 0, 0),
      });
      page.drawText(`LIQUIDATION REPORT - ${sanitizeText(data.pcNumber)} (continued)`, {
        x: margin, y: currentY - 15, size: 10, font: boldFont, color: rgb(0, 0, 0),
      });
      currentY -= 35;

      currentY = drawExpenseTableHeader(page, currentY);
    }

    const rowY = currentY;
    page.drawText(sanitizeText(item.date), { x: tableX + 5, y: rowY, size: 8, font });

    descLines.forEach((line, lineIndex) => {
      if (lineIndex < 2) {
        page.drawText(line, { x: tableX + colWidths.date + 5, y: rowY - (lineIndex * 10), size: 8, font });
      }
    });

    page.drawText(sanitizeText(item.amount.toFixed(2)), {
      x: tableX + colWidths.date + colWidths.description + 5,
      y: rowY,
      size: 8,
      font
    });

    currentY -= rowHeight;

    if (idx < data.expenseItems.length - 1) {
      page.drawLine({
        start: { x: tableX, y: currentY + 3 },
        end: { x: tableX + tableWidth, y: currentY + 3 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
    }
  }

  currentY -= 10;

  page.drawLine({
    start: { x: tableX, y: currentY },
    end: { x: tableX + tableWidth, y: currentY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  currentY -= 20;

  // Expense type breakdown
  if (data.expenseTypeItems && data.expenseTypeItems.length > 0) {
    if (currentY < margin + summaryAndSignatureSpace + (data.expenseTypeItems.length * 12)) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      currentY = pageHeight - margin;
    }

    page.drawText('EXPENSE TYPE BREAKDOWN', {
      x: leftCol,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    currentY -= 15;

    for (const item of data.expenseTypeItems) {
      if (currentY < margin + summaryAndSignatureSpace) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        currentY = pageHeight - margin;
      }

      const itemText = `${item.expense_type_name} - ${item.sub_item_name}${
        item.specify_value ? `: ${item.specify_value}` : ''
      }`;

      page.drawText(sanitizeText(itemText), {
        x: leftCol + 10,
        y: currentY,
        size: 8,
        font
      });
      currentY -= 12;
    }
    currentY -= 8;
  }

  // Check if summary + signatures fit on current page
  if (currentY < margin + 180) {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    currentY = pageHeight - margin;
  }

  // Summary section
  const summaryX = pageWidth - margin - 200;

  page.drawText('Cash Advance Received:', { x: summaryX, y: currentY, size: 10, font: boldFont });
  page.drawText(sanitizeText(data.cashAdvanceReceived.toFixed(2)), {
    x: summaryX + 150,
    y: currentY,
    size: 10,
    font
  });
  currentY -= 15;

  page.drawText('Total Expenses:', { x: summaryX, y: currentY, size: 10, font: boldFont });
  page.drawText(sanitizeText(data.totalExpenses.toFixed(2)), {
    x: summaryX + 150,
    y: currentY,
    size: 10,
    font
  });
  currentY -= 15;

  page.drawLine({
    start: { x: summaryX, y: currentY },
    end: { x: pageWidth - margin, y: currentY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  currentY -= 18;

  const balanceLabel = data.balance >= 0 ? 'Amount to Return:' : 'Amount to Reimburse:';
  page.drawText(balanceLabel, { x: summaryX, y: currentY, size: 10, font: boldFont });
  page.drawText(sanitizeText(Math.abs(data.balance).toFixed(2)), {
    x: summaryX + 150,
    y: currentY,
    size: 10,
    font,
    color: data.balance >= 0 ? rgb(0.8, 0, 0) : rgb(0, 0.6, 0)
  });
  currentY -= 40;

  // Signatures - build list of all signatories
  const signatories: { label: string; name: string; esig: string | null; date: string }[] = [];

  signatories.push({
    label: 'Prepared by',
    name: data.preparedByName,
    esig: data.preparedByEsig,
    date: data.preparedByDate,
  });

  if (data.approvers && data.approvers.length > 0) {
    for (const approver of data.approvers) {
      signatories.push({
        label: approver.label || 'Approved by',
        name: approver.name,
        esig: approver.esig,
        date: approver.date,
      });
    }
  } else {
    signatories.push({
      label: 'Approved by',
      name: data.approvedByName,
      esig: data.approvedByEsig,
      date: data.approvedByDate,
    });
  }

  const sigWidth = 200;
  const sigHeight = 80;
  const sigRowHeight = sigHeight + 40;
  const cols = 2;
  const colSpacing = (pageWidth - 2 * margin) / cols;

  for (let i = 0; i < signatories.length; i++) {
    const col = i % cols;
    if (col === 0 && i > 0) {
      currentY -= sigRowHeight;
    }
    if (currentY - sigRowHeight < margin + 20) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      currentY = pageHeight - margin;
    }

    const sigX = margin + col * colSpacing + 15;
    const sig = signatories[i];

    page.drawText(`${sig.label}:`, { x: sigX, y: currentY, size: 9, font: boldFont });
    if (sig.esig) {
      try {
        const esigImage = await embedSignatureImage(pdfDoc, sig.esig);
        const esigDims = esigImage.scale(0.4);
        page.drawImage(esigImage, {
          x: sigX + 10,
          y: currentY - sigHeight + 10,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding e-signature:', error);
      }
    }
    page.drawLine({
      start: { x: sigX, y: currentY - sigHeight },
      end: { x: sigX + sigWidth, y: currentY - sigHeight },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    page.drawText(sanitizeText(sig.name), {
      x: sigX,
      y: currentY - sigHeight - 12,
      size: 9,
      font: boldFont,
    });
    page.drawText(sanitizeText(sig.date), {
      x: sigX,
      y: currentY - sigHeight - 24,
      size: 8,
      font,
    });
  }
  if (signatories.length % cols !== 0 || signatories.length > 0) {
    currentY -= sigRowHeight;
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
