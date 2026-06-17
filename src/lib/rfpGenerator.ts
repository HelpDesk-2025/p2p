import { PDFDocument, rgb, StandardFonts, PDFImage } from 'pdf-lib';
import { supabase } from './supabase';
import { mergeRFPWithAttachments } from './pdfMerger';

function formatApprovalDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return dateStr;
  }
}

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

// Global sanitization function for text that will be used in PDFs
export function sanitizeForPDF(text: string | null | undefined): string {
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
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/™/g, '(TM)').replace(/®/g, '(R)').replace(/©/g, '(C)')
    .replace(/€/g, 'EUR').replace(/£/g, 'GBP').replace(/¥/g, 'JPY');

  sanitized = sanitized.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

export interface PaymentModeLine {
  label: string;
  value: string;
}

export interface ApprovalRecord {
  approver_name: string;
  approver_esig: string | null;
  approval_date: string;
  sequence: number;
}

export interface RFPData {
  companyName: string;
  requestType: string;
  documentNumber: string;
  dateOfRequest: string;
  payee: string;
  purpose: string;
  dateNeeded: string;
  amount: number;
  budgeted: boolean;
  paymentMode: string;
  paymentModeLines: PaymentModeLine[];
  requestorName: string;
  requestorEsig: string | null;
  approvals: ApprovalRecord[];
}

