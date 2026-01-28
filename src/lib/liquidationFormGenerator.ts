import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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
  linkedPettyCashRequest?: LinkedPettyCashRequest | null;
}

export async function generateLiquidationForm(data: LiquidationFormData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 50;

  const sanitizeText = (text: string | number | null | undefined): string => {
    if (text === null || text === undefined) return '';
    const str = typeof text === 'number' ? text.toString() : text;
    if (!str) return '';

    // First normalize Unicode characters to their closest ASCII equivalents
    let sanitized = str
      .normalize('NFD') // Decompose combined characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/\r\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, ''); // Remove control chars

    // Replace common problematic characters with safe alternatives
    sanitized = sanitized
      .replace(/[""]/g, '"') // Smart quotes
      .replace(/['']/g, "'") // Smart apostrophes
      .replace(/[–—]/g, '-') // En dash, em dash
      .replace(/…/g, '...') // Ellipsis
      .replace(/™/g, '(TM)').replace(/®/g, '(R)').replace(/©/g, '(C)') // Symbols
      .replace(/€/g, 'EUR').replace(/£/g, 'GBP').replace(/¥/g, 'JPY'); // Currency

    // Remove any remaining characters outside WinAnsi safe range
    sanitized = sanitized.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

    return sanitized;
  };

  let currentY = height - margin;

  page.drawText(sanitizeText(data.company), {
    x: margin,
    y: currentY,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  currentY -= 25;

  page.drawText('LIQUIDATION REPORT', {
    x: width / 2 - 90,
    y: currentY,
    size: 16,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  currentY -= 30;

  page.drawLine({
    start: { x: margin, y: currentY },
    end: { x: width - margin, y: currentY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  currentY -= 20;

  const leftCol = margin;
  const rightCol = width / 2 + 30;

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
  const maxPurposeWidth = width - margin - leftCol - 80;
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
      width: width - 2 * margin,
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

  page.drawRectangle({
    x: tableX,
    y: currentY - 15,
    width: colWidths.date + colWidths.description + colWidths.amount,
    height: 18,
    color: rgb(0.9, 0.9, 0.9),
  });

  page.drawText('Date', { x: tableX + 5, y: currentY, size: 9, font: boldFont });
  page.drawText('Description', { x: tableX + colWidths.date + 5, y: currentY, size: 9, font: boldFont });
  page.drawText('Amount', { x: tableX + colWidths.date + colWidths.description + 5, y: currentY, size: 9, font: boldFont });
  currentY -= 18;

  page.drawLine({
    start: { x: tableX, y: currentY },
    end: { x: tableX + colWidths.date + colWidths.description + colWidths.amount, y: currentY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  currentY -= 12;

  data.expenseItems.forEach((item, index) => {
    if (currentY < margin + 80) {
      return;
    }

    const rowY = currentY;
    page.drawText(sanitizeText(item.date), { x: tableX + 5, y: rowY, size: 8, font });

    const descLines = wrapText(sanitizeText(item.description), colWidths.description - 10, 8, font);
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

    currentY -= Math.max(15, descLines.length * 10);

    if (index < data.expenseItems.length - 1 && currentY > margin + 80) {
      page.drawLine({
        start: { x: tableX, y: currentY + 3 },
        end: { x: tableX + colWidths.date + colWidths.description + colWidths.amount, y: currentY + 3 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
    }
  });

  currentY -= 10;

  page.drawLine({
    start: { x: tableX, y: currentY },
    end: { x: tableX + colWidths.date + colWidths.description + colWidths.amount, y: currentY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  currentY -= 20;

  if (data.expenseTypeItems && data.expenseTypeItems.length > 0) {
    page.drawText('EXPENSE TYPE BREAKDOWN', {
      x: leftCol,
      y: currentY,
      size: 10,
      font: boldFont,
    });
    currentY -= 15;

    data.expenseTypeItems.forEach((item) => {
      if (currentY < margin + 80) return;

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
    });
    currentY -= 8;
  }

  const summaryX = width - margin - 200;

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
    end: { x: width - margin, y: currentY },
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

  const sigWidth = 200;
  const sigHeight = 80;
  const sig1X = margin + 30;
  const sig2X = width - margin - sigWidth - 30;

  page.drawText('Prepared by:', { x: sig1X, y: currentY, size: 9, font: boldFont });
  if (data.preparedByEsig) {
    try {
      const esigImageBytes = Uint8Array.from(atob(data.preparedByEsig.split(',')[1]), c => c.charCodeAt(0));
      const esigImage = await pdfDoc.embedPng(esigImageBytes);
      const esigDims = esigImage.scale(0.4);
      page.drawImage(esigImage, {
        x: sig1X + 10,
        y: currentY - sigHeight + 10,
        width: esigDims.width,
        height: esigDims.height,
      });
    } catch (error) {
      console.error('Error embedding e-signature:', error);
    }
  }
  page.drawLine({
    start: { x: sig1X, y: currentY - sigHeight },
    end: { x: sig1X + sigWidth, y: currentY - sigHeight },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  page.drawText(sanitizeText(data.preparedByName), {
    x: sig1X,
    y: currentY - sigHeight - 12,
    size: 9,
    font: boldFont
  });
  page.drawText(sanitizeText(data.preparedByDate), {
    x: sig1X,
    y: currentY - sigHeight - 24,
    size: 8,
    font
  });

  page.drawText('Approved by:', { x: sig2X, y: currentY, size: 9, font: boldFont });
  if (data.approvedByEsig) {
    try {
      const esigImageBytes = Uint8Array.from(atob(data.approvedByEsig.split(',')[1]), c => c.charCodeAt(0));
      const esigImage = await pdfDoc.embedPng(esigImageBytes);
      const esigDims = esigImage.scale(0.4);
      page.drawImage(esigImage, {
        x: sig2X + 10,
        y: currentY - sigHeight + 10,
        width: esigDims.width,
        height: esigDims.height,
      });
    } catch (error) {
      console.error('Error embedding e-signature:', error);
    }
  }
  page.drawLine({
    start: { x: sig2X, y: currentY - sigHeight },
    end: { x: sig2X + sigWidth, y: currentY - sigHeight },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  page.drawText(sanitizeText(data.approvedByName), {
    x: sig2X,
    y: currentY - sigHeight - 12,
    size: 9,
    font: boldFont
  });
  page.drawText(sanitizeText(data.approvedByDate), {
    x: sig2X,
    y: currentY - sigHeight - 24,
    size: 8,
    font
  });

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

function wrapText(text: string, maxWidth: number, fontSize: number, font: any): string[] {
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
