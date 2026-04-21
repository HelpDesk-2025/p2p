import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import { supabase } from './supabase';
import { mergePDFBytes } from './pdfMerger';

export interface PettyCashBundleRequest {
  id: string;
  pc_number: string;
  request_date: string;
  cash_released_at?: string;
  cash_released?: boolean;
  received_at?: string;
  payee?: string;
  purpose: string;
  amount: number;
  request_type?: string;
  expense_type_items?: Array<{ expense_type_name: string; sub_item_name: string }>;
  approved_petty_cash_pdf_path?: string;
  rfp_pdf_path?: string;
  liquidation_pdf_path?: string;
  attachments?: Array<{ file_name: string; file_path: string; file_type: string }>;
}

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN_X = 32;
const MARGIN_TOP = 60;
const MARGIN_BOTTOM = 40;
const ROW_HEIGHT = 28;
const HEADER_ROW_HEIGHT = 30;

const COLUMNS = [
  { key: 'disbursement', label: 'Disbursement Date', width: 105, align: 'left' as const },
  { key: 'pc_number', label: 'Petty Cash Request No.', width: 150, align: 'left' as const },
  { key: 'recipient', label: 'To/Recipient', width: 140, align: 'left' as const },
  { key: 'purpose', label: 'Purpose', width: 230, align: 'left' as const },
  { key: 'amount', label: 'Amount', width: 100, align: 'right' as const },
  { key: 'status', label: 'Status', width: 53, align: 'center' as const },
];

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
};