export async function generateRFP(data: RFPData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  let yPosition = height - 80;

  // Helper function to sanitize text for PDF encoding (WinAnsi compatible)
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
    // Safe range: printable ASCII (0x20-0x7E) and safe Latin-1 (0xA0-0xFF)
    sanitized = sanitized.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');

    // Clean up multiple spaces
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  };

  // Helper function to draw text
  const drawText = (text: string, x: number, y: number, size = 10, isBold = false) => {
    if (!text || text.trim() === '') return; // Skip empty text
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

  // Company Name (centered)
  const sanitizedCompanyName = sanitizeText(data.companyName);
  const companyNameWidth = boldFont.widthOfTextAtSize(sanitizedCompanyName, 16);
  drawText(data.companyName, (width - companyNameWidth) / 2, yPosition, 16, true);
  yPosition -= 30;

  // REQUEST FOR PAYMENT title (centered)
  const rfpTitleWidth = boldFont.widthOfTextAtSize('REQUEST FOR PAYMENT', 12);
  drawText('REQUEST FOR PAYMENT', (width - rfpTitleWidth) / 2, yPosition, 12, true);
  yPosition -= 30;

  // Document Number (right aligned)
  const docNumText = `DOCUMENT NO.    ${data.documentNumber}`;
  const docNumWidth = font.widthOfTextAtSize(docNumText, 10);
  drawText(docNumText, width - docNumWidth - 50, yPosition, 10, false);
  yPosition -= 20;

  // Date (right aligned)
  const dateText = `DATE    ${data.dateOfRequest}`;
  const dateWidth = font.widthOfTextAtSize(dateText, 10);
  drawText(dateText, width - dateWidth - 50, yPosition, 10, false);
  yPosition -= 25;

  // Request Details
  const leftMargin = 90;
  const labelWidth = 130;

  drawText('PAYEE', leftMargin, yPosition, 10, true);
  drawText(data.payee, leftMargin + labelWidth, yPosition, 10, false);
  yPosition -= 20;

  drawText('PURPOSE', leftMargin, yPosition, 10, true);
  // Wrap purpose text if too long
  const maxPurposeWidth = width - leftMargin - labelWidth - 100;
  const purposeWords = (data.purpose || '').replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length > 0);
  let currentLine = '';
  let purposeStartY = yPosition;

  for (const word of purposeWords) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const testWidth = font.widthOfTextAtSize(testLine, 10);

    if (testWidth > maxPurposeWidth && currentLine) {
      drawText(currentLine, leftMargin + labelWidth, yPosition, 10, false);
      yPosition -= 15;
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    drawText(currentLine, leftMargin + labelWidth, yPosition, 10, false);
  }
  yPosition -= 25;

  drawText('DATE NEEDED', leftMargin, yPosition, 10, true);
  drawText(data.dateNeeded, leftMargin + labelWidth, yPosition, 10, false);
  yPosition -= 20;

  drawText('AMOUNT', leftMargin, yPosition, 10, true);
  drawText(data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), leftMargin + labelWidth, yPosition, 10, false);
  yPosition -= 20;

  drawText('BUDGETED', leftMargin, yPosition, 10, true);
  drawText(data.budgeted ? 'Yes' : 'No', leftMargin + labelWidth, yPosition, 10, false);
  yPosition -= 20;

  if (data.paymentMode) {
    drawText('MODE OF PAYMENT', leftMargin, yPosition, 10, true);
    drawText(data.paymentMode, leftMargin + labelWidth, yPosition, 10, false);
    yPosition -= 20;

    for (const line of data.paymentModeLines) {
      drawText(line.label, leftMargin, yPosition, 10, true);
      drawText(line.value, leftMargin + labelWidth, yPosition, 10, false);
      yPosition -= 15;
    }
    yPosition -= 20;
  }

  // Requested By section
  drawText('REQUESTED BY:', leftMargin, yPosition, 10, true);
  yPosition -= 10;

  // Add e-signature if available
  if (data.requestorEsig) {
    try {
      const esigImage = await embedSignatureImage(pdfDoc, data.requestorEsig);
      const esigDims = esigImage.scale(0.5);
      page.drawImage(esigImage, {
        x: leftMargin + 20,
        y: yPosition - esigDims.height,
        width: esigDims.width,
        height: esigDims.height,
      });
    } catch (error) {
      console.error('Error embedding requestor signature:', error);
    }
  }
  yPosition -= 50;

  drawText(data.requestorName, leftMargin, yPosition, 10, false);
  yPosition -= 15;
  drawText(data.dateOfRequest, leftMargin, yPosition, 10, false);
  yPosition -= 30;

  // Approvals section
  const totalApprovals = data.approvals.length;

  if (totalApprovals === 1) {
    // Single approver - APPROVED BY only
    const approval = data.approvals[0];
    drawText('APPROVED BY:', leftMargin, yPosition, 10, true);
    yPosition -= 10;

    if (approval.approver_esig) {
      try {
        const esigImage = await embedSignatureImage(pdfDoc, approval.approver_esig);
        const esigDims = esigImage.scale(0.5);
        page.drawImage(esigImage, {
          x: leftMargin + 20,
          y: yPosition - esigDims.height,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding approver signature:', error);
      }
    }
    yPosition -= 50;

    drawText(approval.approver_name, leftMargin, yPosition, 10, false);
    yPosition -= 15;
    drawText(formatApprovalDate(approval.approval_date), leftMargin, yPosition, 10, false);
  } else if (totalApprovals >= 2) {
    // Multiple approvers - first to second-to-last are recommending, last is final approval
    const recommendingApprovers = data.approvals.slice(0, -1);
    const finalApprover = data.approvals[data.approvals.length - 1];

    // Recommending Approval(s) on the left
    let leftY = yPosition;
    drawText('RECOMMENDING APPROVAL:', leftMargin, leftY, 10, true);
    leftY -= 10;

    for (const approval of recommendingApprovers) {
      if (approval.approver_esig) {
        try {
          const esigImage = await embedSignatureImage(pdfDoc, approval.approver_esig);
          const esigDims = esigImage.scale(0.5);
          page.drawImage(esigImage, {
            x: leftMargin + 20,
            y: leftY - esigDims.height,
            width: esigDims.width,
            height: esigDims.height,
          });
        } catch (error) {
          console.error('Error embedding recommending approver signature:', error);
        }
      }
      leftY -= 50;

      drawText(approval.approver_name, leftMargin, leftY, 10, false);
      leftY -= 15;
      drawText(formatApprovalDate(approval.approval_date), leftMargin, leftY, 10, false);
      leftY -= 30;
    }

    // Final Approval on the right
    const rightMargin = width / 2 + 50;
    let rightY = yPosition;
    drawText('APPROVED BY:', rightMargin, rightY, 10, true);
    rightY -= 10;

    if (finalApprover.approver_esig) {
      try {
        const esigImage = await embedSignatureImage(pdfDoc, finalApprover.approver_esig);
        const esigDims = esigImage.scale(0.5);
        page.drawImage(esigImage, {
          x: rightMargin + 20,
          y: rightY - esigDims.height,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding final approver signature:', error);
      }
    }
    rightY -= 50;

    drawText(finalApprover.approver_name, rightMargin, rightY, 10, false);
    rightY -= 15;
    drawText(formatApprovalDate(finalApprover.approval_date), rightMargin, rightY, 10, false);

    yPosition = Math.min(leftY, rightY);
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

export interface CanvassSheetData {
  companyName: string;
  companyAddress: string;
  vatTin: string;
  date: string;
  requestFor: string;
  items: Array<{
    description: string;
    quantity: number;
    unit: string;
  }>;
  suppliers: Array<{
    name: string;
    quotations: Array<{
      unitPrice: number;
      amount: number;
    }>;
    invoiceAvailability: string;
    delivery: string;
    installation: string;
    deliveryFee: number;
    total: number;
    discountPrice: number;
    purchasePrice: number;
    netOfVat: number;
    vat12: number;
    ewt: number;
    netPayable: number;
    registeredName: string;
    address: string;
    tin: string;
    contactPerson: string;
    contactNo: string;
    email: string;
    bankAccount: string;
    depositoryBank: string;
    isWinner: boolean;
    quotationFilePath: string | null;
  }>;
  approvals: ApprovalRecord[];
}

export async function generateCanvassSheet(data: CanvassSheetData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Portrait orientation
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  let yPosition = height - 50;

  // Helper function to sanitize text for PDF encoding (WinAnsi compatible)
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
    // Safe range: printable ASCII (0x20-0x7E) and safe Latin-1 (0xA0-0xFF)
    sanitized = sanitized.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');

    // Clean up multiple spaces
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  };

  const drawText = (text: string, x: number, y: number, size = 9, isBold = false) => {
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
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
  };

  const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
    if (!text) return [''];
    const sanitized = sanitizeText(text);
    const words = sanitized.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
  };

  // Company Name (centered)
  const sanitizedCompanyName = sanitizeText(data.companyName);
  const companyNameWidth = boldFont.widthOfTextAtSize(sanitizedCompanyName, 14);
  drawText(data.companyName, (width - companyNameWidth) / 2, yPosition, 14, true);
  yPosition -= 15;

  // Company Address (centered) - only if provided
  if (data.companyAddress && data.companyAddress.trim()) {
    const sanitizedAddress = sanitizeText(data.companyAddress);
    const addressWidth = font.widthOfTextAtSize(sanitizedAddress, 9);
    drawText(data.companyAddress, (width - addressWidth) / 2, yPosition, 9, false);
    yPosition -= 12;
  }

  // VAT TIN (centered) - only if provided
  if (data.vatTin && data.vatTin.trim()) {
    const sanitizedVatTin = sanitizeText(data.vatTin);
    const vatTinWidth = font.widthOfTextAtSize(sanitizedVatTin, 9);
    drawText(data.vatTin, (width - vatTinWidth) / 2, yPosition, 9, false);
    yPosition -= 12;
  }

  yPosition -= 8;

  // Title (centered)
  const titleWidth = boldFont.widthOfTextAtSize('CANVASS SUMMARY', 16);
  drawText('CANVASS SUMMARY', (width - titleWidth) / 2, yPosition, 16, true);

  // Date (right aligned)
  const dateText = `Date: ${data.date}`;
  const dateWidth = font.widthOfTextAtSize(dateText, 9);
  drawText(dateText, width - dateWidth - 40, yPosition, 9, false);
  yPosition -= 25;

  // Request For
  drawText(`Request for: ${data.requestFor}`, 40, yPosition, 9, true);
  yPosition -= 20;

  // Table headers
  const tableStartY = yPosition;
  const tableLeft = 40;
  const tableRight = width - 40;
  const firstColWidth = 120; // Reduced for portrait orientation
  const supplierColWidth = (tableRight - tableLeft - firstColWidth) / data.suppliers.length;

  // Draw table structure
  drawLine(tableLeft, yPosition, tableRight, yPosition);
  yPosition -= 15;

  // Supplier headers with highlighting for winner
  drawText('Supplier Name', tableLeft + 5, yPosition, 9, true);

  // First pass: calculate maximum lines needed for any supplier name
  const maxNameWidth = supplierColWidth - 10;
  let maxNameLines = 1;
  const allSupplierLines: string[][] = [];

  data.suppliers.forEach((supplier) => {
    const supplierName = sanitizeText(supplier.name || 'N/A');
    const displayText = supplier.isWinner ? `${supplierName} - AWARDED` : supplierName;

    const nameLines: string[] = [];
    const words = displayText.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = boldFont.widthOfTextAtSize(testLine, 9);

      if (testWidth > maxNameWidth && currentLine) {
        nameLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      nameLines.push(currentLine);
    }

    allSupplierLines.push(nameLines);
    maxNameLines = Math.max(maxNameLines, nameLines.length);
  });

  // Calculate row height based on max lines needed
  const supplierHeaderHeight = maxNameLines * 11 + 8;

  // Second pass: draw supplier names with proper backgrounds
  let supplierX = tableLeft + firstColWidth;
  data.suppliers.forEach((supplier, index) => {
    // Highlight winning vendor background
    if (supplier.isWinner) {
      page.drawRectangle({
        x: supplierX,
        y: yPosition - supplierHeaderHeight + 6,
        width: supplierColWidth,
        height: supplierHeaderHeight,
        color: rgb(0.8, 1, 0.8),
      });
    }

    // Draw each line centered
    let lineY = yPosition;
    allSupplierLines[index].forEach((line) => {
      const lineWidth = boldFont.widthOfTextAtSize(line, 9);
      const centerX = supplierX + (supplierColWidth - lineWidth) / 2;

      page.drawText(line, {
        x: centerX,
        y: lineY,
        size: 9,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      lineY -= 11;
    });

    supplierX += supplierColWidth;
  });

  yPosition -= supplierHeaderHeight;
  drawLine(tableLeft, yPosition, tableRight, yPosition);

  // Column headers
  yPosition -= 12;
  drawText('No', tableLeft + 5, yPosition, 8, true);
  drawText('Details', tableLeft + 20, yPosition, 8, true);
  drawText('Qty.', tableLeft + 70, yPosition, 8, true);
  drawText('Unit', tableLeft + 95, yPosition, 8, true);

  supplierX = tableLeft + firstColWidth;
  data.suppliers.forEach((supplier) => {
    // Highlight winning vendor column headers
    if (supplier.isWinner) {
      page.drawRectangle({
        x: supplierX,
        y: yPosition - 5,
        width: supplierColWidth,
        height: 15,
        color: rgb(0.8, 1, 0.8),
      });
    }
    const upWidth = boldFont.widthOfTextAtSize('Unit Price', 8);
    const amountWidth = boldFont.widthOfTextAtSize('Amount', 8);
    const leftColX = supplierX + (supplierColWidth * 0.25) - (upWidth / 2);
    const rightColX = supplierX + (supplierColWidth * 0.75) - (amountWidth / 2);

    drawText('Unit Price', leftColX, yPosition, 8, true);
    drawText('Amount', rightColX, yPosition, 8, true);
    supplierX += supplierColWidth;
  });
  yPosition -= 12;
  drawLine(tableLeft, yPosition, tableRight, yPosition);

  // Items
  data.items.forEach((item, index) => {
    const itemRowStartY = yPosition;

    // Wrap description text
    const maxDescriptionWidth = 45; // Width available for description
    const descriptionLines = wrapText(item.description, maxDescriptionWidth, 8);
    const rowHeight = Math.max(12, descriptionLines.length * 10);

    yPosition -= rowHeight;

    // Draw item data at vertical center of row
    const textY = yPosition + (rowHeight / 2) - 3;
    drawText(`${index + 1}`, tableLeft + 5, textY, 8, false);

    // Draw wrapped description lines
    let descY = textY + ((descriptionLines.length - 1) * 5);
    descriptionLines.forEach((line) => {
      drawText(line, tableLeft + 20, descY, 8, false);
      descY -= 10;
    });

    drawText(item.quantity.toString(), tableLeft + 70, textY, 8, false);
    drawText(item.unit, tableLeft + 95, textY, 8, false);

    supplierX = tableLeft + firstColWidth;
    data.suppliers.forEach((supplier) => {
      // Highlight winning vendor data cells
      if (supplier.isWinner) {
        page.drawRectangle({
          x: supplierX,
          y: yPosition,
          width: supplierColWidth,
          height: rowHeight,
          color: rgb(0.9, 1, 0.9),
        });
      }

      const quotation = supplier.quotations[index];
      if (quotation) {
        const upText = quotation.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 });
        const amountText = quotation.amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
        const upTextWidth = font.widthOfTextAtSize(upText, 8);
        const amountTextWidth = font.widthOfTextAtSize(amountText, 8);

        const leftColX = supplierX + (supplierColWidth * 0.25) - (upTextWidth / 2);
        const rightColX = supplierX + (supplierColWidth * 0.75) - (amountTextWidth / 2);

        drawText(upText, leftColX, textY, 8, false);
        drawText(amountText, rightColX, textY, 8, false);
      }
      supplierX += supplierColWidth;
    });
  });

  yPosition -= 12;
  drawLine(tableLeft, yPosition, tableRight, yPosition);

  // Additional rows
  const additionalRows = [
    'Invoice Availability',
    'Delivery',
    'Installation',
    'Delivery Fee',
    'Total',
    'Discount Price',
    'Purchase Price',
    'Net of Vat',
    'Vat 12%',
    'EWT',
    'Net Payable'
  ];

  additionalRows.forEach((rowLabel) => {
    yPosition -= 12;
    drawText(rowLabel, tableLeft + 20, yPosition, 8, rowLabel === 'Net Payable' ? true : false);

    supplierX = tableLeft + firstColWidth;
    data.suppliers.forEach((supplier) => {
      // Highlight winning vendor data cells
      if (supplier.isWinner) {
        page.drawRectangle({
          x: supplierX,
          y: yPosition - 5,
          width: supplierColWidth,
          height: 15,
          color: rgb(0.9, 1, 0.9),
        });
      }

      let value = '';
      switch (rowLabel) {
        case 'Invoice Availability':
          value = supplier.invoiceAvailability;
          break;
        case 'Delivery':
          value = supplier.delivery;
          break;
        case 'Installation':
          value = supplier.installation;
          break;
        case 'Delivery Fee':
          value = supplier.deliveryFee > 0 ? supplier.deliveryFee.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-';
          break;
        case 'Total':
          value = supplier.total.toLocaleString('en-US', { minimumFractionDigits: 2 });
          break;
        case 'Discount Price':
          value = supplier.discountPrice > 0 ? supplier.discountPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-';
          break;
        case 'Purchase Price':
          value = supplier.purchasePrice.toLocaleString('en-US', { minimumFractionDigits: 2 });
          break;
        case 'Net of Vat':
          value = supplier.netOfVat.toLocaleString('en-US', { minimumFractionDigits: 2 });
          break;
        case 'Vat 12%':
          value = supplier.vat12.toLocaleString('en-US', { minimumFractionDigits: 2 });
          break;
        case 'EWT':
          value = `(${supplier.ewt.toLocaleString('en-US', { minimumFractionDigits: 2 })})`;
          break;
        case 'Net Payable':
          value = supplier.netPayable.toLocaleString('en-US', { minimumFractionDigits: 2 });
          break;
      }

      const valueFont = rowLabel === 'Net Payable' ? boldFont : font;
      const valueWidth = valueFont.widthOfTextAtSize(value, 8);
      const valueCenterX = supplierX + (supplierColWidth - valueWidth) / 2;

      drawText(value, valueCenterX, yPosition, 8, rowLabel === 'Net Payable' ? true : false);
      supplierX += supplierColWidth;
    });
  });

  yPosition -= 12;
  drawLine(tableLeft, yPosition, tableRight, yPosition);

  // Supplier information
  yPosition -= 15;
  const supplierInfoRows = [
    'Registered Name:',
    'Complete Address:',
    'TIN:',
    'Contact Person:',
    'Contact No.:',
    'Email:',
    'Bank Account:',
    'Depository Bank'
  ];

  supplierInfoRows.forEach((label) => {
    const startY = yPosition - 10;
    drawText(label, tableLeft + 5, startY, 8, true);

    supplierX = tableLeft + firstColWidth;
    let maxLines = 1;

    // First pass: determine max number of lines needed for this row
    data.suppliers.forEach((supplier) => {
      let value = '';
      switch (label) {
        case 'Registered Name:':
          value = supplier.registeredName;
          break;
        case 'Complete Address:':
          value = supplier.address;
          break;
        case 'TIN:':
          value = supplier.tin;
          break;
        case 'Contact Person:':
          value = supplier.contactPerson;
          break;
        case 'Contact No.:':
          value = supplier.contactNo;
          break;
        case 'Email:':
          value = supplier.email;
          break;
        case 'Bank Account:':
          value = supplier.bankAccount;
          break;
        case 'Depository Bank':
          value = supplier.depositoryBank;
          break;
      }

      const maxTextWidth = supplierColWidth - 20;
      const lines = wrapText(value, maxTextWidth, 7);
      maxLines = Math.max(maxLines, lines.length);
    });

    const rowHeight = maxLines * 9 + 3;

    // Second pass: draw the values with wrapping
    supplierX = tableLeft + firstColWidth;
    data.suppliers.forEach((supplier) => {
      // Highlight winning vendor info cells
      if (supplier.isWinner) {
        page.drawRectangle({
          x: supplierX,
          y: startY - rowHeight + 3,
          width: supplierColWidth,
          height: rowHeight,
          color: rgb(0.95, 1, 0.95),
        });
      }

      let value = '';
      switch (label) {
        case 'Registered Name:':
          value = supplier.registeredName;
          break;
        case 'Complete Address:':
          value = supplier.address;
          break;
        case 'TIN:':
          value = supplier.tin;
          break;
        case 'Contact Person:':
          value = supplier.contactPerson;
          break;
        case 'Contact No.:':
          value = supplier.contactNo;
          break;
        case 'Email:':
          value = supplier.email;
          break;
        case 'Bank Account:':
          value = supplier.bankAccount;
          break;
        case 'Depository Bank':
          value = supplier.depositoryBank;
          break;
      }

      const maxTextWidth = supplierColWidth - 20;
      const lines = wrapText(value, maxTextWidth, 7);

      let lineY = startY;
      lines.forEach((line) => {
        drawText(line, supplierX + 10, lineY, 7, false);
        lineY -= 9;
      });

      supplierX += supplierColWidth;
    });

    yPosition = startY - rowHeight;
  });

  // Approvals section on the same page
  yPosition -= 20;
  const totalApprovals = data.approvals.length;
  const leftMargin = 100;

  if (totalApprovals === 1) {
    const approval = data.approvals[0];
    drawText('APPROVED BY:', leftMargin, yPosition, 9, true);
    yPosition -= 10;

    if (approval.approver_esig) {
      try {
        const esigImage = await embedSignatureImage(pdfDoc, approval.approver_esig);
        const esigDims = esigImage.scale(0.3);
        page.drawImage(esigImage, {
          x: leftMargin + 20,
          y: yPosition - esigDims.height,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding approver signature:', error);
      }
    }
    yPosition -= 35;

    drawText(approval.approver_name, leftMargin, yPosition, 9, false);
    yPosition -= 12;
    drawText(formatApprovalDate(approval.approval_date), leftMargin, yPosition, 9, false);
  } else if (totalApprovals >= 2) {
    const recommendingApprovers = data.approvals.slice(0, -1);
    const finalApprover = data.approvals[data.approvals.length - 1];

    let leftY = yPosition;
    drawText('RECOMMENDING APPROVAL:', leftMargin, leftY, 9, true);
    leftY -= 10;

    for (const approval of recommendingApprovers) {
      if (approval.approver_esig) {
        try {
          const esigImage = await embedSignatureImage(pdfDoc, approval.approver_esig);
          const esigDims = esigImage.scale(0.3);
          page.drawImage(esigImage, {
            x: leftMargin + 20,
            y: leftY - esigDims.height,
            width: esigDims.width,
            height: esigDims.height,
          });
        } catch (error) {
          console.error('Error embedding recommending approver signature:', error);
        }
      }
      leftY -= 35;

      drawText(approval.approver_name, leftMargin, leftY, 9, false);
      leftY -= 12;
      drawText(formatApprovalDate(approval.approval_date), leftMargin, leftY, 9, false);
      leftY -= 20;
    }

    const rightMargin = width / 2 + 50;
    let rightY = yPosition;
    drawText('APPROVED BY:', rightMargin, rightY, 9, true);
    rightY -= 10;

    if (finalApprover.approver_esig) {
      try {
        const esigImage = await embedSignatureImage(pdfDoc, finalApprover.approver_esig);
        const esigDims = esigImage.scale(0.3);
        page.drawImage(esigImage, {
          x: rightMargin + 20,
          y: rightY - esigDims.height,
          width: esigDims.width,
          height: esigDims.height,
        });
      } catch (error) {
        console.error('Error embedding final approver signature:', error);
      }
    }
    rightY -= 35;

    drawText(finalApprover.approver_name, rightMargin, rightY, 9, false);
    rightY -= 12;
    drawText(formatApprovalDate(finalApprover.approval_date), rightMargin, rightY, 9, false);
  }

  return await pdfDoc.save();
}

export async function regenerateRFP(
  requestType: 'petty_cash' | 'reimbursement' | 'purchase_requisition',
  requestId: string,
  requestNumber: string
): Promise<string> {
  console.log('Regenerating RFP for:', { requestType, requestId, requestNumber });

  // Delete the old RFP file if it exists
  const tableName = requestType === 'purchase_requisition' ? 'purchase_requisitions' :
                    requestType === 'petty_cash' ? 'petty_cash_requests' : 'reimbursement_requests';

  const { data: existingRequest } = await supabase
    .from(tableName)
    .select('rfp_pdf_path')
    .eq('id', requestId)
    .single();

  if (existingRequest?.rfp_pdf_path) {
    console.log('Deleting old RFP:', existingRequest.rfp_pdf_path);
    await supabase.storage
      .from('attachments')
      .remove([existingRequest.rfp_pdf_path]);
  }

  // Generate new RFP
  return await generateAndUploadRFP(requestType, requestId, requestNumber);
}

export async function generateAndUploadCanvassRFP(
  canvassId: string,
  canvassNumber: string
): Promise<string> {
  try {
    console.log('Starting Canvass RFP generation for:', { canvassId, canvassNumber });

    const { data: canvass, error: canvassError } = await supabase
      .from('canvass_requests')
      .select(`
        *,
        requester:user_profiles!requester_id(full_name, e_sig),
        company:companies!company_id(name),
        pr:purchase_requisitions!pr_id(purpose, required_date, is_budgeted)
      `)
      .eq('id', canvassId)
      .single();

    if (canvassError) {
      console.error('Error fetching canvass:', canvassError);
      throw canvassError;
    }
    if (!canvass) throw new Error('Canvass not found');

    console.log('Canvass data fetched:', canvass);

    const winningVendorIndex = canvass.recommended_quotation_index || 0;
    const winningVendorData = canvass.suppliers?.[winningVendorIndex];
    const winningVendor = winningVendorData?.vendor_name || winningVendorData?.name || '';
    console.log('Winning vendor:', winningVendor);

    // Calculate net payable for the winning vendor
    const winningTotal = parseFloat(winningVendorData?.total || winningVendorData?.purchase_price || 0);
    const winningNetOfVat = parseFloat(winningVendorData?.net_of_vat || (winningTotal / 1.12));
    const winningEwt = parseFloat(winningVendorData?.ewt || (winningNetOfVat * 0.02));
    const winningNetPayable = parseFloat(winningVendorData?.net_payable || (winningTotal - winningEwt));
    console.log('Winning vendor net payable:', winningNetPayable);

    // Use RPC function to bypass RLS and get all approval records with signatures
    const { data: approvalRecordsData, error: approvalsError } = await supabase
      .rpc('get_approval_records_with_signatures', {
        p_request_id: canvassId,
        p_request_type: 'Canvass',
        p_requester_id: canvass.requester_id
      });

    if (approvalsError) {
      console.error('Error fetching approvals:', approvalsError);
      throw approvalsError;
    }

    // RPC now returns JSONB array directly
    const approvalRecords = Array.isArray(approvalRecordsData) ? approvalRecordsData : (approvalRecordsData ? [approvalRecordsData] : []);
    console.log('Approvals fetched:', approvalRecords);

    // Fetch signature data separately for each approver to avoid HTTP header size limits
    console.log('🔄 Fetching signature data for each approver...');
    const approvalRecordsWithSignatures = await Promise.all(
      (approvalRecords || []).map(async (record: any) => {
        let signatureData = null;

        // Check if approver_esig is already base64 data (starts with data:image)
        if (record.approver_esig && record.approver_esig.startsWith('data:image')) {
          signatureData = record.approver_esig;
        }
        // If signature_path exists (starts with attachments/), fetch from storage
        else if (record.approver_esig && record.approver_esig.startsWith('attachments/')) {
          try {
            const { data: fileData } = await supabase.storage
              .from('attachments')
              .download(record.approver_esig);

            if (fileData) {
              const arrayBuffer = await fileData.arrayBuffer();
              const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
              signatureData = `data:${fileData.type};base64,${base64}`;
            }
          } catch (error) {
            console.error(`Failed to fetch signature from storage for ${record.approver_name}:`, error);
          }
        }

        // If still no signature data, this shouldn't happen with the new RPC
        // but keep as final fallback
        if (!signatureData && record.approver_id) {
          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('e_sig')
            .eq('id', record.approver_id)
            .single();

          if (profileData?.e_sig) {
            signatureData = profileData.e_sig;
          }
        }

        return {
          ...record,
          signature_data: signatureData
        };
      })
    );

    // Transform RPC results to match expected format
    const approvals = (approvalRecordsWithSignatures || []).map((record: any) => ({
      approval_date: record.approval_date,
      sequence: record.sequence,
      approver: {
        full_name: record.approver_name,
        e_sig: record.signature_data
      }
    }));

    const rfpData: RFPData = {
      companyName: sanitizeForPDF(canvass.company?.name || 'Company Name'),
      requestType: 'Canvass',
      documentNumber: sanitizeForPDF(canvassNumber),
      dateOfRequest: new Date(canvass.request_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }),
      payee: sanitizeForPDF(winningVendor),
      purpose: sanitizeForPDF(canvass.pr?.purpose || ''),
      dateNeeded: canvass.pr?.required_date
        ? new Date(canvass.pr.required_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          })
        : '',
      amount: winningNetPayable,
      budgeted: canvass.pr?.is_budgeted !== false,
      paymentMode: '',
      paymentModeLines: [],
      requestorName: sanitizeForPDF(canvass.requester?.full_name || ''),
      requestorEsig: canvass.requester?.e_sig || null,
      approvals: (approvals || []).map((a: any) => {
        const approvalDate = new Date(a.approval_date);
        return {
          approver_name: sanitizeForPDF(a.approver?.full_name || ''),
          approver_esig: a.approver?.e_sig || null,
          approval_date: approvalDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }) + ' ' + approvalDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }),
          sequence: a.sequence
        };
      })
    };

    console.log('Generating RFP PDF with data:', rfpData);
    const rfpBytes = await generateRFP(rfpData);
    console.log('RFP PDF generated, size:', rfpBytes.length);

    // Prepare Canvass Sheet data
    const canvassSheetData: CanvassSheetData = {
      companyName: sanitizeForPDF(canvass.company?.name || 'Company Name'),
      companyAddress: '',
      vatTin: '',
      date: new Date(canvass.request_date).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      }),
      requestFor: sanitizeForPDF(canvass.pr?.purpose || ''),
      items: (() => {
        // If suppliers have items with descriptions, use the first supplier's items as the canonical list
        if (canvass.suppliers?.[0]?.items && canvass.suppliers[0].items.length > 0) {
          return canvass.suppliers[0].items.map((item: any) => ({
            description: sanitizeForPDF(item.description || ''),
            quantity: item.quantity || 0,
            unit: sanitizeForPDF(item.uom || item.unit || '')
          }));
        }
        // Otherwise fall back to canvass.items
        return (canvass.items || []).map((item: any) => ({
          description: sanitizeForPDF(item.description || ''),
          quantity: item.quantity || canvass.suppliers?.[0]?.quantity || 0,
          unit: sanitizeForPDF(item.unit || item.uom || '')
        }));
      })(),
      suppliers: (canvass.suppliers || []).map((supplier: any, supplierIndex: number) => {
        // Build quotations array based on supplier's items if available
        const quotations = (supplier.items && supplier.items.length > 0)
          ? supplier.items.map((item: any) => ({
              unitPrice: parseFloat(item.unit_price || 0),
              amount: parseFloat(item.amount || 0)
            }))
          : (canvass.items || []).map(() => ({
              unitPrice: parseFloat(supplier.unit_price || 0),
              amount: parseFloat(supplier.quoted_amount || 0)
            }));

        const total = parseFloat(supplier.total || supplier.purchase_price || supplier.quoted_amount || 0);
        const netOfVat = parseFloat(supplier.net_of_vat || (total / 1.12));
        const vat12 = parseFloat(supplier.vat_12 || (total - netOfVat));
        const ewt = parseFloat(supplier.ewt || (netOfVat * 0.02));
        const netPayable = parseFloat(supplier.net_payable || (total - ewt));
        const isWinner = supplierIndex === (canvass.recommended_quotation_index || 0);

        return {
          name: sanitizeForPDF(supplier.vendor_name || supplier.name || ''),
          quotations,
          invoiceAvailability: supplier.invoice_availability ? 'Yes' : 'No',
          delivery: supplier.delivery ? 'Yes' : 'No',
          installation: supplier.installation ? 'Yes' : 'No',
          deliveryFee: parseFloat(supplier.delivery_fee || 0),
          total,
          discountPrice: parseFloat(supplier.discounted_price || 0),
          purchasePrice: parseFloat(supplier.purchase_price || total),
          netOfVat,
          vat12,
          ewt,
          netPayable,
          registeredName: sanitizeForPDF(supplier.registered_name || supplier.vendor_name || ''),
          address: sanitizeForPDF(supplier.complete_address || supplier.address || ''),
          tin: sanitizeForPDF(supplier.tin || ''),
          contactPerson: sanitizeForPDF(supplier.contact_person || ''),
          contactNo: sanitizeForPDF(supplier.contact_no || ''),
          email: sanitizeForPDF(supplier.email_address || supplier.email || ''),
          bankAccount: sanitizeForPDF(supplier.bank_account_no || ''),
          depositoryBank: sanitizeForPDF(supplier.depository_bank || ''),
          isWinner,
          quotationFilePath: supplier.quotation_file_path || null
        };
      }),
      approvals: (approvals || []).map((a: any) => {
        const approvalDate = new Date(a.approval_date);
        return {
          approver_name: sanitizeForPDF(a.approver?.full_name || ''),
          approver_esig: a.approver?.e_sig || null,
          approval_date: approvalDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }) + ' ' + approvalDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }),
          sequence: a.sequence
        };
      })
    };

    console.log('Generating Canvass Sheet PDF');
    const canvassSheetBytes = await generateCanvassSheet(canvassSheetData);
    console.log('Canvass Sheet PDF generated, size:', canvassSheetBytes.length);

    // Get winning vendor's quotation file
    const winningSupplier = canvassSheetData.suppliers.find(s => s.isWinner);
    const attachmentsToMerge: Array<{ data: Uint8Array; type: string }> = [
      { data: rfpBytes, type: 'application/pdf' }
    ];

    if (winningSupplier?.quotationFilePath) {
      try {
        console.log('Downloading winning vendor quotation:', winningSupplier.quotationFilePath);
        const { data: quotationFile, error: downloadError } = await supabase.storage
          .from('attachments')
          .download(winningSupplier.quotationFilePath);

        if (!downloadError && quotationFile) {
          const quotationBytes = new Uint8Array(await quotationFile.arrayBuffer());
          attachmentsToMerge.push({
            data: quotationBytes,
            type: quotationFile.type
          });
          console.log('Winning vendor quotation added to merge');
        } else {
          console.warn('Could not download winning vendor quotation:', downloadError);
        }
      } catch (error) {
        console.error('Error downloading winning vendor quotation:', error);
      }
    }

    // Merge Canvass Sheet, RFP, and winning vendor quotation
    console.log('Merging Canvass Sheet, RFP, and attachments');
    const mergedPdfBytes = await mergeRFPWithAttachments(canvassSheetBytes, attachmentsToMerge);
    console.log('PDFs merged, size:', mergedPdfBytes.length);

    const fileName = `rfp_${canvassNumber}_${Date.now()}.pdf`;
    const filePath = `rfp/${fileName}`;

    console.log('Uploading merged PDF to:', filePath);
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, mergedPdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    console.log('PDF uploaded successfully');

    const { error: updateError } = await supabase
      .from('canvass_requests')
      .update({ rfp_pdf_path: filePath })
      .eq('id', canvassId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw updateError;
    }

    console.log('Canvass updated with RFP path:', filePath);

    return filePath;
  } catch (error) {
    console.error('Error generating Canvass RFP:', error);
    throw error;
  }
}

