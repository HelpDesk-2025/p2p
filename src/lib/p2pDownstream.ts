import { supabase } from './supabase';

export type GrnStatus = 'Draft' | 'Submitted' | 'Partial' | 'Complete' | 'Cancelled';
export type InvoiceStatus = 'Draft' | 'Submitted' | 'For_Matching' | 'Matched' | 'On_Hold' | 'Cancelled';
export type ApvStatus = 'Draft' | 'Posted' | 'For_Payment' | 'Paid' | 'On_Hold' | 'Cancelled';
export type PaymentStatus = 'Draft' | 'Submitted' | 'Paid' | 'Voided';

export interface P2PSettings {
  id: string;
  price_tolerance_percent: number;
  price_tolerance_amount: number;
  quantity_rule_strict: boolean;
  allow_over_receiving: boolean;
  over_receiving_threshold_percent: number;
  require_grn_before_invoice: boolean;
  prevent_duplicate_invoice: boolean;
  require_proof_on_payment: boolean;
}

export interface PoLine {
  id: string;
  canvass_request_id: string;
  line_no: number;
  item_description: string;
  specifications?: string;
  qty_ordered: number;
  uom?: string;
  unit_price: number;
  line_total: number;
}

export interface PoLineComputed extends PoLine {
  total_received: number;
  total_invoiced: number;
  remaining_to_receive: number;
  remaining_billable: number;
}

export interface CanvassOption {
  id: string;
  canvass_number: string;
  winning_vendor_number?: string | null;
  total_amount?: number;
  status?: string;
}

const GRN_COUNTED_STATUSES: GrnStatus[] = ['Submitted', 'Partial', 'Complete'];
const INVOICE_COUNTED_STATUSES: InvoiceStatus[] = ['Submitted', 'For_Matching', 'Matched'];

export async function loadSettings(): Promise<P2PSettings | null> {
  const { data, error } = await supabase
    .from('p2p_settings')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('loadSettings', error);
    return null;
  }
  return data as P2PSettings | null;
}

export async function upsertSettings(patch: Partial<P2PSettings>): Promise<P2PSettings | null> {
  const existing = await loadSettings();
  if (existing) {
    const { data, error } = await supabase
      .from('p2p_settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data as P2PSettings;
  }
  const { data, error } = await supabase
    .from('p2p_settings')
    .insert({ ...patch })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as P2PSettings;
}

export async function loadApprovedCanvassOptions(): Promise<CanvassOption[]> {
  const { data, error } = await supabase
    .from('canvass_requests')
    .select('id, canvass_number, winning_vendor_number, total_amount, status')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('loadApprovedCanvassOptions', error);
    return [];
  }
  return (data || []) as CanvassOption[];
}

export async function loadPoLines(canvassRequestId: string): Promise<PoLine[]> {
  const { data, error } = await supabase
    .from('canvass_request_po_lines')
    .select('*')
    .eq('canvass_request_id', canvassRequestId)
    .order('line_no', { ascending: true });
  if (error) {
    console.error('loadPoLines', error);
    return [];
  }
  return (data || []) as PoLine[];
}

export async function ensurePoLinesFromCanvass(canvassRequestId: string): Promise<PoLine[]> {
  const existing = await loadPoLines(canvassRequestId);
  if (existing.length > 0) return existing;

  const { data: canvass, error } = await supabase
    .from('canvass_requests')
    .select('id, items, suppliers, winning_vendor_number')
    .eq('id', canvassRequestId)
    .maybeSingle();

  if (error || !canvass) return [];

  const items: any[] = Array.isArray(canvass.items) ? canvass.items : [];
  const suppliers: any[] = Array.isArray(canvass.suppliers) ? canvass.suppliers : [];
  const winning = suppliers.find((s: any) =>
    canvass.winning_vendor_number && (s.vendor_number === canvass.winning_vendor_number || s.number === canvass.winning_vendor_number),
  ) || suppliers[0];

  const winningQuotes: any[] = winning?.quotes || winning?.items || [];

  if (items.length === 0) return [];

  const rows = items.map((it: any, idx: number) => {
    const q = winningQuotes[idx] || {};
    const unitPrice = Number(q.unit_price ?? q.price ?? it.unit_price ?? 0) || 0;
    const qty = Number(it.quantity ?? it.qty ?? 0) || 0;
    return {
      canvass_request_id: canvassRequestId,
      line_no: idx + 1,
      item_description: String(it.description ?? it.item_description ?? it.name ?? `Item ${idx + 1}`),
      specifications: String(it.specifications ?? it.specs ?? ''),
      qty_ordered: qty,
      uom: String(it.uom ?? it.unit ?? ''),
      unit_price: unitPrice,
    };
  });

  const { data: inserted, error: insertErr } = await supabase
    .from('canvass_request_po_lines')
    .insert(rows)
    .select();
  if (insertErr) {
    console.error('ensurePoLinesFromCanvass insert', insertErr);
    return [];
  }
  return (inserted || []) as PoLine[];
}

