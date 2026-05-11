import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  ApvStatus,
  formatDate,
  formatMoney,
  nextApvNumber,
  statusBadgeClasses,
  writeAudit,
} from '../../lib/p2pDownstream';
import { Calculator, Plus, Save, X, Loader2, Eye, Send, Search } from 'lucide-react';

interface ApvHeader {
  id: string;
  apv_number: string;
  invoice_id: string;
  supplier_name?: string;
  posting_date: string;
  due_date?: string;
  gross_amount: number;
  withholding_tax: number;
  net_payable: number;
  status: ApvStatus;
  posted_at?: string;
  supplier_invoices?: { invoice_number: string; canvass_request_id: string; canvass_requests?: { canvass_number: string } };
}

export function AccountingPosting() {
  const { profile } = useAuth();
  const [list, setList] = useState<ApvHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterText, setFilterText] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ap_vouchers')
      .select('*, supplier_invoices(invoice_number, canvass_request_id, canvass_requests(canvass_number))')
      .order('created_at', { ascending: false });
    setList((data || []) as ApvHeader[]);
    setLoading(false);
  };

  const filtered = useMemo(() => list.filter((v) => {
    if (filterStatus && v.status !== filterStatus) return false;
    if (filterText) {
      const t = filterText.toLowerCase();
      const hay = [v.apv_number, v.supplier_name || '', v.supplier_invoices?.invoice_number || ''].join(' ').toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  }), [list, filterStatus, filterText]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="text-blue-600" /> Accounting Posting (AP Voucher)
          </h2>
          <p className="text-slate-600 mt-1 text-sm">Post matched invoices into the general ledger queue.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={!profile}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold shadow-sm"
        >
          <Plus size={18} /> New AP Voucher
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search APV, invoice, supplier..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm outline-none"
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
          <option value="">All Statuses</option>
          {['Draft', 'Posted', 'For_Payment', 'Paid', 'On_Hold', 'Cancelled'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500"><Loader2 className="animate-spin inline" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No AP vouchers yet</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['APV No.', 'Invoice', 'PO / Canvass', 'Supplier', 'Posting Date', 'Due', 'Net Payable', 'Status', 'Action'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-700 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-sm">{v.apv_number}</td>
                    <td className="px-4 py-3 text-sm">{v.supplier_invoices?.invoice_number || '\u2014'}</td>
                    <td className="px-4 py-3 text-sm">{v.supplier_invoices?.canvass_requests?.canvass_number || '\u2014'}</td>
                    <td className="px-4 py-3 text-sm">{v.supplier_name || '\u2014'}</td>
                    <td className="px-4 py-3 text-sm">{formatDate(v.posting_date)}</td>
                    <td className="px-4 py-3 text-sm">{formatDate(v.due_date)}</td>
                    <td className="px-4 py-3 text-sm font-bold">{formatMoney(v.net_payable)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${statusBadgeClasses(v.status)}`}>
                        {v.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setDetailId(v.id)} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
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

      {showForm && <ApvForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {detailId && <ApvDetail id={detailId} onClose={() => { setDetailId(null); load(); }} />}
    </div>
  );
}

function ApvForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [invoice, setInvoice] = useState<any | null>(null);
  const [postingDate, setPostingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>('');
  const [wht, setWht] = useState(0);
  const [gl, setGl] = useState('{"debit":[],"credit":[]}');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: matched } = await supabase
        .from('supplier_invoices')
        .select('id, invoice_number, total, supplier_id, supplier_name, canvass_request_id, canvass_requests(canvass_number)')
        .eq('status', 'Matched');
      const { data: existingApv } = await supabase
        .from('ap_vouchers')
        .select('invoice_id');
      const takenIds = new Set((existingApv || []).map((a: any) => a.invoice_id));
      setInvoices((matched || []).filter((inv: any) => !takenIds.has(inv.id)));
    })();
  }, []);

  useEffect(() => {
    const inv = invoices.find((i) => i.id === invoiceId) || null;
    setInvoice(inv);
  }, [invoiceId, invoices]);

  const gross = Number(invoice?.total || 0);
  const net = Math.max(0, gross - Number(wht || 0));

  const save = async (post: boolean) => {
    setError('');
    if (!invoiceId) return setError('Select a matched invoice.');
    let glJson: any = {};
    if (gl.trim()) {
      try { glJson = JSON.parse(gl); }
      catch { return setError('GL accounting must be valid JSON.'); }
    }

    setSaving(true);
    try {
      const apvNumber = await nextApvNumber();
      const row: any = {
        apv_number: apvNumber,
        invoice_id: invoiceId,
        supplier_id: invoice?.supplier_id ?? null,
        supplier_name: invoice?.supplier_name ?? null,
        posting_date: postingDate,
        due_date: dueDate || null,
        gross_amount: gross,
        withholding_tax: wht,
        net_payable: net,
        gl_accounting: glJson,
        status: post ? 'Posted' : 'Draft',
        posted_by_user_id: post ? profile?.id ?? null : null,
        posted_at: post ? new Date().toISOString() : null,
        created_by: profile?.id ?? null,
      };
      const { data: created, error: err } = await supabase.from('ap_vouchers').insert(row).select().maybeSingle();
      if (err) throw err;
      if (!created) throw new Error('Failed to create APV');

      await writeAudit('APV', created.id, post ? 'Posted' : 'Created', '', row.status, post ? 'AP Voucher posted' : 'Draft');
      onSaved();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-xl font-bold text-slate-900">New AP Voucher</h3>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Matched Invoice <span className="text-rose-500">*</span></label>
            <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
              <option value="">Select invoice...</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>{i.invoice_number} &middot; {i.canvass_requests?.canvass_number} &middot; {formatMoney(i.total)}</option>
              ))}
            </select>
            {invoices.length === 0 && <p className="text-xs text-amber-700 mt-1">No matched invoices are available for posting.</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Posting Date</label>
              <input type="date" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Gross Amount</label>
              <input readOnly value={gross.toFixed(2)} className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Withholding Tax</label>
              <input type="number" step="0.01" value={wht} onChange={(e) => setWht(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Net Payable</label>
              <input readOnly value={net.toFixed(2)} className="w-full px-3 py-2 border border-slate-200 bg-emerald-50 text-emerald-800 font-bold rounded-lg text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">GL Accounting (JSON)</label>
            <textarea value={gl} onChange={(e) => setGl(e.target.value)} rows={5} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" />
            <p className="text-xs text-slate-500 mt-1">Example: {"{\"debit\":[{\"account\":\"Expense\",\"amount\":1000}],\"credit\":[{\"account\":\"AP\",\"amount\":1000}]}"}</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save Draft
          </button>
          <button onClick={() => save(true)} disabled={saving || !invoiceId} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} Post Voucher
          </button>
        </div>
      </div>
    </div>
  );
}

function ApvDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { profile } = useAuth();
  const [apv, setApv] = useState<any | null>(null);
  const [posting, setPosting] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('ap_vouchers')
      .select('*, supplier_invoices(invoice_number, canvass_request_id, canvass_requests(canvass_number))')
      .eq('id', id)
      .maybeSingle();
    setApv(data);
  };
  useEffect(() => { load(); }, [id]);

  const post = async () => {
    if (!apv) return;
    setPosting(true);
    try {
      await supabase.from('ap_vouchers').update({
        status: 'Posted',
        posted_by_user_id: profile?.id ?? null,
        posted_at: new Date().toISOString(),
      }).eq('id', apv.id);
      await writeAudit('APV', apv.id, 'Posted', 'Draft', 'Posted', '');
      await load();
    } finally { setPosting(false); }
  };

  if (!apv) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl p-12"><Loader2 className="animate-spin" /></div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-xl font-bold text-slate-900">{apv.apv_number}</h3>
            <p className="text-sm text-slate-500">Invoice {apv.supplier_invoices?.invoice_number}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-500">Status:</span> <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${statusBadgeClasses(apv.status)}`}>{apv.status.replace('_', ' ')}</span></div>
            <div><span className="text-slate-500">Posted At:</span> {apv.posted_at ? formatDate(apv.posted_at) : '\u2014'}</div>
            <div><span className="text-slate-500">Posting Date:</span> {formatDate(apv.posting_date)}</div>
            <div><span className="text-slate-500">Due Date:</span> {formatDate(apv.due_date)}</div>
            <div><span className="text-slate-500">Gross:</span> {formatMoney(apv.gross_amount)}</div>
            <div><span className="text-slate-500">Withholding:</span> {formatMoney(apv.withholding_tax)}</div>
            <div className="col-span-2"><span className="text-slate-500">Net Payable:</span> <span className="font-bold text-emerald-700 text-lg">{formatMoney(apv.net_payable)}</span></div>
          </div>
          <div>
            <div className="text-sm font-bold text-slate-700 mb-1">GL Accounting</div>
            <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-3 overflow-auto">{JSON.stringify(apv.gl_accounting || {}, null, 2)}</pre>
          </div>
        </div>
        {apv.status === 'Draft' && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button onClick={post} disabled={posting} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2">
              {posting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} Post Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
