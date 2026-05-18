import { PDFDocument, StandardFonts, rgb, PDFImage } from 'pdf-lib';

interface POForPdf {
  po_number: string;
  vendor_name: string;
  vendor_address: string;
  vendor_contact: string;
  vendor_email: string;
  vendor_tin: string;
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
  page.drawText(clean(po.po_number), {
    x: width - margin - 130,
    y,
    size: 14,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });

  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.6, 0.6, 0.6),
  });

  y -= 22;

  // Vendor + PO meta
  const colW = (width - margin * 2 - 16) / 2;
  const leftX = margin;
  const rightX = margin + colW + 16;

  const drawLabel = (x: number, yy: number, label: string, value: string) => {
    page.drawText(label, { x, y: yy, size: 8, font: bold, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(clean(value) || '-', { x, y: yy - 11, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
  };

  drawLabel(leftX, y, 'VENDOR', po.vendor_name);
  drawLabel(rightX, y, 'PO DATE', po.po_date);
  y -= 26;
  drawLabel(leftX, y, 'ADDRESS', po.vendor_address);
  drawLabel(rightX, y, 'EXPECTED DELIVERY', po.expected_delivery_date || '-');
  y -= 26;
  drawLabel(leftX, y, 'CONTACT', po.vendor_contact);
  drawLabel(rightX, y, 'PAYMENT TERMS', po.payment_terms);
  y -= 26;
  drawLabel(leftX, y, 'TIN', po.vendor_tin);
  drawLabel(rightX, y, 'DEPARTMENT', po.department);
  y -= 26;
  drawLabel(leftX, y, 'EMAIL', po.vendor_email);
  drawLabel(rightX, y, 'DELIVERY ADDRESS', po.delivery_address);
  y -= 32;

  // Items header
  page.drawRectangle({
    x: margin,
    y: y - 4,
    width: width - margin * 2,
    height: 18,
    color: rgb(0.93, 0.95, 0.98),
  });
  const cols = [
    { label: 'DESCRIPTION', x: margin + 6, w: 220 },
    { label: 'UOM', x: margin + 230, w: 40 },
    { label: 'QTY', x: margin + 280, w: 40 },
    { label: 'UNIT PRICE', x: margin + 330, w: 80 },
    { label: 'TOTAL', x: margin + 420, w: 90 },
  ];
  cols.forEach((c) => {
    page.drawText(c.label, { x: c.x, y: y + 2, size: 8, font: bold, color: rgb(0.3, 0.3, 0.3) });
  });
  y -= 22;

  // Items rows
  for (const it of items) {
    if (y < 180) {
      const newPage = pdf.addPage([612, 792]);
      y = newPage.getSize().height - margin;
    }
    const desc = clean(it.item_description);
    const truncated = desc.length > 38 ? desc.slice(0, 36) + '...' : desc;
    page.drawText(truncated, { x: cols[0].x, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(clean(it.unit_of_measure) || '-', { x: cols[1].x, y, size: 9, font });
    page.drawText(Number(it.quantity).toFixed(2), { x: cols[2].x, y, size: 9, font });
    page.drawText(fmtMoney(Number(it.unit_price)), { x: cols[3].x, y, size: 9, font });
    page.drawText(fmtMoney(Number(it.total_price)), { x: cols[4].x, y, size: 9, font });
    y -= 16;
  }

  y -= 6;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.6,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 16;

  // Totals
  const totalsX = width - margin - 220;
  const drawTotal = (label: string, value: string, isBold = false) => {
    const f = isBold ? bold : font;
    page.drawText(label, { x: totalsX, y, size: 10, font: f, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(value, { x: width - margin - 70, y, size: 10, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= 14;
  };
  const ewtAmount = po.ewt_amount ?? items.reduce((sum, it) => sum + Number(it.ewt_amount || 0), 0);
  drawTotal('Subtotal', fmtMoney(Number(po.subtotal)));
  drawTotal('VAT (12%)', fmtMoney(Number(po.vat_amount)));
  if (ewtAmount > 0) {
    drawTotal('EWT', fmtMoney(ewtAmount));
  }
  drawTotal('Net Payable', fmtMoney(Number(po.total_amount)), true);

  y -= 12;

  // Delivery & remarks
  if (po.delivery_terms) {
    page.drawText('Delivery Terms:', { x: margin, y, size: 9, font: bold });
    y -= 12;
    page.drawText(clean(po.delivery_terms).slice(0, 110), { x: margin, y, size: 9, font });
    y -= 16;
  }
  if (po.remarks) {
    page.drawText('Remarks:', { x: margin, y, size: 9, font: bold });
    y -= 12;
    page.drawText(clean(po.remarks).slice(0, 110), { x: margin, y, size: 9, font });
    y -= 16;
  }

  // Signatories block
  y = Math.min(y, 160);
  const sigW = (width - margin * 2 - 30) / 3;
  const sigBlocks: Array<{ label: string; name?: string; esig?: string | null }> = [
    { label: 'Prepared By', name: po.prepared_by_name, esig: po.prepared_by_esig },
    { label: 'Approved By', name: po.approver_name, esig: po.approver_esig },
    { label: 'Received By' },
  ];

  for (let idx = 0; idx < sigBlocks.length; idx++) {
    const block = sigBlocks[idx];
    const x = margin + idx * (sigW + 15);

    // Draw e-signature above the line if available
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
        // Signature embed failed, skip
      }
    }

    // Line
    page.drawLine({
      start: { x, y },
      end: { x: x + sigW, y },
      thickness: 0.6,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Name below line
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