export async function generateAndUploadRFP(
  requestType: 'petty_cash' | 'reimbursement' | 'purchase_requisition',
  requestId: string,
  requestNumber: string
): Promise<string> {
  try {
    console.log('Starting RFP generation for:', { requestType, requestId, requestNumber });

    // Fetch request data
    const tableName = requestType === 'purchase_requisition' ? 'purchase_requisitions' :
                      requestType === 'petty_cash' ? 'petty_cash_requests' : 'reimbursement_requests';

    // All request types now have company_id
    const selectQuery = `
      *,
      requester:user_profiles!requester_id(full_name, e_sig),
      company:companies!company_id(name),
      payment_mode:payment_modes!payment_mode_id(mode_name, line_names)
    `;

    const { data: request, error: requestError } = await supabase
      .from(tableName)
      .select(selectQuery)
      .eq('id', requestId)
      .single();

    if (requestError) {
      console.error('Error fetching request:', requestError);
      throw requestError;
    }
    if (!request) throw new Error('Request not found');

    console.log('Request data fetched:', request);

    // Determine expected number of approvals
    // Count only non-checker approved records since the RPC excludes checkers from PDF signatures
    const currentLevel = request.current_approval_level;
    const { count: nonCheckerCount } = await supabase
      .from('approval_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('request_id', requestId)
      .eq('action', 'Approved')
      .eq('for_checking', false);
    const expectedApprovals = Math.max(nonCheckerCount ?? currentLevel, 1);
    console.log('Current approval level:', currentLevel, 'Expected non-checker approvals:', expectedApprovals);

    // Fetch approval records using RPC function to bypass RLS with retry logic
    const requestTypeName = requestType === 'purchase_requisition' ? 'Purchase Requisition' :
                           requestType === 'petty_cash' ? 'Petty Cash' : 'Reimbursement';

    let approvalRecords: any[] = [];
    let retries = 0;
    const maxRetries = 15; // Increased from 10 for multi-company scenarios
    const baseDelay = 800; // Start with 800ms

    console.log(`🔄 Fetching approval records. Expected: ${expectedApprovals} approvals`);

    const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-approval-records`;

    while (retries < maxRetries) {
      // Call edge function with service role key to avoid JWT header size limits
      let fetchError: Error | null = null;
      let fetchedRecords: any[] = [];

      try {
        const response = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestId,
            requestType: requestTypeName,
            requesterId: request.requester_id,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          fetchError = new Error(errData.error || `HTTP ${response.status}`);
        } else {
          const result = await response.json();
          fetchedRecords = Array.isArray(result.records) ? result.records : [];
        }
      } catch (err) {
        fetchError = err instanceof Error ? err : new Error(String(err));
      }

      if (fetchError) {
        console.error(`❌ Error fetching approvals on retry ${retries + 1}:`, fetchError);

        if (retries < maxRetries - 1) {
          const delay = baseDelay * Math.pow(1.4, retries);
          console.log(`⏳ Waiting ${delay}ms before retry ${retries + 2} after error...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
          continue;
        } else {
          throw fetchError;
        }
      }

      approvalRecords = fetchedRecords;
      console.log(`📊 Retry ${retries + 1}/${maxRetries}: Found ${approvalRecords.length} approval records (expected ${expectedApprovals})`);

      // Check if we have all required approval records (don't check signatures yet - we'll fetch them separately)
      if (approvalRecords.length >= expectedApprovals) {
        console.log('✅ All expected approval records found!');
        break;
      }

      // If we don't have enough records, wait and retry
      if (retries < maxRetries - 1) {
        const delay = baseDelay * Math.pow(1.4, retries); // Slightly slower exponential backoff
        console.log(`⏳ Waiting ${delay.toFixed(0)}ms before retry ${retries + 2}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      } else {
        // Last retry failed, log warning but proceed with what we have
        console.warn(`⚠️ Could not fetch all approval records after ${maxRetries} attempts. Expected: ${expectedApprovals}, Got: ${approvalRecords.length}`);
        console.warn('Proceeding with available records.');
        break;
      }
    }

    console.log('Final approval records count:', approvalRecords?.length || 0);

    if (!approvalRecords || approvalRecords.length === 0) {
      throw new Error(`No approved approvals found in ledger for request: ${requestId}. Cannot generate RFP without approvals.`);
    }

    // Fetch signature data separately for each approver to avoid HTTP header size limits
    console.log('🔄 Fetching signature data for each approver...');
    const approvalRecordsWithSignatures = await Promise.all(
      approvalRecords.map(async (record: any) => {
        let signatureData = null;

        // Check if approver_esig is already base64 data (starts with data:image)
        if (record.approver_esig && record.approver_esig.startsWith('data:image')) {
          signatureData = record.approver_esig;
        }
        // If signature_path exists (starts with attachments/), fetch from storage
        else if (record.approver_esig && record.approver_esig.startsWith('attachments/')) {
          try {
            const { data: fileData } = await supabase.storage
              .from('attachments')
              .download(record.approver_esig);

            if (fileData) {
              const arrayBuffer = await fileData.arrayBuffer();
              const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
              signatureData = `data:${fileData.type};base64,${base64}`;
            }
          } catch (error) {
            console.error(`Failed to fetch signature from storage for ${record.approver_name}:`, error);
          }
        }

        // If still no signature data, this shouldn't happen with the new RPC
        // but keep as final fallback
        if (!signatureData && record.approver_id) {
          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('e_sig')
            .eq('id', record.approver_id)
            .single();

          if (profileData?.e_sig) {
            signatureData = profileData.e_sig;
          }
        }

        return {
          ...record,
          signature_data: signatureData
        };
      })
    );

    // Transform RPC results to match expected format
    const approvals = (approvalRecordsWithSignatures || []).map((record: any) => ({
      approval_date: record.approval_date,
      sequence: record.sequence,
      approver: {
        full_name: record.approver_name,
        e_sig: record.signature_data
      }
    }));

    // Format payment mode lines
    const paymentModeLines: PaymentModeLine[] = [];

    // For PR, use payment_mode_lines if available
    if (requestType === 'purchase_requisition' && request.payment_mode_lines && Array.isArray(request.payment_mode_lines)) {
      // Map the PR payment_mode_lines structure to RFP structure
      paymentModeLines.push(...request.payment_mode_lines.map((line: any) => ({
        label: sanitizeForPDF(line.name || line.label || ''),
        value: sanitizeForPDF(line.value || '')
      })));
    } else if (request.payment_mode?.line_names && Array.isArray(request.payment_mode.line_names)) {
      for (const lineName of request.payment_mode.line_names) {
        paymentModeLines.push({
          label: sanitizeForPDF(lineName),
          value: '' // Values would come from request data if stored
        });
      }
    }

    console.log('Payment mode lines for RFP:', paymentModeLines);

    // Prepare RFP data - handle different field names between PR and others
    const rfpData: RFPData = {
      companyName: sanitizeForPDF(request.company?.name || 'Company Name'),
      requestType: requestType === 'purchase_requisition' ? 'Purchase Requisition' :
                   requestType === 'petty_cash' ? 'Petty Cash' : 'Reimbursement',
      documentNumber: sanitizeForPDF(requestNumber),
      dateOfRequest: new Date(request.request_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }),
      payee: sanitizeForPDF(request.payee || ''),
      purpose: sanitizeForPDF(request.purpose || request.description || ''),
      dateNeeded: (request.date_needed || request.date_required || request.required_date)
        ? new Date(request.date_needed || request.date_required || request.required_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          })
        : '',
      amount: parseFloat(request.amount || request.total_amount || request.amount_net_vat) || 0,
      budgeted: requestType === 'purchase_requisition' ? (request.is_budgeted !== false) : (request.budgeted !== false),
      paymentMode: sanitizeForPDF(request.payment_mode?.mode_name || ''),
      paymentModeLines,
      requestorName: sanitizeForPDF(request.requester?.full_name || ''),
      requestorEsig: request.requester?.e_sig || null,
      approvals: (approvals || []).map((a: any) => {
        console.log('Processing approval:', {
          raw: a,
          name: a.approver?.full_name,
          esig: a.approver?.e_sig ? 'Present' : 'Missing',
          date: a.approval_date,
          sequence: a.sequence
        });
        const approvalDate = new Date(a.approval_date);
        return {
          approver_name: sanitizeForPDF(a.approver?.full_name || ''),
          approver_esig: a.approver?.e_sig || null,
          approval_date: approvalDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }) + ' ' + approvalDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }),
          sequence: a.sequence
        };
      })
    };

    // Generate PDF
    console.log('Generating PDF with data:', rfpData);
    console.log('Total approvals being passed to PDF:', rfpData.approvals.length);
    rfpData.approvals.forEach((a, i) => {
      console.log(`Approval ${i + 1}:`, a.approver_name, 'Seq:', a.sequence, 'Date:', a.approval_date);
    });
    const pdfBytes = await generateRFP(rfpData);
    console.log('PDF generated, size:', pdfBytes.length);

    // Upload to storage
    const fileName = `rfp_${requestNumber}_${Date.now()}.pdf`;
    const filePath = `rfp/${fileName}`;

    console.log('Uploading PDF to:', filePath);
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    console.log('PDF uploaded successfully');

    // Update request with RFP path
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ rfp_pdf_path: filePath })
      .eq('id', requestId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw updateError;
    }

    console.log('Request updated with RFP path:', filePath);

    return filePath;
  } catch (error) {
    console.error('Error generating RFP:', error);
    throw error;
  }
}
