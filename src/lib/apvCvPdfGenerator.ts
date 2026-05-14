import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function clean(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}
function fmt(n: number): string {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface ApvPdfData {
  apv_number: string;
  posting_date: string;
  vendor_name: string;
  vendor_tin: string;
  vendor_address: string;
  po_number: string;
  invoice_number: string;
  payment_terms: string;
  due_date: string | null;
  gl_account_code: string;
  gl_account_name: string;
  cost_center: string;
  department: string;
  expense_category: string;
  invoice_amount: number;
  vat_amount: number;
  ewt_rate: number;
  ewt_amount: number;
  other_deductions: number;
  net_payable: number;
  remarks: string;
}

export async function generateApvPdf(data: ApvPdfData): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const m = 36;
  let y = height - m;

  page.drawText('ACCOUNTS PAYABLE VOUCHER', { x: m, y, size: 16, font: bold, color: rgb(0.1, 0.2, 0.4) });
  page.drawText(clean(data.apv_number), { x: width - m - 130, y, size: 13, font: bold });
  y -= 8;
  page.drawLine({ start: { x: m, y }, end: { x: width - m, y }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  y -= 18;

  const drawField = (x: number, yy: number, label: string, value: string) => {
    page.drawText(label, { x, y: yy, size: 8, font: bold, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(clean(value) || '-', { x, y: yy - 11, size: 10, font });
  };
  const colW = (width - m * 2 - 16) / 2;
  drawField(m, y, 'POSTING DATE', data.posting_date);
  drawField(m + colW + 16, y, 'DUE DATE', data.due_date || '-');
  y -= 24;
  drawField(m, y, 'VENDOR', data.vendor_name);
  drawField(m + colW + 16, y, 'TIN', data.vendor_tin);
  y -= 24;
  drawField(m, y, 'PO NUMBER', data.po_number);
  drawField(m + colW + 16, y, 'INVOICE NO.', data.invoice_number);
  y -= 24;
  drawField(m, y, 'PAYMENT TERMS', data.payment_terms);
  drawField(m + colW + 16, y, 'DEPARTMENT', data.department);
  y -= 28;

  page.drawRectangle({ x: m, y: y - 4, width: width - m * 2, height: 18, color: rgb(0.93, 0.95, 0.98) });
  page.drawText('GL CODING', { x: m + 4, y: y + 2, size: 9, font: bold, color: rgb(0.2, 0.2, 0.4) });
  y -= 22;
  drawField(m, y, 'GL ACCOUNT CODE', data.gl_account_code);
  drawField(m + colW + 16, y, 'ACCOUNT NAME', data.gl_account_name);
  y -= 24;
  drawField(m, y, 'COST CENTER', data.cost_center);
  drawField(m + colW + 16, y, 'EXPENSE CATEGORY', data.expense_category);
  y -= 32;

  page.drawRectangle({ x: m, y: y - 4, width: width - m * 2, height: 18, color: rgb(0.93, 0.95, 0.98) });
  page.drawText('AMOUNTS', { x: m + 4, y: y + 2, size: 9, font: bold, color: rgb(0.2, 0.2, 0.4) });
  y -= 24;
  const tx = width - m - 220;
  const drawAmt = (label: string, v: number, isB = false) => {
    const f = isB ? bold : font;
    page.drawText(label, { x: tx, y, size: 9, font: f });
    page.drawText(fmt(v), { x: width - m - 70, y, size: 9, font: f });
    y -= 13;
  };
  drawAmt('Invoice Amount', data.invoice_amount);
  drawAmt('VAT (12%)', data.vat_amount);
  drawAmt(`EWT (${data.ewt_rate}%)`, -data.ewt_amount);
  drawAmt('Other Deductions', -data.other_deductions);
  drawAmt('NET PAYABLE', data.net_payable, true);
  y -= 6;

  if (data.remarks) {
    page.drawText('Remarks:', { x: m, y, size: 9, font: bold });
    y -= 12;
    page.drawText(clean(data.remarks).slice(0, 180), { x: m, y, size: 8, font });
    y -= 16;
  }

  // Signatures
  const sigY = 100;
  const sigW = (width - m * 2 - 30) / 3;
  ['Prepared By', 'Reviewed By', 'Approved By'].forEach((label, i) => {
    const x = m + i * (sigW + 15);
    page.drawLine({ start: { x, y: sigY }, end: { x: x + sigW, y: sigY }, thickness: 0.6 });
    page.drawText(label, { x, y: sigY - 12, size: 9, font: bold });
    page.drawText('Signature over Date', { x, y: sigY - 22, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
  });
  page.drawText('AP Voucher - Three-Way Match Verified', {
    x: m, y: 36, size: 7, font, color: rgb(0.5, 0.5, 0.5),
  });

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function chunkToWords(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + chunkToWords(n % 100) : '');
}

export function amountToWordsPHP(amount: number): string {
  const sign = amount < 0 ? 'Negative ' : '';
  const abs = Math.abs(amount);
  const pesos = Math.floor(abs);
  const cents = Math.round((abs - pesos) * 100);
  if (pesos === 0) return `${sign}Zero Pesos and ${cents.toString().padStart(2, '0')}/100 Only`;
  const groups = ['', 'Thousand', 'Million', 'Billion'];
  let result = '';
  let n = pesos;
  let g = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) {
      result = chunkToWords(chunk) + (groups[g] ? ' ' + groups[g] : '') + (result ? ' ' + result : '');
    }
    n = Math.floor(n / 1000);
    g++;
  }
  return `${sign}${result} Pesos and ${cents.toString().padStart(2, '0')}/100 Only`;
}

export interface CvPdfData {
  cv_number: string;
  payment_date: string | null;
  payee_name: string;
  payment_method: string;
  bank_name: string;
  bank_account_number: string;
  check_number: string | null;
  check_date: string | null;
  reference_number: string | null;
  total_amount: number;
  remarks: string;
  apvs: { apv_number: string; invoice_number: string; net_payable: number }[];
}

export async function generateCvPdf(data: CvPdfData): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const m = 36;
  let y = height - m;

  page.drawText('CHECK VOUCHER', { x: m, y, size: 18, font: bold, color: rgb(0.1, 0.2, 0.4) });
  page.drawText(clean(data.cv_number), { x: width - m - 130, y, size: 13, font: bold });
  y -= 8;
  page.drawLine({ start: { x: m, y }, end: { x: width - m, y }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  y -= 22;

  const drawField = (x: number, yy: number, label: string, value: string) => {
    page.drawText(label, { x, y: yy, size: 8, font: bold, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(clean(value) || '-', { x, y: yy - 11, size: 10, font });
  };
  const colW = (width - m * 2 - 16) / 2;
  drawField(m, y, 'PAY TO THE ORDER OF', data.payee_name);
  drawField(m + colW + 16, y, 'PAYMENT DATE', data.payment_date || '-');
  y -= 24;
  drawField(m, y, 'PAYMENT METHOD', data.payment_method.replace('_', ' ').toUpperCase());
  drawField(m + colW + 16, y, 'BANK', data.bank_name);
  y -= 24;
  if (data.payment_method === 'check') {
    drawField(m, y, 'CHECK NUMBER', data.check_number || '-');
    drawField(m + colW + 16, y, 'CHECK DATE', data.check_date || '-');
  } else {
    drawField(m, y, 'REFERENCE NO.', data.reference_number || '-');
    drawField(m + colW + 16, y, 'ACCOUNT NO.', data.bank_account_number);
  }
  y -= 32;

  page.drawRectangle({ x: m, y: y - 4, width: width - m * 2, height: 28, color: rgb(0.93, 0.95, 0.98) });
  page.drawText('AMOUNT IN FIGURES', { x: m + 4, y: y + 12, size: 8, font: bold, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(`PHP ${fmt(data.total_amount)}`, { x: m + 4, y: y - 1, size: 14, font: bold });
  y -= 36;

  page.drawText('AMOUNT IN WORDS', { x: m, y, size: 8, font: bold, color: rgb(0.4, 0.4, 0.4) });
  y -= 12;
  const words = amountToWordsPHP(data.total_amount);
  const lines: string[] = [];
  let line = '';
  for (const w of words.split(' ')) {
    if ((line + ' ' + w).trim().length > 70) {
      lines.push(line.trim());
      line = w;
    } else {
      line += ' ' + w;
    }
  }
  if (line.trim()) lines.push(line.trim());
  for (const ln of lines) {
    page.drawText(ln, { x: m, y, size: 10, font: bold });
    y -= 13;
  }
  y -= 10;

  page.drawText('APPLIED TO AP VOUCHER(S)', { x: m, y, size: 9, font: bold, color: rgb(0.2, 0.2, 0.4) });
  y -= 14;
  page.drawText('APV Number', { x: m, y, size: 8, font: bold });
  page.drawText('Invoice', { x: m + 200, y, size: 8, font: bold });
  page.drawText('Amount', { x: width - m - 80, y, size: 8, font: bold });
  y -= 12;
  page.drawLine({ start: { x: m, y: y + 4 }, end: { x: width - m, y: y + 4 }, thickness: 0.4, color: rgb(0.7, 0.7, 0.7) });
  for (const a of data.apvs) {
    if (y < 140) break;
    page.drawText(clean(a.apv_number), { x: m, y, size: 9, font });
    page.drawText(clean(a.invoice_number).slice(0, 22), { x: m + 200, y, size: 9, font });
    page.drawText(fmt(a.net_payable), { x: width - m - 80, y, size: 9, font });
    y -= 12;
  }

  if (data.remarks) {
    y -= 6;
    page.drawText('Remarks:', { x: m, y, size: 9, font: bold });
    y -= 12;
    page.drawText(clean(data.remarks).slice(0, 180), { x: m, y, size: 8, font });
  }

  const sigY = 90;
  const sigW = (width - m * 2 - 30) / 3;
  ['Prepared By', 'Approved By', 'Received By'].forEach((label, i) => {
    const x = m + i * (sigW + 15);
    page.drawLine({ start: { x, y: sigY }, end: { x: x + sigW, y: sigY }, thickness: 0.6 });
    page.drawText(label, { x, y: sigY - 12, size: 9, font: bold });
    page.drawText('Signature over Date', { x, y: sigY - 22, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
  });
  page.drawText('Payment to CASH is strictly prohibited. Payee must be the registered vendor name.', {
    x: m, y: 36, size: 7, font, color: rgb(0.5, 0.5, 0.5),
  });

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
