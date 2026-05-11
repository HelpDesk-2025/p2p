import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  CanvassOption,
  InvoiceStatus,
  P2PSettings,
  PoLineComputed,
  formatDate,
  formatMoney,
  loadApprovedCanvassOptions,
  loadPoLinesComputed,
  loadSettings,
  nextInvoiceRef,
  recomputeCanvassStatuses,
  statusBadgeClasses,
  writeAudit,
} from '../../lib/p2pDownstream';
import { FileText, Plus, Save, Send, X, Loader2, Eye, Search, AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';

interface InvoiceHeader {
  id: string;
  invoice_number: string;
  invoice_date: string;
  received_date: string;
  canvass_request_id: string;
  supplier_id?: string;
  supplier_name?: string;
  subtotal: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  created_at: string;
  canvass_requests?: { canvass_number: string; winning_vendor_number?: string };
}

interface DraftLine {
  po_line_id: string;
  qty_billed: number;
  unit_price: number;
}

export function Invoicing() {
  const { profile } = useAuth();
  const [list, setList] = useState<InvoiceHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterText, setFilterText] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('supplier_invoices')
      .select('*, canvass_requests(canvass_number, winning_vendor_number)')
      .order('created_at', { ascending: false });
    setList((data || []) as InvoiceHeader[]);
    setLoading(false);
  };

  const filtered = useMemo(() => list.filter((i) => {
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterText) {
      const t = filterText.toLowerCase();
      const hay = [i.invoice_number, i.supplier_name || '', i.canvass_requests?.canvass_number || ''].join(' ').toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  }), [list, filterStatus, filterText]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="text-blue-600" /> Invoicing
          </h2>
          <p className="text-slate-600 mt-1 text-sm">Receive supplier invoices and run 3-way match.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={!profile}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold shadow-sm"
        >
          <Plus size={18} /> New Invoice
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search invoice no, supplier, PO..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
          <option value="">All Statuses</option>
          {['Draft', 'Submitted', 'For_Matching', 'Matched', 'On_Hold', 'Cancelled'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500"><Loader2 className="animate-spin inline" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No invoices yet</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Invoice No.', 'PO / Canvass', 'Supplier', 'Invoice Date', 'Total', 'Status', 'Action'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-sm">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm">{inv.canvass_requests?.canvass_number || '\u2014'}</td>
                    <td className="px-4 py-3 text-sm">{inv.supplier_name || '\u2014'}</td>
                    <td className="px-4 py-3 text-sm">{formatDate(inv.invoice_date)}</td>
                    <td className="px-4 py-3 text-sm font-bold">{formatMoney(inv.total)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${statusBadgeClasses(inv.status)}`}>
                        {inv.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setDetailId(inv.id)} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <InvoiceForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {detailId && <InvoiceDetail invoiceId={detailId} onClose={() => { setDetailId(null); load(); }} />}
    </div>
  );
}

function InvoiceForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [options, setOptions] = useState<CanvassOption[]>([]);
  const [selectedCr, setSelectedCr] = useState('');
  const [poLines, setPoLines] = useState<PoLineComputed[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [receivedDate, setReceivedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [tax, setTax] = useState(0);
  const [lines, setLines] = useState<Record<string, DraftLine>>({});
  const [settings, setSettings] = useState<P2PSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [autoNumber, setAutoNumber] = useState(true);

  useEffect(() => {
    (async () => {
      setOptions(await loadApprovedCanvassOptions());
      setSettings(await loadSettings());
    })();
  }, []);

  useEffect(() => {
    if (!selectedCr) { setPoLines([]); return; }
    (async () => {
      const ls = await loadPoLinesComputed(selectedCr);
      setPoLines(ls);
      const draft: Record<string, DraftLine> = {};
      ls.forEach((l) => {
        draft[l.id] = { po_line_id: l.id, qty_billed: 0, unit_price: l.unit_price };
      });
      setLines(draft);
    })();
  }, [selectedCr]);

  const subtotal = useMemo(() =>
    poLines.reduce((s, l) => s + Number(lines[l.id]?.qty_billed || 0) * Number(lines[l.id]?.unit_price || 0), 0),
  [poLines, lines]);
  const total = subtotal + Number(tax || 0);

  const runMatch = async (): Promise<{ status: InvoiceStatus; variance_type: string; details: any }> => {
    const details: any = { lines: [] };
    let varianceType: string = 'None';

    if (settings?.require_grn_before_invoice) {
      const { data: grnAny } = await supabase
        .from('goods_receipts')
        .select('id')
        .eq('canvass_request_id', selectedCr)
        .in('status', ['Submitted', 'Partial', 'Complete'])
        .limit(1);
      if (!grnAny || grnAny.length === 0) {
        return { status: 'On_Hold', variance_type: 'Missing_GRN', details: { message: 'No submitted GRN exists for this PO.' } };
      }
    }

    const tolPct = Number(settings?.price_tolerance_percent || 0);
    const tolAmt = Number(settings?.price_tolerance_amount || 0);

    for (const l of poLines) {
      const d = lines[l.id];
      const qty = Number(d?.qty_billed || 0);
      if (qty <= 0) continue;
      const up = Number(d?.unit_price || 0);
      const lineEntry: any = { line_no: l.line_no, item: l.item_description };

      if (settings?.quantity_rule_strict && qty > l.remaining_billable) {
        varianceType = 'Quantity';
        lineEntry.qty_issue = `Billed ${qty} exceeds remaining billable ${l.remaining_billable}`;
      }

      const priceDiff = Math.abs(up - l.unit_price);
      const pctDiff = l.unit_price > 0 ? (priceDiff / l.unit_price) * 100 : 0;
      if (priceDiff > tolAmt && pctDiff > tolPct) {
        varianceType = varianceType === 'None' ? 'Price' : varianceType;
        lineEntry.price_issue = `Invoice unit price ${up} differs from PO ${l.unit_price}`;
      }

      if (lineEntry.qty_issue || lineEntry.price_issue) details.lines.push(lineEntry);
    }

    if (details.lines.length > 0) {
      return { status: 'On_Hold', variance_type: varianceType, details };
    }
    return { status: 'Matched', variance_type: 'None', details: {} };
  };

  const submit = async () => {
    setError('');
    if (!selectedCr) return setError('Select a PO / Canvass.');
    if (!invoiceNumber.trim()) return setError('Invoice number is required.');
    if (!poLines.some((l) => Number(lines[l.id]?.qty_billed || 0) > 0)) return setError('Enter at least one billed quantity.');

    setSaving(true);
    try {
      const chosen = options.find((o) => o.id === selectedCr);
      const supplierId = chosen?.winning_vendor_number || null;

      if (settings?.prevent_duplicate_invoice && supplierId) {
        const { data: dup } = await supabase
          .from('supplier_invoices')
          .select('id')
          .eq('supplier_id', supplierId)
          .eq('invoice_number', invoiceNumber.trim())
          .maybeSingle();
        if (dup) { setError('Duplicate: this supplier already has this invoice number.'); setSaving(false); return; }
      }

      const match = await runMatch();

      const { data: inv, error: invErr } = await supabase
        .from('supplier_invoices')
        .insert({
          supplier_id: supplierId,
          supplier_name: supplierId,
          canvass_request_id: selectedCr,
          invoice_number: invoiceNumber.trim(),
          invoice_date: invoiceDate,
          received_date: receivedDate,
          subtotal,
          tax,
          total,
          status: match.status,
          created_by: profile?.id ?? null,
        })
        .select()
        .maybeSingle();
      if (invErr) throw invErr;
      if (!inv) throw new Error('Failed to create invoice');

      const lineRows = poLines
        .map((l) => lines[l.id])
        .filter((d) => d && Number(d.qty_billed) > 0)
        .map((d) => ({ invoice_id: inv.id, po_line_id: d.po_line_id, qty_billed: d.qty_billed, unit_price: d.unit_price }));
      if (lineRows.length > 0) {
        const { error: lErr } = await supabase.from('supplier_invoice_lines').insert(lineRows);
        if (lErr) throw lErr;
      }

      await supabase.from('matching_cases').insert({
        invoice_id: inv.id,
        canvass_request_id: selectedCr,
        match_status: match.status === 'Matched' ? 'Matched' : 'On_Hold',
        variance_type: match.variance_type,
        variance_details: match.details,
      });

      await writeAudit('Invoice', inv.id, 'Submitted', '', match.status, `3-way match: ${match.status}`);
      await recomputeCanvassStatuses(selectedCr);
      onSaved();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to submit invoice');
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    setError('');
    if (!selectedCr) return setError('Select a PO / Canvass.');
    let num = invoiceNumber.trim();
    if (!num) {
      if (autoNumber) num = await nextInvoiceRef();
      else return setError('Invoice number is required.');
    }
    setSaving(true);
    try {
      const chosen = options.find((o) => o.id === selectedCr);
      const { data: inv, error: invErr } = await supabase
        .from('supplier_invoices')
        .insert({
          supplier_id: chosen?.winning_vendor_number || null,
          supplier_name: chosen?.winning_vendor_number || null,
          canvass_request_id: selectedCr,
          invoice_number: num,
          invoice_date: invoiceDate,
          received_date: receivedDate,
          subtotal,
          tax,
          total,
          status: 'Draft',
          created_by: profile?.id ?? null,
        })
        .select()
        .maybeSingle();
      if (invErr) throw invErr;
      if (!inv) throw new Error('Failed');

      const lineRows = poLines
        .map((l) => lines[l.id])
        .filter((d) => d && Number(d.qty_billed) > 0)
        .map((d) => ({ invoice_id: inv.id, po_line_id: d.po_line_id, qty_billed: d.qty_billed, unit_price: d.unit_price }));
      if (lineRows.length > 0) await supabase.from('supplier_invoice_lines').insert(lineRows);

      await writeAudit('Invoice', inv.id, 'Created', '', 'Draft', 'Saved as draft');
      onSaved();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-xl font-bold text-slate-900">New Supplier Invoice</h3>
            <p className="text-sm text-slate-500">3-way match runs on submit</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-sm">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">PO / Canvass</label>
              <select value={selectedCr} onChange={(e) => setSelectedCr(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                <option value="">Select approved canvass...</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.canvass_number}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Invoice No. <span className="text-rose-500">*</span></label>
              <div className="flex gap-2">
                <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <label className="inline-flex items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={autoNumber} onChange={(e) => setAutoNumber(e.target.checked)} /> Auto
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Invoice Date</label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Received Date</label>
              <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Tax</label>
              <input type="number" step="0.01" value={tax} onChange={(e) => setTax(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          </div>

          {selectedCr && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    {['#', 'Item', 'Qty Ord', 'Received', 'Invoiced', 'Remaining Billable', 'PO Unit Price', 'Bill Qty', 'Unit Price', 'Line Total'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {poLines.map((l) => {
                    const d = lines[l.id];
                    const lineTotal = Number(d?.qty_billed || 0) * Number(d?.unit_price || 0);
                    return (
                      <tr key={l.id} className="border-t">
                        <td className="px-3 py-2">{l.line_no}</td>
                        <td className="px-3 py-2">{l.item_description}</td>
                        <td className="px-3 py-2">{l.qty_ordered}</td>
                        <td className="px-3 py-2">{l.total_received}</td>
                        <td className="px-3 py-2">{l.total_invoiced}</td>
                        <td className="px-3 py-2 font-semibold text-blue-700">{l.remaining_billable}</td>
                        <td className="px-3 py-2">{formatMoney(l.unit_price)}</td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.0001" min={0}
                            value={d?.qty_billed ?? 0}
                            onChange={(e) => setLines((p) => ({ ...p, [l.id]: { ...p[l.id], qty_billed: Number(e.target.value) } }))}
                            className="w-24 px-2 py-1 border border-slate-300 rounded text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.0001" min={0}
                            value={d?.unit_price ?? 0}
                            onChange={(e) => setLines((p) => ({ ...p, [l.id]: { ...p[l.id], unit_price: Number(e.target.value) } }))}
                            className="w-28 px-2 py-1 border border-slate-300 rounded text-sm" />
                        </td>
                        <td className="px-3 py-2 font-semibold">{formatMoney(lineTotal)}</td>
                      </tr>
                    );
                  })}
                  {poLines.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-500">No PO lines.</td></tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr className="border-t">
                    <td colSpan={9} className="px-3 py-2 text-right font-semibold">Subtotal</td>
                    <td className="px-3 py-2 font-bold">{formatMoney(subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={9} className="px-3 py-2 text-right font-semibold">Tax</td>
                    <td className="px-3 py-2 font-bold">{formatMoney(tax)}</td>
                  </tr>
                  <tr className="border-t-2 border-slate-300">
                    <td colSpan={9} className="px-3 py-2 text-right font-semibold">Total</td>
                    <td className="px-3 py-2 font-bold text-blue-700">{formatMoney(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={saveDraft} disabled={saving} className="px-4 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save Draft
          </button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} Submit & Match
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceDetail({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { profile } = useAuth();
  const [invoice, setInvoice] = useState<any | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [matchCase, setMatchCase] = useState<any | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const load = async () => {
    const { data: inv } = await supabase
      .from('supplier_invoices')
      .select('*, canvass_requests(canvass_number, winning_vendor_number)')
      .eq('id', invoiceId)
      .maybeSingle();
    setInvoice(inv);
    const { data: ls } = await supabase
      .from('supplier_invoice_lines')
      .select('*, canvass_request_po_lines(item_description, unit_price, qty_ordered, uom)')
      .eq('invoice_id', invoiceId);
    setLines(ls || []);
    const { data: mc } = await supabase
      .from('matching_cases')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setMatchCase(mc);
  };

  useEffect(() => { load(); }, [invoiceId]);

  const markResolved = async () => {
    if (!matchCase) return;
    setResolving(true);
    try {
      await supabase.from('matching_cases').update({
        match_status: 'Resolved',
        resolution_notes: resolutionNotes,
        resolved_by_user_id: profile?.id ?? null,
        resolved_at: new Date().toISOString(),
      }).eq('id', matchCase.id);
      await supabase.from('supplier_invoices').update({ status: 'Matched' }).eq('id', invoiceId);
      await writeAudit('Invoice', invoiceId, 'Resolved', 'On_Hold', 'Matched', resolutionNotes);
      await writeAudit('Matching', matchCase.id, 'Resolved', 'On_Hold', 'Resolved', resolutionNotes);
      if (invoice?.canvass_request_id) await recomputeCanvassStatuses(invoice.canvass_request_id);
      await load();
    } finally {
      setResolving(false);
    }
  };

  if (!invoice) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl p-12"><Loader2 className="animate-spin" /></div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Invoice {invoice.invoice_number}</h3>
            <p className="text-sm text-slate-500">{invoice.canvass_requests?.canvass_number} &middot; {invoice.supplier_name || 'Supplier'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-slate-500">Status:</span> <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${statusBadgeClasses(invoice.status)}`}>{invoice.status.replace('_', ' ')}</span></div>
            <div><span className="text-slate-500">Invoice Date:</span> {formatDate(invoice.invoice_date)}</div>
            <div><span className="text-slate-500">Received:</span> {formatDate(invoice.received_date)}</div>
            <div><span className="text-slate-500">Total:</span> <span className="font-bold">{formatMoney(invoice.total)}</span></div>
          </div>

          {matchCase && (
            <div className={`border rounded-lg p-4 ${matchCase.match_status === 'Matched' ? 'bg-emerald-50 border-emerald-200' : matchCase.match_status === 'Resolved' ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {matchCase.match_status === 'Matched' ? <CheckCircle2 className="text-emerald-600" size={18} /> : <AlertTriangle className="text-amber-600" size={18} />}
                <h4 className="font-bold text-slate-900">3-Way Match: {matchCase.match_status}</h4>
              </div>
              {matchCase.variance_type && matchCase.variance_type !== 'None' && (
                <p className="text-sm text-slate-700">Variance: <span className="font-semibold">{matchCase.variance_type}</span></p>
              )}
              {matchCase.variance_details?.lines?.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {matchCase.variance_details.lines.map((ln: any, i: number) => (
                    <li key={i}>
                      <span className="font-semibold">Line {ln.line_no}:</span> {ln.qty_issue || ''} {ln.price_issue || ''}
                    </li>
                  ))}
                </ul>
              )}
              {matchCase.variance_details?.message && (
                <p className="mt-2 text-sm text-slate-700">{matchCase.variance_details.message}</p>
              )}
              {matchCase.match_status === 'On_Hold' && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    rows={2}
                    placeholder="Resolution notes..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <button
                    onClick={markResolved}
                    disabled={resolving || !resolutionNotes.trim()}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold disabled:opacity-50"
                  >
                    {resolving ? <Loader2 className="animate-spin" size={14} /> : <Wrench size={14} />}
                    Mark Resolved
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-2">Invoice Lines</h4>
            <table className="w-full text-sm border border-slate-200 rounded">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-left">Qty Billed</th>
                  <th className="px-3 py-2 text-left">Unit Price</th>
                  <th className="px-3 py-2 text-left">PO Unit Price</th>
                  <th className="px-3 py-2 text-left">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2">{l.canvass_request_po_lines?.item_description}</td>
                    <td className="px-3 py-2">{l.qty_billed}</td>
                    <td className="px-3 py-2">{formatMoney(l.unit_price)}</td>
                    <td className="px-3 py-2">{formatMoney(l.canvass_request_po_lines?.unit_price)}</td>
                    <td className="px-3 py-2 font-semibold">{formatMoney(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
