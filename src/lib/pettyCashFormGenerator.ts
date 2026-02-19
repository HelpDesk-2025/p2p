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

interface ExpenseTypeItem {
  expense_type_id: string;
  expense_type_name: string;
  sub_item_name: string;
  status: string;
  specify_value?: string;
}

interface PettyCashFormData {
  pcNumber: string;
  recipient: string;
  requestDate: string;
  requestType: string;
  purpose: string;
  expenseTypeItems?: ExpenseTypeItem[];
  noOfPax: number;
  dateOfTransaction: string;
  company: string;
  department: string;
  amount: number;
  approvedByName: string;
  approvedByEsig: string | null;
  approvedByDate: string;
  receivedByName: string;
  receivedByEsig: string | null;
  receivedByDate: string;
}

export async function generatePettyCashForm(data: PettyCashFormData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 100;

  const sanitizeText = (text: string | number | null | undefined): string => {
    if (text === null || text === undefined) return '';
    const str = typeof text === 'number' ? text.toString() : String(text);
    if (!str) return '';

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

  // Sanitize all input data upfront
  const sanitizedData = {
    pcNumber: sanitizeText(data.pcNumber),
    recipient: sanitizeText(data.recipient),
    requestDate: sanitizeText(data.requestDate),
    requestType: sanitizeText(data.requestType),
    purpose: sanitizeText(data.purpose),
    noOfPax: data.noOfPax,
    dateOfTransaction: sanitizeText(data.dateOfTransaction),
    company: sanitizeText(data.company),
    department: sanitizeText(data.department),
    amount: data.amount,
    approvedByName: sanitizeText(data.approvedByName),
    approvedByEsig: data.approvedByEsig,
    approvedByDate: sanitizeText(data.approvedByDate),
    receivedByName: sanitizeText(data.receivedByName),
    receivedByEsig: data.receivedByEsig,
    receivedByDate: sanitizeText(data.receivedByDate),
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

  const drawLine = (x1: number, y1: number, x2: number, y2: number, thickness = 1) => {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness,
      color: rgb(0, 0, 0),
    });
  };

  const boxWidth = width - 2 * margin;
  let yPos = height - 150;

  // Title row with P.C. No.
  const titleY = yPos;
  drawLine(margin, titleY + 35, margin + boxWidth, titleY + 35, 2);
  drawLine(margin, titleY, margin + boxWidth, titleY, 2);
  drawLine(margin, titleY, margin, titleY + 35, 2);
  drawLine(margin + boxWidth, titleY, margin + boxWidth, titleY + 35, 2);

  const titleText = 'Petty Cash';
  const titleWidth = boldFont.widthOfTextAtSize(titleText, 18);
  drawText(titleText, margin + 20, titleY + 10, 18, true);

  drawText('P.C. No.:', margin + boxWidth - 180, titleY + 10, 11, false);
  drawText(sanitizedData.pcNumber, margin + boxWidth - 120, titleY + 10, 11, false);

  yPos = titleY;

  // To/Recipient and Date row
  drawLine(margin, yPos - 30, margin + boxWidth, yPos - 30);
  const midX = margin + boxWidth / 2;
  drawLine(midX, yPos, midX, yPos - 30);

  drawText('To:', margin + 10, yPos - 20, 11, false);
  drawText(sanitizedData.recipient, margin + 40, yPos - 20, 11, false);
  drawText('Date', midX + 10, yPos - 20, 11, false);
  drawText(sanitizedData.requestDate, midX + 50, yPos - 20, 11, false);

  yPos -= 30;

  // Particulars and Amount header row
  drawLine(margin, yPos - 30, margin + boxWidth, yPos - 30);
  drawLine(midX, yPos, midX, yPos - 30);

  const particularText = 'Particulars';
  const particularWidth = boldFont.widthOfTextAtSize(particularText, 11);
  const leftColumnCenter = (margin + midX) / 2;
  drawText(particularText, leftColumnCenter - particularWidth / 2, yPos - 20, 11, true);

  const amountText = 'Amount';
  const amountWidth = boldFont.widthOfTextAtSize(amountText, 11);
  drawText(amountText, (midX + margin + boxWidth) / 2 - amountWidth / 2, yPos - 20, 11, true);

  yPos -= 30;

  // Large content area for particulars and amount
  const contentHeight = 200;
  drawLine(margin, yPos - contentHeight, margin + boxWidth, yPos - contentHeight);
  drawLine(midX, yPos, midX, yPos - contentHeight);

  // Draw particulars with label-value pairs
  let particularY = yPos - 20;
  const labelX = margin + 15;
  const valueX = margin + 110;
  const lineSpacing = 16;

  // Type of Request
  drawText('Type of Request :', labelX, particularY, 10, false);
  drawText(sanitizedData.requestType, valueX, particularY, 10, false);
  particularY -= lineSpacing;

  // Purpose - show expense type items if available, otherwise show purpose text
  drawText('Purpose :', labelX, particularY, 10, false);
  let purposeY = particularY;

  if (data.expenseTypeItems && data.expenseTypeItems.length > 0) {
    // Display expense type items
    for (const item of data.expenseTypeItems) {
      const expenseText = `${sanitizeText(item.expense_type_name)} : ${sanitizeText(item.sub_item_name)}`;
      drawText(expenseText, valueX, purposeY, 10, false);
      purposeY -= lineSpacing;
    }
  } else {
    // Display purpose text with word wrap
    const maxPurposeWidth = boxWidth / 2 - 130;
    const purposeWords = sanitizedData.purpose.split(' ');
    let currentPurposeLine = '';

    for (const word of purposeWords) {
      const testLine = currentPurposeLine + (currentPurposeLine ? ' ' : '') + word;
      const lineWidth = font.widthOfTextAtSize(testLine, 10);

      if (lineWidth > maxPurposeWidth && currentPurposeLine !== '') {
        drawText(currentPurposeLine, valueX, purposeY, 10, false);
        currentPurposeLine = word;
        purposeY -= lineSpacing;
      } else {
        currentPurposeLine = testLine;
      }
    }

    if (currentPurposeLine) {
      drawText(currentPurposeLine, valueX, purposeY, 10, false);
    }
    purposeY -= lineSpacing;
  }

  particularY = purposeY;

  // No. Pax
  drawText('No. Pax :', labelX, particularY, 10, false);
  drawText(sanitizedData.noOfPax.toString(), valueX, particularY, 10, false);
  particularY -= lineSpacing;

  // Date of Transaction
  drawText('Date of Transaction :', labelX, particularY, 10, false);
  drawText(sanitizedData.dateOfTransaction, valueX, particularY, 10, false);
  particularY -= lineSpacing;

  // Company
  drawText('Company :', labelX, particularY, 10, false);
  drawText(sanitizedData.company, valueX, particularY, 10, false);
  particularY -= lineSpacing;

  // Department
  drawText('Department :', labelX, particularY, 10, false);
  drawText(sanitizedData.department, valueX, particularY, 10, false);

  // Draw amount
  const amountStr = sanitizedData.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amountStrWidth = font.widthOfTextAtSize(amountStr, 12);
  drawText(amountStr, (midX + margin + boxWidth) / 2 - amountStrWidth / 2, yPos - 30, 12, false);

  yPos -= contentHeight;

  // Signature section
  const signatureHeight = 130;
  drawLine(margin, yPos - signatureHeight, margin + boxWidth, yPos - signatureHeight, 2);
  drawLine(margin, yPos, margin, yPos - signatureHeight, 2);
  drawLine(margin + boxWidth, yPos, margin + boxWidth, yPos - signatureHeight, 2);
  drawLine(midX, yPos, midX, yPos - signatureHeight);

  // Approved By (left side)
  let leftSigY = yPos - 30;

  if (sanitizedData.approvedByEsig) {
    try {
      const esigImage = await embedSignatureImage(pdfDoc, sanitizedData.approvedByEsig);
      const esigDims = esigImage.scale(0.4);
      page.drawImage(esigImage, {
        x: margin + boxWidth / 4 - esigDims.width / 2,
        y: leftSigY - 15,
        width: esigDims.width,
        height: esigDims.height,
      });
      leftSigY -= esigDims.height + 5;
    } catch (error) {
      console.error('Error embedding approved by e-signature:', error);
      leftSigY -= 40;
    }
  } else {
    leftSigY -= 40;
  }

  const approvedByNameWidth = font.widthOfTextAtSize(sanitizedData.approvedByName, 11);
  drawText(sanitizedData.approvedByName, margin + boxWidth / 4 - approvedByNameWidth / 2, leftSigY, 11, false);

  leftSigY -= 20;
  const approvedByLabelWidth = boldFont.widthOfTextAtSize('Approved By', 11);
  drawText('Approved By', margin + boxWidth / 4 - approvedByLabelWidth / 2, leftSigY, 11, true);

  leftSigY -= 20;
  const approvedByDateWidth = font.widthOfTextAtSize(sanitizedData.approvedByDate, 10);
  drawText(sanitizedData.approvedByDate, margin + boxWidth / 4 - approvedByDateWidth / 2, leftSigY, 10, false);

  // Received By (right side)
  let rightSigY = yPos - 30;

  if (sanitizedData.receivedByEsig) {
    try {
      const esigImage = await embedSignatureImage(pdfDoc, sanitizedData.receivedByEsig);
      const esigDims = esigImage.scale(0.4);
      page.drawImage(esigImage, {
        x: midX + boxWidth / 4 - esigDims.width / 2,
        y: rightSigY - 15,
        width: esigDims.width,
        height: esigDims.height,
      });
      rightSigY -= esigDims.height + 5;
    } catch (error) {
      console.error('Error embedding received by e-signature:', error);
      rightSigY -= 40;
    }
  } else {
    rightSigY -= 40;
  }

  const receivedByNameWidth = font.widthOfTextAtSize(sanitizedData.receivedByName, 11);
  drawText(sanitizedData.receivedByName, midX + boxWidth / 4 - receivedByNameWidth / 2, rightSigY, 11, false);

  rightSigY -= 20;
  const receivedByLabelWidth = boldFont.widthOfTextAtSize('Received By', 11);
  drawText('Received By', midX + boxWidth / 4 - receivedByLabelWidth / 2, rightSigY, 11, true);

  rightSigY -= 20;
  const receivedByDateWidth = font.widthOfTextAtSize(sanitizedData.receivedByDate, 10);
  drawText(sanitizedData.receivedByDate, midX + boxWidth / 4 - receivedByDateWidth / 2, rightSigY, 10, false);

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
