import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

interface GenerateOptions {
  endpoint: string;
  getEndpoint: string;
  sampleToken: string;
}

const MARGIN = 50;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLOR_PRIMARY = rgb(0.11, 0.31, 0.71);
const COLOR_TEXT = rgb(0.15, 0.18, 0.23);
const COLOR_MUTED = rgb(0.42, 0.47, 0.55);
const COLOR_RULE = rgb(0.85, 0.88, 0.92);
const COLOR_CODE_BG = rgb(0.96, 0.97, 0.99);
const COLOR_CODE_BORDER = rgb(0.82, 0.86, 0.92);
const COLOR_BLUE_SOFT = rgb(0.9, 0.95, 1);
const COLOR_GREEN_SOFT = rgb(0.88, 0.97, 0.9);

function sanitize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '')
    .replace(/\r\n/g, '\n');
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    if (para.trim() === '') {
      lines.push('');
      continue;
    }
    const words = para.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word;
      const width = font.widthOfTextAtSize(candidate, size);
      if (width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

class PdfBuilder {
  doc!: PDFDocument;
  page!: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;
  mono!: PDFFont;
  monoBold!: PDFFont;
  y: number = PAGE_HEIGHT - MARGIN;
  pageNumber = 1;

  async init() {
    this.doc = await PDFDocument.create();
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.mono = await this.doc.embedFont(StandardFonts.Courier);
    this.monoBold = await this.doc.embedFont(StandardFonts.CourierBold);
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
    this.drawHeader();
    this.drawFooter();
  }

  drawHeader() {
    this.page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 30,
      width: PAGE_WIDTH,
      height: 30,
      color: COLOR_PRIMARY,
    });
    this.page.drawText('MSBC to P2P - API Documentation', {
      x: MARGIN,
      y: PAGE_HEIGHT - 20,
      size: 10,
      font: this.bold,
      color: rgb(1, 1, 1),
    });
  }

  drawFooter() {
    const label = `Page ${this.pageNumber}`;
    this.page.drawLine({
      start: { x: MARGIN, y: 40 },
      end: { x: PAGE_WIDTH - MARGIN, y: 40 },
      thickness: 0.5,
      color: COLOR_RULE,
    });
    this.page.drawText('Procure-to-Pay | MSBC Integration', {
      x: MARGIN,
      y: 25,
      size: 8,
      font: this.font,
      color: COLOR_MUTED,
    });
    const labelWidth = this.font.widthOfTextAtSize(label, 8);
    this.page.drawText(label, {
      x: PAGE_WIDTH - MARGIN - labelWidth,
      y: 25,
      size: 8,
      font: this.font,
      color: COLOR_MUTED,
    });
    this.pageNumber += 1;
  }

  ensureSpace(needed: number) {
    if (this.y - needed < 55) {
      this.newPage();
    }
  }

  moveDown(n: number) {
    this.y -= n;
  }

  drawTitle(text: string) {
    this.ensureSpace(60);
    this.page.drawText(sanitize(text), {
      x: MARGIN,
      y: this.y - 22,
      size: 22,
      font: this.bold,
      color: COLOR_PRIMARY,
    });
    this.y -= 30;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 1.5,
      color: COLOR_PRIMARY,
    });
    this.y -= 20;
  }

  drawH1(text: string) {
    this.ensureSpace(40);
    this.moveDown(8);
    this.page.drawText(sanitize(text), {
      x: MARGIN,
      y: this.y - 16,
      size: 16,
      font: this.bold,
      color: COLOR_PRIMARY,
    });
    this.y -= 22;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.5,
      color: COLOR_RULE,
    });
    this.y -= 12;
  }

  drawH2(text: string) {
    this.ensureSpace(30);
    this.moveDown(4);
    this.page.drawText(sanitize(text), {
      x: MARGIN,
      y: this.y - 13,
      size: 13,
      font: this.bold,
      color: COLOR_TEXT,
    });
    this.y -= 20;
  }

  drawParagraph(text: string, opts: { size?: number; color?: ReturnType<typeof rgb>; bold?: boolean } = {}) {
    const size = opts.size ?? 10;
    const color = opts.color ?? COLOR_TEXT;
    const font = opts.bold ? this.bold : this.font;
    const lines = wrapText(sanitize(text), font, size, CONTENT_WIDTH);
    const lineHeight = size * 1.45;
    for (const line of lines) {
      this.ensureSpace(lineHeight + 4);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y - size,
        size,
        font,
        color,
      });
      this.y -= lineHeight;
    }
    this.y -= 4;
  }

  drawBullet(text: string) {
    const size = 10;
    const lineHeight = size * 1.45;
    const bulletIndent = 14;
    const lines = wrapText(sanitize(text), this.font, size, CONTENT_WIDTH - bulletIndent);
    this.ensureSpace(lineHeight + 2);
    this.page.drawText('-', {
      x: MARGIN + 2,
      y: this.y - size,
      size,
      font: this.bold,
      color: COLOR_PRIMARY,
    });
    for (let i = 0; i < lines.length; i++) {
      this.ensureSpace(lineHeight);
      this.page.drawText(lines[i], {
        x: MARGIN + bulletIndent,
        y: this.y - size,
        size,
        font: this.font,
        color: COLOR_TEXT,
      });
      this.y -= lineHeight;
    }
    this.y -= 2;
  }

  drawKeyValueTable(rows: { key: string; value: string }[]) {
    const keyWidth = 170;
    const valueWidth = CONTENT_WIDTH - keyWidth;
    const padding = 8;
    const size = 9;
    for (const row of rows) {
      const keyLines = wrapText(sanitize(row.key), this.bold, size, keyWidth - padding * 2);
      const valueLines = wrapText(sanitize(row.value), this.mono, size, valueWidth - padding * 2);
      const lineHeight = size * 1.4;
      const rowHeight = Math.max(keyLines.length, valueLines.length) * lineHeight + padding * 2;
      this.ensureSpace(rowHeight + 2);

      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - rowHeight,
        width: keyWidth,
        height: rowHeight,
        color: COLOR_CODE_BG,
        borderColor: COLOR_CODE_BORDER,
        borderWidth: 0.5,
      });
      this.page.drawRectangle({
        x: MARGIN + keyWidth,
        y: this.y - rowHeight,
        width: valueWidth,
        height: rowHeight,
        borderColor: COLOR_CODE_BORDER,
        borderWidth: 0.5,
      });

      let ky = this.y - padding - size;
      for (const line of keyLines) {
        this.page.drawText(line, {
          x: MARGIN + padding,
          y: ky,
          size,
          font: this.bold,
          color: COLOR_TEXT,
        });
        ky -= lineHeight;
      }

      let vy = this.y - padding - size;
      for (const line of valueLines) {
        this.page.drawText(line, {
          x: MARGIN + keyWidth + padding,
          y: vy,
          size,
          font: this.mono,
          color: COLOR_PRIMARY,
        });
        vy -= lineHeight;
      }

      this.y -= rowHeight;
    }
    this.y -= 6;
  }

  drawCodeBlock(title: string, code: string) {
    const size = 8.5;
    const lineHeight = size * 1.45;
    const padding = 10;
    const lines = wrapText(sanitize(code), this.mono, size, CONTENT_WIDTH - padding * 2);
    const blockHeight = lines.length * lineHeight + padding * 2;

    this.ensureSpace(blockHeight + 22);

    this.page.drawText(sanitize(title), {
      x: MARGIN,
      y: this.y - 10,
      size: 10,
      font: this.bold,
      color: COLOR_TEXT,
    });
    this.y -= 16;

    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - blockHeight,
      width: CONTENT_WIDTH,
      height: blockHeight,
      color: COLOR_CODE_BG,
      borderColor: COLOR_CODE_BORDER,
      borderWidth: 0.5,
    });

    let ty = this.y - padding - size;
    for (const line of lines) {
      this.page.drawText(line, {
        x: MARGIN + padding,
        y: ty,
        size,
        font: this.mono,
        color: COLOR_PRIMARY,
      });
      ty -= lineHeight;
    }

    this.y -= blockHeight + 8;
  }

  drawCallout(text: string, variant: 'info' | 'success' = 'info') {
    const size = 9.5;
    const padding = 10;
    const lines = wrapText(sanitize(text), this.font, size, CONTENT_WIDTH - padding * 2);
    const lineHeight = size * 1.45;
    const height = lines.length * lineHeight + padding * 2;
    this.ensureSpace(height + 6);

    const bg = variant === 'success' ? COLOR_GREEN_SOFT : COLOR_BLUE_SOFT;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - height,
      width: CONTENT_WIDTH,
      height,
      color: bg,
      borderColor: COLOR_RULE,
      borderWidth: 0.5,
    });

    let ty = this.y - padding - size;
    for (const line of lines) {
      this.page.drawText(line, {
        x: MARGIN + padding,
        y: ty,
        size,
        font: this.font,
        color: COLOR_TEXT,
      });
      ty -= lineHeight;
    }
    this.y -= height + 8;
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save();
  }
}

