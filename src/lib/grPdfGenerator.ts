import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface GRForPdf {
  gr_number: string;
  po_number: string;
  vendor_name: string;
  receipt_date: string;
  delivery_receipt_number: string;
  receipt_type: string;
  overall_condition: string;
  warehouse_location: string;
  remarks: string;
}

interface GRItemForPdf {
  item_description: string;
  unit_of_measure: string;
  ordered_quantity: number;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  condition: string;
  rejection_reason?: string;
  remarks?: string;
}

interface POExtras {
  vendor_address?: string;
  vendor_contact?: string;
  vendor_email?: string;
  vendor_tin?: string;
  department?: string;
  expected_delivery_date?: string | null;
}

function clean(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

function fmtNum(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function generateGRNPdf(
  gr: GRForPdf,
  items: GRItemForPdf[],
  poExtras: POExtras = {}
): Promise<Blob> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 40;
  let y = height - margin;

  // Header
  page.drawText('GOODS RECEIPT NOTE', { x: margin, y, size: 18, font: bold, color: rgb(0.1, 0.2, 0.4) });
  page.drawText(clean(gr.gr_number), {
    x: width - margin - 150,
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

  const colW = (width - margin * 2 - 16) / 2;
  const leftX = margin;
  const rightX = margin + colW + 16;

  const drawLabel = (x: number, yy: number, label: string, value: string) => {
    page.drawText(label, { x, y: yy, size: 8, font: bold, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(clean(value) || '-', { x, y: yy - 11, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
  };

  drawLabel(leftX, y, 'PO REFERENCE', gr.po_number);
  drawLabel(rightX, y, 'RECEIPT DATE', gr.receipt_date);
  y -= 26;
  drawLabel(leftX, y, 'VENDOR', gr.vendor_name);
  drawLabel(rightX, y, 'DR NUMBER', gr.delivery_receipt_number);
  y -= 26;
  drawLabel(leftX, y, 'VENDOR ADDRESS', poExtras.vendor_address || '-');
  drawLabel(rightX, y, 'RECEIPT TYPE', (gr.receipt_type || '').toUpperCase());
  y -= 26;
  drawLabel(leftX, y, 'CONTACT', poExtras.vendor_contact || '-');
  drawLabel(rightX, y, 'OVERALL CONDITION', (gr.overall_condition || '').toUpperCase());
  y -= 26;
  drawLabel(leftX, y, 'TIN', poExtras.vendor_tin || '-');
  drawLabel(rightX, y, 'DEPARTMENT', poExtras.department || '-');
  y -= 26;
  drawLabel(leftX, y, 'EMAIL', poExtras.vendor_email || '-');
  drawLabel(rightX, y, 'WAREHOUSE / LOCATION', gr.warehouse_location || '-');
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
    { label: 'DESCRIPTION', x: margin + 6 },
    { label: 'UOM', x: margin + 200 },
    { label: 'ORD', x: margin + 240 },
    { label: 'RCVD', x: margin + 285 },
    { label: 'ACPT', x: margin + 335 },
    { label: 'REJ', x: margin + 385 },
    { label: 'CONDITION', x: margin + 430 },
  ];
  cols.forEach((c) => {
    page.drawText(c.label, { x: c.x, y: y + 2, size: 8, font: bold, color: rgb(0.3, 0.3, 0.3) });
  });
  y -= 22;

  const ensureSpace = (needed: number) => {
    if (y < margin + needed) {
      page = pdf.addPage([612, 792]);
      y = page.getSize().height - margin;
    }
  };

  for (const it of items) {
    ensureSpace(40);
    const desc = clean(it.item_description);
    const truncated = desc.length > 32 ? desc.slice(0, 30) + '...' : desc;
    page.drawText(truncated, { x: cols[0].x, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(clean(it.unit_of_measure) || '-', { x: cols[1].x, y, size: 9, font });
    page.drawText(fmtNum(Number(it.ordered_quantity)), { x: cols[2].x, y, size: 9, font });
    page.drawText(fmtNum(Number(it.received_quantity)), { x: cols[3].x, y, size: 9, font });
    page.drawText(fmtNum(Number(it.accepted_quantity)), { x: cols[4].x, y, size: 9, font });
    page.drawText(fmtNum(Number(it.rejected_quantity)), { x: cols[5].x, y, size: 9, font });
    page.drawText(clean(it.condition).replace(/_/g, ' '), {
      x: cols[6].x,
      y,
      size: 9,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 14;

    if (Number(it.rejected_quantity) > 0 && it.rejection_reason) {
      ensureSpace(14);
      page.drawText(`Rejection: ${clean(it.rejection_reason).slice(0, 90)}`, {
        x: cols[0].x + 8,
        y,
        size: 8,
        font,
        color: rgb(0.6, 0.2, 0.2),
      });
      y -= 12;
    }
  }

  y -= 6;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.6,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 16;

  if (gr.remarks) {
    ensureSpace(30);
    page.drawText('Remarks:', { x: margin, y, size: 9, font: bold });
    y -= 12;
    page.drawText(clean(gr.remarks).slice(0, 120), { x: margin, y, size: 9, font });
    y -= 16;
  }

  // Signatories block
  ensureSpace(80);
  y = Math.max(y, 140);
  y -= 30;
  const sigW = (width - margin * 2 - 30) / 3;
  const sigBlocks = ['Received By', 'Inspected By', 'Noted By'];
  sigBlocks.forEach((label, idx) => {
    const x = margin + idx * (sigW + 15);
    page.drawLine({
      start: { x, y },
      end: { x: x + sigW, y },
      thickness: 0.6,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(label, { x, y: y - 12, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    page.drawText('Name & Signature over Date', {
      x,
      y: y - 24,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  });

  // Footer
  page.drawText(
    'This Goods Receipt Note certifies the receipt and inspection of items against the referenced Purchase Order.',
    {
      x: margin,
      y: 40,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    }
  );

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
