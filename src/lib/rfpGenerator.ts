import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabase } from './supabase';
import { mergeRFPWithAttachments } from './pdfMerger';

interface PaymentModeLine {
  label: string;
  value: string;
}

interface ApprovalRecord {
  approver_name: string;
  approver_esig: string | null;
  approval_date: string;
  sequence: number;
}

interface RFPData {
  companyName: string;
  requestType: string;
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

  // Helper function to draw text
  const drawText = (text: string, x: number, y: number, size = 10, isBold = false) => {
    if (!text || text.trim() === '') return; // Skip empty text
    page.drawText(text, {
      x,
      y,
      size,
      font: isBold ? boldFont : font,
      color: rgb(0, 0, 0),
    });
  };

  // Company Name (centered)
  const companyNameWidth = boldFont.widthOfTextAtSize(data.companyName, 16);
  drawText(data.companyName, (width - companyNameWidth) / 2, yPosition, 16, true);
  yPosition -= 30;

  // Request Type (centered)
  const locationText = data.requestType === 'Petty Cash' ? 'Taytay Rizal' : 'Taytay Rizal';
  const locationWidth = font.widthOfTextAtSize(locationText, 10);
  drawText(locationText, (width - locationWidth) / 2, yPosition, 10, false);
  yPosition -= 15;