export async function computePoLineTotals(poLineIds: string[]): Promise<Map<string, { received: number; invoiced: number }>> {
  const result = new Map<string, { received: number; invoiced: number }>();
  poLineIds.forEach((id) => result.set(id, { received: 0, invoiced: 0 }));
  if (poLineIds.length === 0) return result;

  const { data: grnLines } = await supabase
    .from('goods_receipt_lines')
    .select('po_line_id, qty_received, goods_receipts(status)')
    .in('po_line_id', poLineIds);

  (grnLines || []).forEach((row: any) => {
    const status = row.goods_receipts?.status as GrnStatus | undefined;
    if (!status || !GRN_COUNTED_STATUSES.includes(status)) return;
    const curr = result.get(row.po_line_id) || { received: 0, invoiced: 0 };
    curr.received += Number(row.qty_received) || 0;
    result.set(row.po_line_id, curr);
  });

  const { data: invLines } = await supabase
    .from('supplier_invoice_lines')
    .select('po_line_id, qty_billed, supplier_invoices(status)')
    .in('po_line_id', poLineIds);

  (invLines || []).forEach((row: any) => {
    const status = row.supplier_invoices?.status as InvoiceStatus | undefined;
    if (!status || !INVOICE_COUNTED_STATUSES.includes(status)) return;
    const curr = result.get(row.po_line_id) || { received: 0, invoiced: 0 };
    curr.invoiced += Number(row.qty_billed) || 0;
    result.set(row.po_line_id, curr);
  });

  return result;
}

export async function loadPoLinesComputed(canvassRequestId: string): Promise<PoLineComputed[]> {
  const lines = await ensurePoLinesFromCanvass(canvassRequestId);
  const totals = await computePoLineTotals(lines.map((l) => l.id));
  return lines.map((l) => {
    const t = totals.get(l.id) || { received: 0, invoiced: 0 };
    return {
      ...l,
      total_received: t.received,
      total_invoiced: t.invoiced,
      remaining_to_receive: Math.max(0, (l.qty_ordered || 0) - t.received),
      remaining_billable: Math.max(0, t.received - t.invoiced),
    };
  });
}

function padNum(n: number, w: number): string {
  return String(n).padStart(w, '0');
}

async function nextNumberFor(prefix: string, table: string, column: string): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;
  const { data } = await supabase
    .from(table)
    .select(column)
    .ilike(column, pattern)
    .order(column, { ascending: false })
    .limit(1);

  let nextSeq = 1;
  if (data && data.length > 0) {
    const last = (data[0] as any)[column] as string;
    const parts = last.split('-');
    const tail = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(tail)) nextSeq = tail + 1;
  }
  return `${prefix}-${year}-${padNum(nextSeq, 5)}`;
}

export const nextGrnNumber = () => nextNumberFor('GRN', 'goods_receipts', 'grn_number');
export const nextInvoiceRef = () => nextNumberFor('INV', 'supplier_invoices', 'invoice_number');
export const nextApvNumber = () => nextNumberFor('APV', 'ap_vouchers', 'apv_number');
export const nextPaymentNumber = () => nextNumberFor('PAY', 'payments', 'payment_number');

export async function writeAudit(
  documentType: 'GRN' | 'Invoice' | 'APV' | 'Payment' | 'Matching',
  documentId: string,
  action: string,
  fromStatus: string = '',
  toStatus: string = '',
  comments: string = '',
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('p2p_audit_logs').insert({
      document_type: documentType,
      document_id: documentId,
      action,
      from_status: fromStatus,
      to_status: toStatus,
      acted_by_user_id: user?.id ?? null,
      comments,
    });
  } catch (err) {
    console.error('writeAudit', err);
  }
}

export async function upsertStatusExt(canvassRequestId: string, patch: Record<string, any>) {
  const payload = { canvass_request_id: canvassRequestId, ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from('canvass_request_status_ext')
    .upsert(payload, { onConflict: 'canvass_request_id' });
  if (error) console.error('upsertStatusExt', error);
}

export async function recomputeCanvassStatuses(canvassRequestId: string) {
  const lines = await loadPoLinesComputed(canvassRequestId);
  if (lines.length === 0) return;
  const totalOrdered = lines.reduce((s, l) => s + Number(l.qty_ordered || 0), 0);
  const totalReceived = lines.reduce((s, l) => s + l.total_received, 0);
  const totalInvoiced = lines.reduce((s, l) => s + l.total_invoiced, 0);

  let receivingStatus = 'Not_Received';
  if (totalReceived > 0 && totalReceived < totalOrdered) receivingStatus = 'Partial';
  else if (totalOrdered > 0 && totalReceived >= totalOrdered) receivingStatus = 'Complete';

  let invoiceStatus = 'Not_Invoiced';
  if (totalInvoiced > 0 && totalInvoiced < totalReceived) invoiceStatus = 'Partial';
  else if (totalReceived > 0 && totalInvoiced >= totalReceived) invoiceStatus = 'Fully_Invoiced';

  await upsertStatusExt(canvassRequestId, {
    receiving_status: receivingStatus,
    invoice_status: invoiceStatus,
  });
}

export function formatMoney(n: number | undefined | null): string {
  const v = Number(n) || 0;
  return `\u20B1${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '\u2014';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return String(iso);
  }
}

export function statusBadgeClasses(status: string): string {
  const s = status.toLowerCase();
  if (['draft'].includes(s)) return 'bg-slate-100 text-slate-700';
  if (['submitted', 'for_matching', 'for_payment', 'partial'].includes(s)) return 'bg-amber-100 text-amber-800';
  if (['matched', 'posted', 'paid', 'complete'].includes(s)) return 'bg-emerald-100 text-emerald-800';
  if (['on_hold', 'voided', 'cancelled'].includes(s)) return 'bg-rose-100 text-rose-800';
  return 'bg-blue-100 text-blue-800';
}