export async function generateMsbcApiDocPdf(opts: GenerateOptions): Promise<Uint8Array> {
  const { endpoint, getEndpoint, sampleToken } = opts;
  const pdf = new PdfBuilder();
  await pdf.init();

  const basicUser = 'msbc';
  const basicEncoded = (() => {
    try {
      return typeof btoa === 'function'
        ? btoa(`${basicUser}:${sampleToken}`)
        : `<base64(${basicUser}:${sampleToken})>`;
    } catch {
      return `<base64(${basicUser}:${sampleToken})>`;
    }
  })();
  const basicHeaderValue = `Basic ${basicEncoded}`;

  pdf.drawTitle('MSBC to P2P API Documentation');
  pdf.drawParagraph(
    'This document describes how Microsoft Business Central (MSBC) integrates with the Procure-to-Pay (P2P) system. ' +
      'It covers authentication, the POST endpoint for pushing payment postings into P2P, and the GET endpoint for ' +
      'pulling approved P2P records back into MSBC.',
    { color: COLOR_MUTED },
  );
  pdf.drawParagraph(`Generated: ${new Date().toLocaleString()}`, { size: 9, color: COLOR_MUTED });

  pdf.drawH1('1. Overview');
  pdf.drawParagraph(
    'The integration exposes two HTTP endpoints, both authenticated via HTTP Basic Auth using a shared API key as ' +
      'the password. MSBC acts as the client and calls these endpoints directly.',
  );
  pdf.drawBullet('POST /msbc-post - Insert MSBC document postings into the P2P msbc_postings table.');
  pdf.drawBullet(
    'GET /msbc-get - Retrieve P2P records (Purchase Requisitions, Canvasses, Cash Advances, Petty Cash, ' +
      'Reimbursements, and MSBC postings) with filters and pagination.',
  );

  pdf.drawH1('2. Authentication');
  pdf.drawParagraph(
    'Every request must include an HTTP Basic Auth Authorization header. The username is "msbc" and the password ' +
      'is the API key generated inside the P2P app under API Integrations > MSBC to P2P > Developer API Connection. ' +
      'No Supabase JWT is required.',
  );
  pdf.drawKeyValueTable([
    { key: 'Auth Scheme', value: 'HTTP Basic Auth (RFC 7617)' },
    { key: 'Username', value: 'msbc' },
    { key: 'Password', value: '<your-generated-api-key>' },
    { key: 'Header Name', value: 'Authorization' },
    { key: 'Header Value', value: 'Basic <base64(msbc:API_KEY)>' },
    { key: 'Content-Type', value: 'application/json' },
  ]);
  pdf.drawCodeBlock(
    'Example Authorization Header',
    `Authorization: ${basicHeaderValue}`,
  );
  pdf.drawCallout(
    'Keep API keys secret. Disable or delete a key immediately if it is leaked. Multiple keys can be active at ' +
      'the same time, which is useful for rotation.',
  );

  pdf.drawH1('3. POST - MSBC to P2P');
  pdf.drawParagraph(
    'Use this endpoint to push a new posting record from Microsoft Business Central into P2P.',
  );
  pdf.drawH2('Endpoint');
  pdf.drawKeyValueTable([
    { key: 'Method', value: 'POST' },
    { key: 'URL', value: endpoint || '<not configured>' },
    { key: 'Authorization', value: 'Basic <base64(msbc:API_KEY)>' },
    { key: 'Content-Type', value: 'application/json' },
  ]);

  pdf.drawH2('Request Body Fields');
  pdf.drawKeyValueTable([
    { key: 'msbc_document_no *', value: 'MSBC document number (required).' },
    { key: 'external_document_no', value: 'External reference, e.g. supplier invoice no.' },
    { key: 'payment_type *', value: 'Check | Cash | Wire Transfer | Bank Transfer | Credit Card | Other.' },
    { key: 'date_posted *', value: 'ISO 8601 timestamp of the posting.' },
    { key: 'notes', value: 'Optional free-text notes.' },
  ]);

  pdf.drawCodeBlock(
    'Request Body (JSON)',
    `{
  "msbc_document_no": "PO-000123",
  "external_document_no": "INV-98765",
  "payment_type": "Check",
  "date_posted": "2026-05-04T08:00:00Z",
  "notes": "Optional notes"
}`,
  );

  pdf.drawCodeBlock(
    'cURL Example',
    `curl -X POST "${endpoint}" \\
  -u "${basicUser}:${sampleToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "msbc_document_no": "PO-000123",
    "external_document_no": "INV-98765",
    "payment_type": "Check",
    "date_posted": "${new Date().toISOString()}"
  }'`,
  );

  pdf.drawCodeBlock(
    'PowerShell Example (AL / BC HttpClient equivalent)',
    `$pair = "${basicUser}:${sampleToken}"
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$headers = @{
  "Authorization" = "Basic $encoded"
  "Content-Type"  = "application/json"
}
$body = @{
  msbc_document_no     = "PO-000123"
  external_document_no = "INV-98765"
  payment_type         = "Check"
  date_posted          = (Get-Date).ToString("o")
} | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri "${endpoint}" -Headers $headers -Body $body`,
  );

  pdf.drawH2('Response');
  pdf.drawParagraph(
    'On success the endpoint returns HTTP 200 with the inserted posting record. On validation errors the endpoint ' +
      'returns HTTP 400 with an error message. Authentication failures return HTTP 401.',
  );

  pdf.drawH1('4. GET - P2P to MSBC');
  pdf.drawParagraph(
    'Use this endpoint to pull P2P records into MSBC. Pass resource=all (default) to fetch every resource in one ' +
      'call, or pass a specific resource name like resource=petty_cash_requests.',
  );
  pdf.drawH2('Endpoint');
  pdf.drawKeyValueTable([
    { key: 'Method', value: 'GET' },
    { key: 'URL', value: getEndpoint || '<not configured>' },
    { key: 'Authorization', value: 'Basic <base64(msbc:API_KEY)>' },
  ]);

  pdf.drawH2('Query Parameters');
  pdf.drawKeyValueTable([
    {
      key: 'resource',
      value:
        'all (default) | purchase_requisitions | canvass_requests | cash_advance_requests | petty_cash_requests | reimbursement_requests | msbc_postings',
    },
    { key: 'status', value: 'e.g. approved, pending, rejected' },
    { key: 'company_id', value: 'UUID of the company' },
    { key: 'document_no', value: 'Exact match on document number' },
    { key: 'msbc_posting_status', value: 'e.g. not_posted, posted, failed' },
    { key: 'since / until', value: 'ISO timestamp filter on created_at' },
    { key: 'limit / offset', value: 'Pagination - limit max 500, default 50' },
  ]);

  pdf.drawCodeBlock(
    'cURL Example (GET)',
    `curl -X GET "${getEndpoint}?resource=petty_cash_requests&limit=50" \\
  -u "${basicUser}:${sampleToken}"`,
  );

  pdf.drawCodeBlock(
    'PowerShell Example (GET)',
    `$pair = "${basicUser}:${sampleToken}"
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$headers = @{ "Authorization" = "Basic $encoded" }
$uri = "${getEndpoint}?resource=petty_cash_requests&limit=50"
Invoke-RestMethod -Method GET -Uri $uri -Headers $headers`,
  );

  pdf.drawH2('Response Shape');
  pdf.drawCodeBlock(
    'Example - resource=petty_cash_requests',
    `{
  "resource": "petty_cash_requests",
  "total_count": 123,
  "limit": 50,
  "offset": 0,
  "data": [
    {
      "id": "uuid",
      "document_no": "PC-202605-0001",
      "status": "approved",
      "total_amount": 1500.00,
      "created_at": "2026-05-04T08:00:00Z"
    }
  ]
}`,
  );
  pdf.drawCodeBlock(
    'Example - resource=all',
    `{
  "resource": "all",
  "total_count": 2580,
  "limit": 50,
  "offset": 0,
  "resources": {
    "purchase_requisitions":   { "count": 2466, "data": [ ... ] },
    "canvass_requests":        { "count":   45, "data": [ ... ] },
    "cash_advance_requests":   { "count":   30, "data": [ ... ] },
    "petty_cash_requests":     { "count":   25, "data": [ ... ] },
    "reimbursement_requests":  { "count":   10, "data": [ ... ] },
    "msbc_postings":           { "count":    4, "data": [ ... ] }
  }
}`,
  );

  pdf.drawH1('5. Error Handling');
  pdf.drawKeyValueTable([
    { key: '200 OK', value: 'Request succeeded.' },
    { key: '400 Bad Request', value: 'Validation error - check the message field in the response body.' },
    { key: '401 Unauthorized', value: 'Missing or invalid Basic Auth credentials in the Authorization header.' },
    { key: '404 Not Found', value: 'Unknown resource name on the GET endpoint.' },
    { key: '500 Server Error', value: 'Unexpected server failure - retry with exponential backoff.' },
  ]);

  pdf.drawH1('6. Best Practices');
  pdf.drawBullet('Rotate API keys periodically; generate a new key, switch MSBC over, then disable the old one.');
  pdf.drawBullet('Use since/until to incrementally sync only records changed since your last poll.');
  pdf.drawBullet('Prefer a specific resource over resource=all when you only need one collection - it is faster and returns less data.');
  pdf.drawBullet('Always send date_posted in ISO 8601 (UTC) so P2P stores consistent timestamps.');
  pdf.drawBullet('Handle 401 errors by surfacing a clear message to the MSBC operator so the key can be re-issued.');

  pdf.drawCallout(
    'How it works: MSBC calls /msbc-post to push postings into the msbc_postings table, and /msbc-get to pull ' +
      'approved P2P records back. A single HTTP Basic Auth credential (username "msbc", password = API key) ' +
      'authenticates both endpoints.',
    'success',
  );

  return pdf.save();
}

export function downloadBytesAsPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