const formatAmount = (amount: number) => {
  return `PHP ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const derivePurpose = (req: PettyCashBundleRequest) => {
  if (req.expense_type_items && req.expense_type_items.length > 0) {
    return req.expense_type_items
      .map((i) => `${i.expense_type_name}: ${i.sub_item_name}`)
      .join('; ');
  }
  return req.purpose || '—';
};

const statusLabel = (req: PettyCashBundleRequest) => {
  if (req.received_at) return 'Received';
  if (req.cash_released) return 'Released';
  return 'Pending';
};

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
  const words = String(text ?? '').split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(test, size);
    if (width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
};

const drawTableHeader = (page: PDFPage, font: PDFFont, y: number) => {
  let x = MARGIN_X;
  page.drawRectangle({
    x: MARGIN_X,
    y: y - HEADER_ROW_HEIGHT,
    width: COLUMNS.reduce((s, c) => s + c.width, 0),
    height: HEADER_ROW_HEIGHT,
    color: rgb(0.12, 0.25, 0.43),
  });
  for (const col of COLUMNS) {
    const textSize = 9;
    const textWidth = font.widthOfTextAtSize(col.label, textSize);
    let tx = x + 6;
    if (col.align === 'right') tx = x + col.width - textWidth - 6;
    if (col.align === 'center') tx = x + (col.width - textWidth) / 2;
    page.drawText(col.label, {
      x: tx,
      y: y - HEADER_ROW_HEIGHT + 10,
      size: textSize,
      font,
      color: rgb(1, 1, 1),
    });
    x += col.width;
  }
};

const drawRow = (
  page: PDFPage,
  font: PDFFont,
  y: number,
  values: string[][],
  rowHeight: number,
  zebra: boolean,
) => {
  const tableWidth = COLUMNS.reduce((s, c) => s + c.width, 0);
  if (zebra) {
    page.drawRectangle({
      x: MARGIN_X,
      y: y - rowHeight,
      width: tableWidth,
      height: rowHeight,
      color: rgb(0.96, 0.97, 0.99),
    });
  }

  page.drawRectangle({
    x: MARGIN_X,
    y: y - rowHeight,
    width: tableWidth,
    height: rowHeight,
    borderColor: rgb(0.82, 0.84, 0.88),
    borderWidth: 0.5,
  });

  let x = MARGIN_X;
  const textSize = 8.5;
  const lineHeight = 11;
  for (let i = 0; i < COLUMNS.length; i++) {
    const col = COLUMNS[i];
    const lines = values[i];
    const startY = y - 14;
    lines.forEach((line, idx) => {
      const textWidth = font.widthOfTextAtSize(line, textSize);
      let tx = x + 6;
      if (col.align === 'right') tx = x + col.width - textWidth - 6;
      if (col.align === 'center') tx = x + (col.width - textWidth) / 2;
      page.drawText(line, {
        x: tx,
        y: startY - idx * lineHeight,
        size: textSize,
        font,
        color: rgb(0.12, 0.16, 0.23),
      });
    });
    x += col.width;
  }
};

const drawHeaderBanner = (
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  totalRecords: number,
) => {
  page.drawText('Petty Cash Release - Generated Forms Report', {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 30,
    size: 14,
    font: fontBold,
    color: rgb(0.12, 0.25, 0.43),
  });
  const subtitle = `Generated: ${new Date().toLocaleString('en-US')}   |   Total Records: ${totalRecords}`;
  page.drawText(subtitle, {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 46,
    size: 9,
    font,
    color: rgb(0.33, 0.38, 0.46),
  });
};

const drawFooter = (page: PDFPage, font: PDFFont, pageNumber: number, totalPages: number) => {
  const label = `Page ${pageNumber} of ${totalPages}`;
  const w = font.widthOfTextAtSize(label, 8);
  page.drawText(label, {
    x: PAGE_WIDTH - MARGIN_X - w,
    y: 20,
    size: 8,
    font,
    color: rgb(0.45, 0.5, 0.58),
  });
};

const generateSummaryPdf = async (requests: PettyCashBundleRequest[]): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const rows = requests.map((req, index) => {
    const recipient = req.payee || '—';
    const purpose = derivePurpose(req);
    const cells = [
      wrapText(formatDate(req.cash_released_at), font, 8.5, COLUMNS[0].width - 12),
      wrapText(`#${index + 1}  ${req.pc_number}`, font, 8.5, COLUMNS[1].width - 12),
      wrapText(recipient, font, 8.5, COLUMNS[2].width - 12),
      wrapText(purpose, font, 8.5, COLUMNS[3].width - 12),
      wrapText(formatAmount(req.amount), font, 8.5, COLUMNS[4].width - 12),
      wrapText(statusLabel(req), font, 8.5, COLUMNS[5].width - 8),
    ];
    const maxLines = Math.max(...cells.map((c) => c.length));
    return { cells, rowHeight: Math.max(ROW_HEIGHT, maxLines * 12 + 10) };
  });

  const pages: PDFPage[] = [];
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  drawHeaderBanner(page, font, fontBold, requests.length);
  let cursorY = PAGE_HEIGHT - MARGIN_TOP;
  drawTableHeader(page, fontBold, cursorY);
  cursorY -= HEADER_ROW_HEIGHT;

  rows.forEach((row, idx) => {
    if (cursorY - row.rowHeight < MARGIN_BOTTOM) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      drawHeaderBanner(page, font, fontBold, requests.length);
      cursorY = PAGE_HEIGHT - MARGIN_TOP;
      drawTableHeader(page, fontBold, cursorY);
      cursorY -= HEADER_ROW_HEIGHT;
    }
    drawRow(page, font, cursorY, row.cells, row.rowHeight, idx % 2 === 1);
    cursorY -= row.rowHeight;
  });

  const totalAmount = requests.reduce((s, r) => s + (r.amount || 0), 0);
  if (cursorY - ROW_HEIGHT < MARGIN_BOTTOM) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    drawHeaderBanner(page, font, fontBold, requests.length);
    cursorY = PAGE_HEIGHT - MARGIN_TOP;
  }
  const tableWidth = COLUMNS.reduce((s, c) => s + c.width, 0);
  page.drawRectangle({
    x: MARGIN_X,
    y: cursorY - ROW_HEIGHT,
    width: tableWidth,
    height: ROW_HEIGHT,
    color: rgb(0.92, 0.94, 0.98),
    borderColor: rgb(0.72, 0.76, 0.82),
    borderWidth: 0.5,
  });
  page.drawText('TOTAL', {
    x: MARGIN_X + 8,
    y: cursorY - ROW_HEIGHT + 10,
    size: 10,
    font: fontBold,
    color: rgb(0.12, 0.25, 0.43),
  });
  const amountText = formatAmount(totalAmount);
  const amountX =
    MARGIN_X +
    COLUMNS.slice(0, 4).reduce((s, c) => s + c.width, 0) +
    COLUMNS[4].width -
    fontBold.widthOfTextAtSize(amountText, 10) -
    6;
  page.drawText(amountText, {
    x: amountX,
    y: cursorY - ROW_HEIGHT + 10,
    size: 10,
    font: fontBold,
    color: rgb(0.12, 0.25, 0.43),
  });

  const totalPages = pages.length;
  pages.forEach((p, i) => drawFooter(p, font, i + 1, totalPages));

  return await pdf.save();
};

