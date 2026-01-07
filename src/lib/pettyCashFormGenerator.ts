import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface PettyCashFormData {
  pcNumber: string;
  recipient: string;
  requestDate: string;
  particulars: string;
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
  drawText(data.pcNumber, margin + boxWidth - 120, titleY + 10, 11, false);

  yPos = titleY;

  // To/Recipient and Date row
  drawLine(margin, yPos - 30, margin + boxWidth, yPos - 30);
  const midX = margin + boxWidth / 2;
  drawLine(midX, yPos, midX, yPos - 30);

  drawText('To / Receipient:', margin + 10, yPos - 20, 11, false);
  drawText(data.recipient, margin + 110, yPos - 20, 11, false);
  drawText('Date', midX + 10, yPos - 20, 11, false);
  drawText(data.requestDate, midX + 50, yPos - 20, 11, false);

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

  // Draw particulars (word wrap)
  const maxParticularWidth = boxWidth / 2 - 30;
  const particularWords = data.particulars.split(' ');
  let currentLine = '';
  let particularY = yPos - 30;

  for (const word of particularWords) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const lineWidth = font.widthOfTextAtSize(testLine, 12);

    if (lineWidth > maxParticularWidth && currentLine !== '') {
      drawText(currentLine, margin + 15, particularY, 12, false);
      currentLine = word;
      particularY -= 18;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    drawText(currentLine, margin + 15, particularY, 12, false);
  }

  // Draw amount
  const amountStr = data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  if (data.approvedByEsig) {
    try {
      const esigImage = await pdfDoc.embedPng(data.approvedByEsig);
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

  const approvedByNameWidth = font.widthOfTextAtSize(data.approvedByName, 11);
  drawText(data.approvedByName, margin + boxWidth / 4 - approvedByNameWidth / 2, leftSigY, 11, false);

  leftSigY -= 20;
  const approvedByLabelWidth = boldFont.widthOfTextAtSize('Approved By', 11);
  drawText('Approved By', margin + boxWidth / 4 - approvedByLabelWidth / 2, leftSigY, 11, true);

  leftSigY -= 20;
  const approvedByDateWidth = font.widthOfTextAtSize(data.approvedByDate, 10);
  drawText(data.approvedByDate, margin + boxWidth / 4 - approvedByDateWidth / 2, leftSigY, 10, false);

  // Received By (right side)
  let rightSigY = yPos - 30;

  if (data.receivedByEsig) {
    try {
      const esigImage = await pdfDoc.embedPng(data.receivedByEsig);
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

  const receivedByNameWidth = font.widthOfTextAtSize(data.receivedByName, 11);
  drawText(data.receivedByName, midX + boxWidth / 4 - receivedByNameWidth / 2, rightSigY, 11, false);

  rightSigY -= 20;
  const receivedByLabelWidth = boldFont.widthOfTextAtSize('Received By', 11);
  drawText('Received By', midX + boxWidth / 4 - receivedByLabelWidth / 2, rightSigY, 11, true);

  rightSigY -= 20;
  const receivedByDateWidth = font.widthOfTextAtSize(data.receivedByDate, 10);
  drawText(data.receivedByDate, midX + boxWidth / 4 - receivedByDateWidth / 2, rightSigY, 10, false);

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
