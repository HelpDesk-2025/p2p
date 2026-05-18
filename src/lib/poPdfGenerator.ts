import { PDFDocument, StandardFonts, rgb, PDFImage, PDFPage, PDFFont } from 'pdf-lib';

interface POForPdf {
  po_number: string;
  vendor_name: string;
  vendor_address: string;
  vendor_contact: string;
  vendor_email: string;
  vendor_tin: string;
  vendor_bank_name?: string;
  vendor_bank_account?: string;
  vendor_bank_address?: string;
  company_name?: string;
  department: string;
  po_date: string;
  expected_delivery_date: string | null;
  delivery_address: string;
  payment_terms: string;
  delivery_terms: string;
  remarks: string;
  subtotal: number;
  vat_amount: number;
  ewt_amount?: number;
  total_amount: number;
  approver_name?: string;
  approver_esig?: string | null;
  prepared_by_name?: string;
  prepared_by_esig?: string | null;
}

interface POItemForPdf {
  item_description: string;
  unit_of_measure: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  ewt_amount?: number;
}

async function embedSignature(pdfDoc: PDFDocument, esigData: string): Promise<PDFImage> {
  const mimeMatch = esigData.match(/^data:(image\/[a-zA-Z+]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : 'image/png';
  const base64 = esigData.split(',')[1] || esigData;
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return pdfDoc.embedJpg(bytes);
  }
  return pdfDoc.embedPng(bytes);
}

function clean(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

function fmtMoney(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rightAlignText(page: PDFPage, text: string, rightEdge: number, y: number, size: number, f: PDFFont, color = rgb(0.1, 0.1, 0.1)) {
  const w = f.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightEdge - w, y, size, font: f, color });
}

export async function generatePurchaseOrderPdf(po: POForPdf, items: POItemForPdf[]): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 40;
  let y = height - margin;

  // Header
  page.drawText('PURCHASE ORDER', { x: margin, y, size: 18, font: bold, color: rgb(0.1, 0.2, 0.4) });
  const poNumText = clean(po.po_number);
  rightAlignText(page, poNumText, width - margin, y, 14, bold, rgb(0.1, 0.1, 0.1));

  y -= 10;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1.2,
    color: rgb(0.15, 0.25, 0.45),
  });

  y -= 24;

  // Two-column section: Vendor (left) | PO Details (right)
  const colGap = 14;
  const colW = (width - margin * 2 - colGap) / 2;
  const leftX = margin;
  const rightX = margin + colW + colGap;
  const rowH = 16;
  const sectionLabelSize = 9;
  const labelSize = 8;
  const valueSize = 9;

  // Section titles
  const sectionStartY = y;
  page.drawText('Vendor', { x: leftX + 6, y, size: sectionLabelSize, font: bold, color: rgb(0.15, 0.25, 0.45) });
  page.drawText('PO Details', { x: rightX + 6, y, size: sectionLabelSize, font: bold, color: rgb(0.15, 0.25, 0.45) });
  y -= 6;

  // Draw separator lines under section titles
  page.drawLine({ start: { x: leftX, y }, end: { x: leftX + colW, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  page.drawLine({ start: { x: rightX, y }, end: { x: rightX + colW, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 14;

  // Vendor rows (left)
  const vendorRows = [
    ['Name', po.vendor_name],
    ['Address', po.vendor_address],
    ['Contact', po.vendor_contact],
    ['Email', po.vendor_email],
    ['TIN', po.vendor_tin],
    ['Bank Name', po.vendor_bank_name || ''],
    ['Bank Account', po.vendor_bank_account || ''],
    ['Bank Address', po.vendor_bank_address || ''],
  ];

  // PO Details rows (right)
  const detailRows = [
    ['Company', po.company_name || ''],
    ['Department', po.department],
    ['PO Date', po.po_date],
    ['Expected Delivery', po.expected_delivery_date || ''],
    ['Delivery Address', po.delivery_address],
    ['Payment Terms', po.payment_terms],
    ['Delivery Terms', po.delivery_terms],
    ['Remarks', po.remarks],
  ];

  const maxRows = Math.max(vendorRows.length, detailRows.length);
  const labelColor = rgb(0.3, 0.3, 0.3);
  const valueColor = rgb(0.1, 0.1, 0.1);

  for (let i = 0; i < maxRows; i++) {
    if (i < vendorRows.length) {
      const [label, value] = vendorRows[i];
      page.drawText(label, { x: leftX + 6, y, size: labelSize, font, color: labelColor });
      const cleanVal = clean(value) || '\u2014';
      const truncVal = cleanVal.length > 32 ? cleanVal.slice(0, 30) + '...' : cleanVal;
      rightAlignText(page, truncVal, leftX + colW - 6, y, valueSize, font, valueColor);
    }
    if (i < detailRows.length) {
      const [label, value] = detailRows[i];
      page.drawText(label, { x: rightX + 6, y, size: labelSize, font, color: labelColor });
      const cleanVal = clean(value) || '\u2014';
      const truncVal = cleanVal.length > 32 ? cleanVal.slice(0, 30) + '...' : cleanVal;
      rightAlignText(page, truncVal, rightX + colW - 6, y, valueSize, font, valueColor);
    }
    y -= rowH;
  }

  // Draw border boxes around the sections
  const sectionH = sectionStartY - y + 6;
  page.drawRectangle({
    x: leftX, y: y - 2, width: colW, height: sectionH,
    borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.6, color: undefined,
  });
  page.drawRectangle({
    x: rightX, y: y - 2, width: colW, height: sectionH,
    borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.6, color: undefined,
  });

  y -= 20;

  // Line Items section
  page.drawText('Line Items', { x: leftX + 6, y, size: sectionLabelSize, font: bold, color: rgb(0.15, 0.25, 0.45) });
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 14;

  // Column positions for line items
  const tableW = width - margin * 2;
  const descW = tableW * 0.38;
  const uomW = tableW * 0.12;
  const qtyW = tableW * 0.12;
  const priceW = tableW * 0.19;
  const totalW = tableW * 0.19;

  const colPositions = [
    { label: 'DESCRIPTION', x: margin + 6 },
    { label: 'UOM', x: margin + descW },
    { label: 'QTY', x: margin + descW + uomW },
    { label: 'UNIT PRICE', x: margin + descW + uomW + qtyW },
    { label: 'TOTAL', x: margin + descW + uomW + qtyW + priceW },
  ];

  // Table header background
  page.drawRectangle({
    x: margin, y: y - 4, width: tableW, height: 16,
    color: rgb(0.94, 0.96, 0.98),
  });

  colPositions.forEach((c) => {
    page.drawText(c.label, { x: c.x, y: y, size: 7.5, font: bold, color: rgb(0.3, 0.3, 0.4) });
  });
  y -= 18;

  // Item rows
  for (const it of items) {
    if (y < 180) break;
    const desc = clean(it.item_description);
    const truncated = desc.length > 45 ? desc.slice(0, 43) + '...' : desc;
    page.drawText(truncated, { x: colPositions[0].x, y, size: 8.5, font, color: valueColor });
    page.drawText(clean(it.unit_of_measure) || '-', { x: colPositions[1].x, y, size: 8.5, font, color: valueColor });
    page.drawText(Number(it.quantity).toFixed(2), { x: colPositions[2].x, y, size: 8.5, font, color: valueColor });
    rightAlignText(page, fmtMoney(Number(it.unit_price)), colPositions[4].x - 10, y, 8.5, font, valueColor);
    rightAlignText(page, fmtMoney(Number(it.total_price)), width - margin - 6, y, 8.5, font, valueColor);
    y -= 15;
  }

  y -= 6;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.4,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 14;

  // Totals (right-aligned)
  const totalsLabelX = width - margin - 160;
  const totalsValueX = width - margin - 6;
  const ewtAmount = po.ewt_amount ?? items.reduce((sum, it) => sum + Number(it.ewt_amount || 0), 0);

  const drawTotalRow = (label: string, value: string, isBold = false) => {
    const f = isBold ? bold : font;
    const lColor = isBold ? rgb(0.1, 0.1, 0.1) : rgb(0.35, 0.35, 0.35);
    rightAlignText(page, label, totalsValueX - 80, y, 8.5, f, lColor);
    rightAlignText(page, value, totalsValueX, y, 8.5, f, rgb(0.1, 0.1, 0.1));
    y -= 14;
  };

  drawTotalRow('Net of VAT', fmtMoney(Number(po.subtotal)));
  drawTotalRow('VAT (12%)', fmtMoney(Number(po.vat_amount)));
  if (ewtAmount > 0) {
    drawTotalRow('EWT', fmtMoney(ewtAmount));
  }
  drawTotalRow('Net Payable', fmtMoney(Number(po.total_amount)), true);

  // Draw border box around line items + totals section
  const lineItemsSectionBottom = y - 4;
  const lineItemsSectionTop = sectionStartY - sectionH - 16;
  page.drawRectangle({
    x: margin, y: lineItemsSectionBottom, width: tableW, height: lineItemsSectionTop - lineItemsSectionBottom,
    borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.6, color: undefined,
  });

  // Signatories block
  y = Math.min(y - 30, 140);
  const sigW = (width - margin * 2 - 30) / 3;
  const sigBlocks: Array<{ label: string; name?: string; esig?: string | null }> = [
    { label: 'Prepared By', name: po.prepared_by_name, esig: po.prepared_by_esig },
    { label: 'Approved By', name: po.approver_name, esig: po.approver_esig },
    { label: 'Received By' },
  ];

  for (let idx = 0; idx < sigBlocks.length; idx++) {
    const block = sigBlocks[idx];
    const x = margin + idx * (sigW + 15);

    if (block.esig) {
      try {
        const sigImage = await embedSignature(pdf, block.esig);
        const sigHeight = 40;
        const sigWidth = Math.min(sigW - 10, sigHeight * (sigImage.width / sigImage.height));
        page.drawImage(sigImage, {
          x: x + (sigW - sigWidth) / 2,
          y: y + 4,
          width: sigWidth,
          height: sigHeight,
        });
      } catch (e) {
        // skip
      }
    }

    page.drawLine({
      start: { x, y },
      end: { x: x + sigW, y },
      thickness: 0.6,
      color: rgb(0.4, 0.4, 0.4),
    });

    if (block.name) {
      page.drawText(clean(block.name), { x, y: y - 12, size: 9, font: bold, color: rgb(0.1, 0.1, 0.1) });
      page.drawText(block.label, { x, y: y - 24, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    } else {
      page.drawText(block.label, { x, y: y - 12, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    }
  }

  // Footer
  page.drawText('Terms & Conditions: This Purchase Order is subject to the terms agreed upon by both parties.', {
    x: margin,
    y: 30,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