const generateDividerPage = async (
  req: PettyCashBundleRequest,
  index: number,
  note?: string,
): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 80,
    width: PAGE_WIDTH,
    height: 80,
    color: rgb(0.12, 0.25, 0.43),
  });
  page.drawText(`#${index + 1}  ${req.pc_number}`, {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 45,
    size: 20,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText('Petty Cash Release - Supporting Documents', {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 68,
    size: 10,
    font,
    color: rgb(0.85, 0.9, 0.95),
  });

  const rows: Array<[string, string]> = [
    ['Recipient:', req.payee || '—'],
    ['Amount:', formatAmount(req.amount)],
    ['Disbursement Date:', formatDate(req.cash_released_at)],
    ['Request Date:', formatDate(req.request_date)],
    ['Status:', statusLabel(req)],
    ['Request Type:', req.request_type || 'For Cash Advance'],
    ['Purpose:', derivePurpose(req)],
  ];

  let y = PAGE_HEIGHT - 120;
  for (const [label, value] of rows) {
    page.drawText(label, {
      x: MARGIN_X,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.2, 0.24, 0.32),
    });
    const valueLines = wrapText(value, font, 10, PAGE_WIDTH - MARGIN_X * 2 - 140);
    valueLines.forEach((line, i) => {
      page.drawText(line, {
        x: MARGIN_X + 140,
        y: y - i * 14,
        size: 10,
        font,
        color: rgb(0.12, 0.16, 0.23),
      });
    });
    y -= Math.max(22, valueLines.length * 14 + 8);
  }

  if (note) {
    page.drawText(note, {
      x: MARGIN_X,
      y: MARGIN_BOTTOM + 10,
      size: 9,
      font,
      color: rgb(0.7, 0.3, 0.3),
    });
  }

  return await pdf.save();
};

const imageToPdfBytes = async (bytes: Uint8Array, mime: string): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  let image;
  if (mime === 'image/png') {
    image = await pdf.embedPng(bytes);
  } else if (mime === 'image/jpeg' || mime === 'image/jpg') {
    image = await pdf.embedJpg(bytes);
  } else {
    throw new Error('Unsupported image type');
  }
  const page = pdf.addPage();
  const { width, height } = page.getSize();
  const ratio = image.width / image.height;
  const pageRatio = width / height;
  let w: number;
  let h: number;
  if (ratio > pageRatio) {
    w = width - 40;
    h = w / ratio;
  } else {
    h = height - 40;
    w = h * ratio;
  }
  page.drawImage(image, {
    x: (width - w) / 2,
    y: (height - h) / 2,
    width: w,
    height: h,
  });
  return await pdf.save();
};

const inferMime = (fileName: string, fallback?: string) => {
  if (fallback) return fallback;
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
};

const downloadFileBytes = async (
  filePath: string,
): Promise<{ bytes: Uint8Array; mime: string } | null> => {
  try {
    const { data, error } = await supabase.storage.from('attachments').download(filePath);
    if (error || !data) return null;
    const buffer = await data.arrayBuffer();
    return {
      bytes: new Uint8Array(buffer),
      mime: data.type || inferMime(filePath),
    };
  } catch {
    return null;
  }
};

const toPdfBytes = async (
  bytes: Uint8Array,
  mime: string,
): Promise<Uint8Array | null> => {
  try {
    if (mime === 'application/pdf') return bytes;
    if (mime.startsWith('image/')) return await imageToPdfBytes(bytes, mime);
  } catch {
    return null;
  }
  return null;
};

export interface ExportResult {
  blob: Blob;
  failures: string[];
}

export async function generatePettyCashReleaseBundle(
  requests: PettyCashBundleRequest[],
): Promise<ExportResult> {
  const failures: string[] = [];
  const parts: Uint8Array[] = [];

  const summary = await generateSummaryPdf(requests);
  parts.push(summary);

  for (let index = 0; index < requests.length; index++) {
    const req = requests[index];

    const sources: Array<{ label: string; path?: string; mime?: string }> = [];
    if (req.approved_petty_cash_pdf_path)
      sources.push({ label: `Petty Cash Form (${req.pc_number})`, path: req.approved_petty_cash_pdf_path, mime: 'application/pdf' });
    if (req.rfp_pdf_path)
      sources.push({ label: `RFP (${req.pc_number})`, path: req.rfp_pdf_path, mime: 'application/pdf' });
    if (req.liquidation_pdf_path)
      sources.push({ label: `Liquidation Report (${req.pc_number})`, path: req.liquidation_pdf_path, mime: 'application/pdf' });
    if (req.attachments) {
      for (const att of req.attachments) {
        sources.push({ label: `${att.file_name} (${req.pc_number})`, path: att.file_path, mime: att.file_type });
      }
    }

    const documentParts: Uint8Array[] = [];
    for (const source of sources) {
      if (!source.path) continue;
      const downloaded = await downloadFileBytes(source.path);
      if (!downloaded) {
        failures.push(source.label);
        continue;
      }
      const mime = source.mime || downloaded.mime;
      const converted = await toPdfBytes(downloaded.bytes, mime);
      if (!converted) {
        failures.push(source.label);
        continue;
      }
      documentParts.push(converted);
    }

    const divider = await generateDividerPage(
      req,
      index,
      documentParts.length === 0 ? 'No generated form or attachment available for this request.' : undefined,
    );
    parts.push(divider);
    parts.push(...documentParts);
  }

  const merged = await mergePDFBytes(parts);
  const blob = new Blob([merged], { type: 'application/pdf' });
  return { blob, failures };
}
