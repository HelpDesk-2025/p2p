import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface InvoiceForPdf {
  invoice_ref_number: string;
  po_number: string;
  invoice_number: string;
  vendor_name: string;
  vendor_tin: string;
  invoice_date: string | null;
  received_date: string | null;
  due_date: string | null;
  payment_terms: string;
  subtotal: number;
  vat_amount: number;
  ewt_amount: number;
  total_amount: number;
  net_payable: number;
  match_status: string;
  match_score: number | null;
  status: string;
  resolution_notes?: string | null;
}

interface InvoiceItemForPdf {
  item_description: string;
  unit_of_measure: string;
  po_quantity: number;
  gr_accepted_quantity: number;
  invoiced_quantity: number;
  po_unit_price: number;
  invoiced_unit_price: number;
  invoiced_total_price: number;
  qty_match: string;
  price_match: string;
  qty_variance: number;
  price_variance_amount: number;
  price_variance_percentage: number;
  item_match_status: string;
}

function clean(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

function fmtMoney(n: number): string {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n: number, dp = 2): string {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export async function generateInvoiceMatchPdf(
  inv: InvoiceForPdf,
  items: InvoiceItemForPdf[]
): Promise<Blob> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 36;
  let y = height - margin;

  page.drawText('INVOICE VERIFICATION REPORT', {
    x: margin, y, size: 16, font: bold, color: rgb(0.1, 0.2, 0.4),
  });
  page.drawText(clean(inv.invoice_ref_number), {
    x: width - margin - 130, y, size: 13, font: bold, color: rgb(0.1, 0.1, 0.1),
  });
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  y -= 18;

  const colW = (width - margin * 2 - 16) / 2;
  const leftX = margin;
  const rightX = margin + colW + 16;

  const drawLabel = (x: number, yy: number, label: string, value: string) => {
    page.drawText(label, { x, y: yy, size: 8, font: bold, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(clean(value) || '-', { x, y: yy - 11, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
  };

  drawLabel(leftX, y, 'PO REFERENCE', inv.po_number);
  drawLabel(rightX, y, 'VENDOR INVOICE NO.', inv.invoice_number);
  y -= 24;
  drawLabel(leftX, y, 'VENDOR', inv.vendor_name);
  drawLabel(rightX, y, 'TIN', inv.vendor_tin);
  y -= 24;
  drawLabel(leftX, y, 'INVOICE DATE', inv.invoice_date || '-');
  drawLabel(rightX, y, 'RECEIVED DATE', inv.received_date || '-');
  y -= 24;
  drawLabel(leftX, y, 'PAYMENT TERMS', inv.payment_terms);
  drawLabel(rightX, y, 'DUE DATE', inv.due_date || '-');
  y -= 24;
  drawLabel(leftX, y, 'MATCH STATUS', (inv.match_status || '').toUpperCase());
  drawLabel(rightX, y, 'MATCH SCORE', inv.match_score != null ? `${Number(inv.match_score).toFixed(1)}%` : '-');
  y -= 28;

  // Items header
  page.drawRectangle({
    x: margin, y: y - 4, width: width - margin * 2, height: 18, color: rgb(0.93, 0.95, 0.98),
  });
  const headers: { label: string; x: number }[] = [
    { label: 'ITEM', x: margin + 4 },
    { label: 'PO QTY', x: margin + 170 },
    { label: 'GR QTY', x: margin + 210 },
    { label: 'INV QTY', x: margin + 252 },
    { label: 'PO PRICE', x: margin + 295 },
    { label: 'INV PRICE', x: margin + 350 },
    { label: 'TOTAL', x: margin + 410 },
    { label: 'MATCH', x: margin + 470 },
  ];
  headers.forEach((h) => {
    page.drawText(h.label, { x: h.x, y: y + 2, size: 8, font: bold, color: rgb(0.3, 0.3, 0.3) });
  });
  y -= 22;

  const ensureSpace = (needed: number) => {
    if (y < margin + needed) {
      page = pdf.addPage([612, 792]);
      y = page.getSize().height - margin;
    }
  };

  for (const it of items) {
    ensureSpace(26);
    const desc = clean(it.item_description);
    const truncated = desc.length > 28 ? desc.slice(0, 26) + '...' : desc;
    page.drawText(truncated, { x: headers[0].x, y, size: 8, font, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(fmtNum(it.po_quantity), { x: headers[1].x, y, size: 8, font });
    page.drawText(fmtNum(it.gr_accepted_quantity), { x: headers[2].x, y, size: 8, font });
    page.drawText(fmtNum(it.invoiced_quantity), { x: headers[3].x, y, size: 8, font });
    page.drawText(fmtMoney(it.po_unit_price), { x: headers[4].x, y, size: 8, font });
    page.drawText(fmtMoney(it.invoiced_unit_price), { x: headers[5].x, y, size: 8, font });
    page.drawText(fmtMoney(it.invoiced_total_price), { x: headers[6].x, y, size: 8, font });
    const matchColor = it.item_match_status === 'matched' ? rgb(0.13, 0.55, 0.27) : rgb(0.75, 0.15, 0.15);
    page.drawText(it.item_match_status === 'matched' ? 'MATCH' : 'MISMATCH', {
      x: headers[7].x, y, size: 8, font: bold, color: matchColor,
    });
    y -= 12;

    if (it.item_match_status === 'mismatched') {
      ensureSpace(10);
      const variance = `Qty: ${it.qty_match.toUpperCase()} (${fmtNum(it.qty_variance)})  |  Price: ${it.price_match.toUpperCase()} (${fmtMoney(it.price_variance_amount)} / ${Number(it.price_variance_percentage).toFixed(2)}%)`;
      page.drawText(variance, { x: margin + 8, y, size: 7, font, color: rgb(0.55, 0.2, 0.2) });
      y -= 11;
    }
  }

  y -= 4;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.6, color: rgb(0.7, 0.7, 0.7) });
  y -= 14;

  const totalsX = width - margin - 220;
  const drawTotal = (label: string, value: string, isBold = false) => {
    const f = isBold ? bold : font;
    page.drawText(label, { x: totalsX, y, size: 9, font: f, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(value, { x: width - margin - 70, y, size: 9, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= 13;
  };
  drawTotal('Subtotal', fmtMoney(inv.subtotal));
  drawTotal('VAT (12%)', fmtMoney(inv.vat_amount));
  drawTotal('EWT', fmtMoney(inv.ewt_amount));
  drawTotal('TOTAL', fmtMoney(inv.total_amount), true);
  drawTotal('NET PAYABLE', fmtMoney(inv.net_payable), true);

  y -= 6;
  if (inv.resolution_notes) {
    ensureSpace(40);
    page.drawText('Resolution Notes:', { x: margin, y, size: 9, font: bold });
    y -= 12;
    page.drawText(clean(inv.resolution_notes).slice(0, 140), { x: margin, y, size: 8, font });
    y -= 16;
  }

  // Signatories
  ensureSpace(70);
  y = Math.max(y, 110);
  y -= 30;
  const sigW = (width - margin * 2 - 30) / 3;
  ['Prepared By', 'Verified By', 'Approved By'].forEach((label, idx) => {
    const x = margin + idx * (sigW + 15);
    page.drawLine({ start: { x, y }, end: { x: x + sigW, y }, thickness: 0.6, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(label, { x, y: y - 12, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) });
    page.drawText('Signature over Date', { x, y: y - 22, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
  });

  page.drawText('Three-Way Match: Purchase Order, Goods Receipt, Vendor Invoice', {
    x: margin, y: 36, size: 7, font, color: rgb(0.5, 0.5, 0.5),
  });

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