  const rfpTitleWidth = boldFont.widthOfTextAtSize('REQUEST FOR PAYMENT', 12);
  drawText('REQUEST FOR PAYMENT', (width - rfpTitleWidth) / 2, yPosition, 12, true);
  yPosition -= 30;

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
  const purposeWords = data.purpose.split(' ');
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
      const esigData = data.requestorEsig.split(',')[1] || data.requestorEsig;
      const esigBytes = Uint8Array.from(atob(esigData), c => c.charCodeAt(0));
      const esigImage = await pdfDoc.embedPng(esigBytes);
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
        const esigData = approval.approver_esig.split(',')[1] || approval.approver_esig;
        const esigBytes = Uint8Array.from(atob(esigData), c => c.charCodeAt(0));
        const esigImage = await pdfDoc.embedPng(esigBytes);
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
    drawText(approval.approval_date, leftMargin, yPosition, 10, false);
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
          const esigData = approval.approver_esig.split(',')[1] || approval.approver_esig;
          const esigBytes = Uint8Array.from(atob(esigData), c => c.charCodeAt(0));
          const esigImage = await pdfDoc.embedPng(esigBytes);
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
      drawText(approval.approval_date, leftMargin, leftY, 10, false);
      leftY -= 30;
    }

    // Final Approval on the right
    const rightMargin = width / 2 + 50;
    let rightY = yPosition;
    drawText('APPROVED BY:', rightMargin, rightY, 10, true);
    rightY -= 10;

    if (finalApprover.approver_esig) {
      try {
        const esigData = finalApprover.approver_esig.split(',')[1] || finalApprover.approver_esig;
        const esigBytes = Uint8Array.from(atob(esigData), c => c.charCodeAt(0));
        const esigImage = await pdfDoc.embedPng(esigBytes);
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
    drawText(finalApprover.approval_date, rightMargin, rightY, 10, false);

    yPosition = Math.min(leftY, rightY);
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

interface CanvassSheetData {
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

async function generateCanvassSheet(data: CanvassSheetData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([792, 612]); // Landscape orientation
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  let yPosition = height - 50;

  const drawText = (text: string, x: number, y: number, size = 9, isBold = false) => {
    if (!text || text.trim() === '') return;
    page.drawText(text, {
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
    const words = text.split(' ');
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
  const companyNameWidth = boldFont.widthOfTextAtSize(data.companyName, 14);
  drawText(data.companyName, (width - companyNameWidth) / 2, yPosition, 14, true);
  yPosition -= 15;

  // Company Address (centered)
  const addressWidth = font.widthOfTextAtSize(data.companyAddress, 9);
  drawText(data.companyAddress, (width - addressWidth) / 2, yPosition, 9, false);
  yPosition -= 12;

  // VAT TIN (centered)
  const vatTinWidth = font.widthOfTextAtSize(data.vatTin, 9);
  drawText(data.vatTin, (width - vatTinWidth) / 2, yPosition, 9, false);
  yPosition -= 20;

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
  const supplierColWidth = (tableRight - tableLeft - 200) / data.suppliers.length;

  // Draw table structure
  drawLine(tableLeft, yPosition, tableRight, yPosition);
  yPosition -= 15;

  // Supplier headers with highlighting for winner
  drawText('Supplier Name', tableLeft + 5, yPosition, 9, true);
  let supplierX = tableLeft + 200;
  data.suppliers.forEach((supplier) => {
    // Highlight winning vendor background
    if (supplier.isWinner) {
      page.drawRectangle({
        x: supplierX,
        y: yPosition - 8,
        width: supplierColWidth,
        height: 22,
        color: rgb(0.8, 1, 0.8),
      });
    }

    // Draw supplier name centered in the column with "AWARDED" label
    const supplierName = supplier.name || 'N/A';
    let displayName = supplier.isWinner ? `${supplierName} - AWARDED` : supplierName;

    // Truncate supplier name if too long
    const maxNameWidth = supplierColWidth - 10;
    let nameWidth = boldFont.widthOfTextAtSize(displayName, 9);

    while (nameWidth > maxNameWidth && displayName.length > 3) {
      if (supplier.isWinner) {
        // For winner, trim the supplier name part
        const suffix = ' - AWARDED';
        const nameOnly = displayName.substring(0, displayName.length - suffix.length);
        const trimmedName = nameOnly.substring(0, nameOnly.length - 1);
        displayName = trimmedName + suffix;
      } else {
        displayName = displayName.substring(0, displayName.length - 1);
      }
      nameWidth = boldFont.widthOfTextAtSize(displayName + '...', 9);
    }

    if (supplier.isWinner && displayName.length < (supplierName + ' - AWARDED').length && !displayName.endsWith('...')) {
      const suffix = ' - AWARDED';
      displayName = displayName.substring(0, displayName.length - suffix.length) + '...' + suffix;
    } else if (!supplier.isWinner && displayName.length < supplierName.length) {
      displayName = displayName + '...';
    }

    const supplierNameWidth = boldFont.widthOfTextAtSize(displayName, 9);
    const centerX = supplierX + (supplierColWidth - supplierNameWidth) / 2;

    page.drawText(displayName, {
      x: centerX,
      y: yPosition,
      size: 9,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    supplierX += supplierColWidth;
  });
  yPosition -= 15;
  drawLine(tableLeft, yPosition, tableRight, yPosition);

  // Column headers
  yPosition -= 12;
  drawText('No', tableLeft + 5, yPosition, 8, true);
  drawText('Details', tableLeft + 25, yPosition, 8, true);
  drawText('Qty.', tableLeft + 120, yPosition, 8, true);
  drawText('Unit', tableLeft + 150, yPosition, 8, true);

  supplierX = tableLeft + 200;
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
    const upWidth = boldFont.widthOfTextAtSize('UP', 8);
    const amountWidth = boldFont.widthOfTextAtSize('Amount', 8);
    const leftColX = supplierX + (supplierColWidth * 0.25) - (upWidth / 2);
    const rightColX = supplierX + (supplierColWidth * 0.75) - (amountWidth / 2);

    drawText('UP', leftColX, yPosition, 8, true);
    drawText('Amount', rightColX, yPosition, 8, true);
    supplierX += supplierColWidth;
  });
  yPosition -= 12;
  drawLine(tableLeft, yPosition, tableRight, yPosition);

  // Items
  data.items.forEach((item, index) => {
    yPosition -= 12;
    drawText(`${index + 1}`, tableLeft + 5, yPosition, 8, false);
    drawText(item.description, tableLeft + 25, yPosition, 8, false);
    drawText(item.quantity.toString(), tableLeft + 120, yPosition, 8, false);
    drawText(item.unit, tableLeft + 150, yPosition, 8, false);

    supplierX = tableLeft + 200;
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

      const quotation = supplier.quotations[index];
      if (quotation) {
        const upText = quotation.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 });
        const amountText = quotation.amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
        const upTextWidth = font.widthOfTextAtSize(upText, 8);
        const amountTextWidth = font.widthOfTextAtSize(amountText, 8);

        const leftColX = supplierX + (supplierColWidth * 0.25) - (upTextWidth / 2);
        const rightColX = supplierX + (supplierColWidth * 0.75) - (amountTextWidth / 2);

        drawText(upText, leftColX, yPosition, 8, false);
        drawText(amountText, rightColX, yPosition, 8, false);
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
    drawText(rowLabel, tableLeft + 25, yPosition, 8, rowLabel === 'Net Payable' ? true : false);

    supplierX = tableLeft + 200;
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
    yPosition -= 10;
    drawText(label, tableLeft + 5, yPosition, 8, true);

    supplierX = tableLeft + 200;
    data.suppliers.forEach((supplier) => {
      // Highlight winning vendor info cells
      if (supplier.isWinner) {
        page.drawRectangle({
          x: supplierX,
          y: yPosition - 3,
          width: supplierColWidth,
          height: 12,
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

      // Truncate text if it's too long for the column
      const maxTextWidth = supplierColWidth - 20;
      let displayValue = value;
      let textWidth = font.widthOfTextAtSize(displayValue, 7);

      while (textWidth > maxTextWidth && displayValue.length > 3) {
        displayValue = displayValue.substring(0, displayValue.length - 1);
        textWidth = font.widthOfTextAtSize(displayValue + '...', 7);
      }

      if (displayValue.length < value.length) {
        displayValue = displayValue + '...';
      }

      drawText(displayValue, supplierX + 10, yPosition, 7, false);
      supplierX += supplierColWidth;
    });
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
        const esigData = approval.approver_esig.split(',')[1] || approval.approver_esig;
        const esigBytes = Uint8Array.from(atob(esigData), c => c.charCodeAt(0));
        const esigImage = await pdfDoc.embedPng(esigBytes);
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
    drawText(approval.approval_date, leftMargin, yPosition, 9, false);
  } else if (totalApprovals >= 2) {
    const recommendingApprovers = data.approvals.slice(0, -1);
    const finalApprover = data.approvals[data.approvals.length - 1];

    let leftY = yPosition;
    drawText('RECOMMENDING APPROVAL:', leftMargin, leftY, 9, true);
    leftY -= 10;

    for (const approval of recommendingApprovers) {
      if (approval.approver_esig) {
        try {
          const esigData = approval.approver_esig.split(',')[1] || approval.approver_esig;
          const esigBytes = Uint8Array.from(atob(esigData), c => c.charCodeAt(0));
          const esigImage = await pdfDoc.embedPng(esigBytes);
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
      drawText(approval.approval_date, leftMargin, leftY, 9, false);
      leftY -= 20;
    }

    const rightMargin = width / 2 + 50;
    let rightY = yPosition;
    drawText('APPROVED BY:', rightMargin, rightY, 9, true);
    rightY -= 10;

    if (finalApprover.approver_esig) {
      try {
        const esigData = finalApprover.approver_esig.split(',')[1] || finalApprover.approver_esig;
        const esigBytes = Uint8Array.from(atob(esigData), c => c.charCodeAt(0));
        const esigImage = await pdfDoc.embedPng(esigBytes);
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
    drawText(finalApprover.approval_date, rightMargin, rightY, 9, false);
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
        requester:user_profiles!requester_id(full_name, e_sig, company:companies(name)),
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
    const winningVendor = winningVendorData?.name || '';
    console.log('Winning vendor:', winningVendor);

    // Calculate net payable for the winning vendor
    const winningTotal = parseFloat(winningVendorData?.total || winningVendorData?.purchase_price || 0);
    const winningNetOfVat = parseFloat(winningVendorData?.net_of_vat || (winningTotal / 1.12));
    const winningEwt = parseFloat(winningVendorData?.ewt || (winningNetOfVat * 0.02));
    const winningNetPayable = parseFloat(winningVendorData?.net_payable || (winningTotal - winningEwt));
    console.log('Winning vendor net payable:', winningNetPayable);

    const { data: approvals, error: approvalsError } = await supabase
      .from('approval_ledger')
      .select(`
        approval_date,
        sequence,
        approver:user_profiles!approver_id(full_name, e_sig)
      `)
      .eq('request_id', canvassId)
      .eq('request_type', 'Canvass')
      .eq('action', 'Approved')
      .order('sequence', { ascending: true });

    if (approvalsError) {
      console.error('Error fetching approvals:', approvalsError);
      throw approvalsError;
    }

    console.log('Approvals fetched:', approvals);

    const rfpData: RFPData = {
      companyName: canvass.requester?.company?.name || 'Company Name',
      requestType: 'Canvass',
      dateOfRequest: new Date(canvass.request_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }),
      payee: winningVendor,
      purpose: canvass.pr?.purpose || '',
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
      requestorName: canvass.requester?.full_name || '',
      requestorEsig: canvass.requester?.e_sig || null,
      approvals: (approvals || []).map((a: any) => {
        const approvalDate = new Date(a.approval_date);
        return {
          approver_name: a.approver?.full_name || '',
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
      companyName: canvass.requester?.company?.name || 'Company Name',
      companyAddress: 'No. 5 Executive Hills Brgy. Dolores, Taytay, Rizal',
      vatTin: 'VAT REG TIN : 000-245-972-000',
      date: new Date(canvass.request_date).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      }),
      requestFor: canvass.pr?.purpose || '',
      items: (canvass.items || []).map((item: any, itemIndex: number) => {
        // Use the first supplier's quantity as the canonical quantity if PR items don't have it
        const firstSupplierQty = canvass.suppliers?.[0]?.quantity;
        return {
          description: item.description || '',
          quantity: item.quantity || firstSupplierQty || 0,
          unit: item.unit || ''
        };
      }),
      suppliers: (canvass.suppliers || []).map((supplier: any, supplierIndex: number) => {
        const quotations = (canvass.items || []).map((item: any) => ({
          unitPrice: parseFloat(supplier.unit_price || 0),
          amount: parseFloat(supplier.quoted_amount || 0)
        }));

        const total = parseFloat(supplier.total || supplier.purchase_price || 0);
        const netOfVat = parseFloat(supplier.net_of_vat || (total / 1.12));
        const vat12 = parseFloat(supplier.vat_12 || (total - netOfVat));
        const ewt = parseFloat(supplier.ewt || (netOfVat * 0.02));
        const netPayable = parseFloat(supplier.net_payable || (total - ewt));
        const isWinner = supplierIndex === (canvass.recommended_quotation_index || 0);

        return {
          name: supplier.vendor_name || supplier.name || '',
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
          registeredName: supplier.registered_name || supplier.vendor_name || '',
          address: supplier.complete_address || supplier.address || '',
          tin: supplier.tin || '',
          contactPerson: supplier.contact_person || '',
          contactNo: supplier.contact_no || '',
          email: supplier.email_address || supplier.email || '',
          bankAccount: supplier.bank_account_no || '',
          depositoryBank: supplier.depository_bank || '',
          isWinner,
          quotationFilePath: supplier.quotation_file_path || null
        };
      }),
      approvals: (approvals || []).map((a: any) => {
        const approvalDate = new Date(a.approval_date);
        return {
          approver_name: a.approver?.full_name || '',
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

    // Different query for PR vs others (PR doesn't have company_id directly)
    const selectQuery = requestType === 'purchase_requisition'
      ? `
        *,
        requester:user_profiles!requester_id(full_name, e_sig, company:companies(name)),
        payment_mode:payment_modes!payment_mode_id(mode_name, line_names)
      `
      : `
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

    // Fetch approval records
    const requestTypeName = requestType === 'purchase_requisition' ? 'Purchase Requisition' :
                           requestType === 'petty_cash' ? 'Petty Cash' : 'Reimbursement';

    const { data: approvals, error: approvalsError } = await supabase
      .from('approval_ledger')
      .select(`
        approval_date,
        sequence,
        approver:user_profiles!approver_id(full_name, e_sig)
      `)
      .eq('request_id', requestId)
      .eq('request_type', requestTypeName)
      .eq('action', 'Approved')
      .order('sequence', { ascending: true });

    if (approvalsError) {
      console.error('Error fetching approvals:', approvalsError);
      throw approvalsError;
    }

    console.log('Approvals fetched:', approvals);
    console.log('Number of approvals:', approvals?.length || 0);

    if (!approvals || approvals.length === 0) {
      console.warn('No approved approvals found in ledger for request:', requestId);
    }

    // Format payment mode lines
    const paymentModeLines: PaymentModeLine[] = [];

    // For PR, use payment_mode_lines if available
    if (requestType === 'purchase_requisition' && request.payment_mode_lines && Array.isArray(request.payment_mode_lines)) {
      // Map the PR payment_mode_lines structure to RFP structure
      paymentModeLines.push(...request.payment_mode_lines.map((line: any) => ({
        label: line.name || line.label || '',
        value: line.value || ''
      })));
    } else if (request.payment_mode?.line_names && Array.isArray(request.payment_mode.line_names)) {
      for (const lineName of request.payment_mode.line_names) {
        paymentModeLines.push({
          label: lineName,
          value: '' // Values would come from request data if stored
        });
      }
    }

    console.log('Payment mode lines for RFP:', paymentModeLines);

    // Prepare RFP data - handle different field names between PR and others
    const rfpData: RFPData = {
      companyName: requestType === 'purchase_requisition'
        ? (request.requester?.company?.name || 'Company Name')
        : (request.company?.name || 'Company Name'),
      requestType: requestType === 'purchase_requisition' ? 'Purchase Requisition' :
                   requestType === 'petty_cash' ? 'Petty Cash' : 'Reimbursement',
      dateOfRequest: new Date(request.request_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }),
      payee: request.payee || '',
      purpose: request.purpose || request.description || '',
      dateNeeded: (request.date_needed || request.date_required || request.required_date)
        ? new Date(request.date_needed || request.date_required || request.required_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          })
        : '',
      amount: parseFloat(request.amount || request.total_amount || request.amount_net_vat) || 0,
      budgeted: requestType === 'purchase_requisition' ? (request.is_budgeted !== false) : (request.budgeted !== false),
      paymentMode: request.payment_mode?.mode_name || '',
      paymentModeLines,
      requestorName: request.requester?.full_name || '',
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
          approver_name: a.approver?.full_name || '',
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
