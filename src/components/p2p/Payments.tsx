import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  PaymentStatus,
  formatDate,
  formatMoney,
  loadSettings,
  nextPaymentNumber,
  statusBadgeClasses,
  writeAudit,
} from '../../lib/p2pDownstream';
import { Banknote, Plus, X, Loader2, Eye, Send, Save, Search, Ban, Store } from 'lucide-react';

interface PaymentVendor {
  id: string;
  name: string;
  terms: string;
  notes?: string;
}

interface PaymentRow {
  id: string;
  payment_number: string;
  apv_id: string;
  supplier_name?: string;
  payment_method: string;
  payment_date: string;
  amount_paid: number;
  reference_no: string;
  status: PaymentStatus;
  vendor_name?: string | null;
  vendor_terms?: string | null;
  ap_vouchers?: { apv_number: string; net_payable: number; invoice_id: string; supplier_invoices?: { invoice_number: string; canvass_requests?: { canvass_number: string } } };
}

export function Payments() {
  const { profile } = useAuth();
  const [list, setList] = useState<PaymentRow[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterText, setFilterText] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [paymentsRes, queueRes] = await Promise.all([
      supabase
        .from('payments')
        .select('*, ap_vouchers(apv_number, net_payable, invoice_id, supplier_invoices(invoice_number, canvass_requests(canvass_number)))')
        .order('created_at', { ascending: false }),
      supabase
        .from('ap_vouchers')
        .select('id, apv_number, net_payable, due_date, supplier_name, posted_at, supplier_invoices(invoice_number)')
        .eq('status', 'Posted')
        .order('due_date', { ascending: true, nullsFirst: false }),
    ]);
    setList((paymentsRes.data || []) as PaymentRow[]);
    setQueue(queueRes.data || []);
    setLoading(false);
  };

  const filtered = useMemo(() => list.filter((p) => {
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterText) {
      const t = filterText.toLowerCase();
      const hay = [p.payment_number, p.reference_no, p.supplier_name || '', p.ap_vouchers?.apv_number || ''].join(' ').toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  }), [list, filterStatus, filterText]);

  const isAdmin = profile?.role === 'admin';

  const voidPayment = async (paymentId: string) => {
    if (!confirm('Void this payment? APV will revert to Posted.')) return;
    const { data: p } = await supabase.from('payments').select('apv_id, status').eq('id', paymentId).maybeSingle();
    if (!p) return;
    await supabase.from('payments').update({ status: 'Voided' }).eq('id', paymentId);
    await supabase.from('ap_vouchers').update({ status: 'Posted' }).eq('id', p.apv_id);
    await writeAudit('Payment', paymentId, 'Voided', p.status, 'Voided', '');
    load();
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Banknote className="text-blue-600" /> Payments
          </h2>
          <p className="text-slate-600 mt-1 text-sm">Disburse payments against posted AP Vouchers.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={!profile}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold shadow-sm"
        >
          <Plus size={18} /> New Payment
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Payment Queue ({queue.length})</h3>
        {queue.length === 0 ? (
          <div className="text-sm text-slate-500">No posted AP Vouchers awaiting payment.</div>
        ) : (
          <div className="overflow-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase">APV</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase">Invoice</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase">Due</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase">Net Payable</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((q) => {
                  const overdue = q.due_date && new Date(q.due_date) < new Date();
                  return (
                    <tr key={q.id} className="border-t">
                      <td className="px-3 py-2 font-mono">{q.apv_number}</td>
                      <td className="px-3 py-2">{q.supplier_invoices?.invoice_number || '\u2014'}</td>
                      <td className="px-3 py-2">
                        <span className={overdue ? 'text-rose-700 font-bold' : ''}>{formatDate(q.due_date)}</span>
                      </td>
                      <td className="px-3 py-2 font-semibold">{formatMoney(q.net_payable)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="Search payment, APV, reference..." className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm outline-none" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
          <option value="">All Statuses</option>
          {['Draft', 'Submitted', 'Paid', 'Voided'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500"><Loader2 className="animate-spin inline" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No payments yet</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Payment No.', 'APV', 'Invoice', 'Vendor', 'Terms', 'Method', 'Date', 'Amount', 'Reference', 'Status', 'Action'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-700 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-sm">{p.payment_number}</td>
                    <td className="px-4 py-3 text-sm">{p.ap_vouchers?.apv_number || '\u2014'}</td>
                    <td className="px-4 py-3 text-sm">{p.ap_vouchers?.supplier_invoices?.invoice_number || '\u2014'}</td>
                    <td className="px-4 py-3 text-sm">{(p as any).vendor_name || '\u2014'}</td>
                    <td className="px-4 py-3 text-sm">{(p as any).vendor_terms ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">{(p as any).vendor_terms}</span> : '\u2014'}</td>
                    <td className="px-4 py-3 text-sm">{p.payment_method}</td>
                    <td className="px-4 py-3 text-sm">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-3 text-sm font-bold">{formatMoney(p.amount_paid)}</td>
                    <td className="px-4 py-3 text-sm">{p.reference_no || '\u2014'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${statusBadgeClasses(p.status)}`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3 flex items-center gap-1">
                      <button onClick={() => setDetailId(p.id)} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" title="View">
                        <Eye size={14} />
                      </button>
                      {isAdmin && p.status === 'Paid' && (
                        <button onClick={() => voidPayment(p.id)} className="p-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700" title="Void">
                          <Ban size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <PaymentForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {detailId && <PaymentDetail id={detailId} onClose={() => { setDetailId(null); load(); }} onChanged={load} />}
    </div>
  );
}

function PaymentForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [apvs, setApvs] = useState<any[]>([]);
  const [apvId, setApvId] = useState('');
  const [method, setMethod] = useState('BankTransfer');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(0);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [vendors, setVendors] = useState<PaymentVendor[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorTerms, setNewVendorTerms] = useState('Net 30');
  const [newVendorNotes, setNewVendorNotes] = useState('');
  const [addingVendor, setAddingVendor] = useState(false);

  const loadVendors = async () => {
    const { data } = await supabase
      .from('payment_vendors')
      .select('id, name, terms, notes')
      .order('name');
    setVendors((data || []) as PaymentVendor[]);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('ap_vouchers')
        .select('id, apv_number, net_payable, supplier_name, supplier_invoices(invoice_number)')
        .eq('status', 'Posted');
      setApvs(data || []);
    })();
    loadVendors();
  }, []);

  const selectedVendor = vendors.find((v) => v.id === vendorId) || null;

  const addVendor = async () => {
    setError('');
    if (!newVendorName.trim()) return setError('Vendor name is required.');
    if (!newVendorTerms.trim()) return setError('Vendor terms are required.');
    setAddingVendor(true);
    try {
      const { data, error: err } = await supabase
        .from('payment_vendors')
        .insert({
          name: newVendorName.trim(),
          terms: newVendorTerms.trim(),
          notes: newVendorNotes.trim(),
          created_by: profile?.id ?? null,
        })
        .select()
        .maybeSingle();
      if (err) throw err;
      if (data) {
        await loadVendors();
        setVendorId(data.id);
        setShowAddVendor(false);
        setNewVendorName('');
        setNewVendorTerms('Net 30');
        setNewVendorNotes('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add vendor');
    } finally {
      setAddingVendor(false);
    }
  };

  useEffect(() => {
    const a = apvs.find((x) => x.id === apvId);
    if (a) setAmount(Number(a.net_payable || 0));
  }, [apvId, apvs]);

  const submit = async (markPaid: boolean) => {
    setError('');
    if (!apvId) return setError('Select a posted APV.');
    if (!amount || amount <= 0) return setError('Enter a payment amount.');
    const apv = apvs.find((a) => a.id === apvId);
    const isAdmin = profile?.role === 'admin';
    if (!isAdmin && apv && Number(amount) > Number(apv.net_payable || 0)) {
      return setError('Amount exceeds net payable. Admin override required.');
    }

    setSaving(true);
    try {
      const settings = await loadSettings();
      const paymentNumber = await nextPaymentNumber();
      const row: any = {
        payment_number: paymentNumber,
        apv_id: apvId,
        supplier_id: apv?.supplier_id ?? null,
        supplier_name: apv?.supplier_name ?? null,
        vendor_id: selectedVendor?.id ?? null,
        vendor_name: selectedVendor?.name ?? null,
        vendor_terms: selectedVendor?.terms ?? null,
        payment_method: method,
        payment_date: date,
        amount_paid: amount,
        reference_no: reference,
        status: markPaid ? 'Paid' : 'Submitted',
        paid_by_user_id: markPaid ? profile?.id ?? null : null,
        paid_at: markPaid ? new Date().toISOString() : null,
        created_by: profile?.id ?? null,
      };

      if (markPaid && settings?.require_proof_on_payment) {
        // proof_attachment handling: UI uploads are out of scope for this form minimal version;
        // allow an operator to skip this check only as admin.
        if (!isAdmin) {
          setError('Proof attachment required by settings. Submit as draft first and attach proof.');
          setSaving(false);
          return;
        }
      }

      const { data: inserted, error: err } = await supabase.from('payments').insert(row).select().maybeSingle();
      if (err) throw err;
      if (!inserted) throw new Error('Failed');

      if (markPaid) {
        await supabase.from('ap_vouchers').update({ status: 'Paid' }).eq('id', apvId);
      } else {
        await supabase.from('ap_vouchers').update({ status: 'For_Payment' }).eq('id', apvId);
      }
      await writeAudit('Payment', inserted.id, markPaid ? 'Paid' : 'Submitted', '', row.status, '');
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
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-xl font-bold text-slate-900">New Payment</h3>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Posted AP Voucher <span className="text-rose-500">*</span></label>
            <select value={apvId} onChange={(e) => setApvId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
              <option value="">Select APV...</option>
              {apvs.map((a) => (
                <option key={a.id} value={a.id}>{a.apv_number} &middot; {a.supplier_invoices?.invoice_number} &middot; {formatMoney(a.net_payable)}</option>
              ))}
            </select>
          </div>
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1">
                <Store size={14} className="text-blue-600" /> Vendor <span className="text-slate-400 font-normal">(with terms)</span>
              </label>
              <button
                type="button"
                onClick={() => setShowAddVendor((s) => !s)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                <Plus size={12} /> {showAddVendor ? 'Close' : 'Add Vendor'}
              </button>
            </div>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="">Select vendor...</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name} &middot; {v.terms}</option>
              ))}
            </select>
            {selectedVendor && (
              <div className="text-xs text-slate-600">
                Terms: <span className="font-semibold text-slate-900">{selectedVendor.terms}</span>
                {selectedVendor.notes ? <span className="text-slate-500"> &middot; {selectedVendor.notes}</span> : null}
              </div>
            )}
            {showAddVendor && (
              <div className="mt-2 p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor Name <span className="text-rose-500">*</span></label>
                    <input value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Terms <span className="text-rose-500">*</span></label>
                    <select value={newVendorTerms} onChange={(e) => setNewVendorTerms(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-sm bg-white">
                      <option>COD</option>
                      <option>Net 7</option>
                      <option>Net 15</option>
                      <option>Net 30</option>
                      <option>Net 45</option>
                      <option>Net 60</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                  <input value={newVendorNotes} onChange={(e) => setNewVendorNotes(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-sm" />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={addVendor}
                    disabled={addingVendor}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center gap-1"
                  >
                    {addingVendor ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Vendor
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                <option>BankTransfer</option>
                <option>Check</option>
                <option>Cash</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Payment Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Amount</label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Reference No.</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={() => submit(false)} disabled={saving} className="px-4 py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Submit
          </button>
          <button onClick={() => submit(true)} disabled={saving} className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} Mark Paid
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { profile } = useAuth();
  const [p, setP] = useState<any | null>(null);
  const [working, setWorking] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('payments')
      .select('*, ap_vouchers(apv_number, net_payable, supplier_invoices(invoice_number, canvass_requests(canvass_number)))')
      .eq('id', id)
      .maybeSingle();
    setP(data);
  };
  useEffect(() => { load(); }, [id]);

  const markPaid = async () => {
    if (!p) return;
    setWorking(true);
    try {
      await supabase.from('payments').update({
        status: 'Paid',
        paid_by_user_id: profile?.id ?? null,
        paid_at: new Date().toISOString(),
      }).eq('id', p.id);
      await supabase.from('ap_vouchers').update({ status: 'Paid' }).eq('id', p.apv_id);
      await writeAudit('Payment', p.id, 'Paid', p.status, 'Paid', '');
      await load();
      onChanged();
    } finally { setWorking(false); }
  };

  if (!p) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl p-12"><Loader2 className="animate-spin" /></div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-xl font-bold text-slate-900">{p.payment_number}</h3>
            <p className="text-sm text-slate-500">APV {p.ap_vouchers?.apv_number}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-2 text-sm">
          <div><span className="text-slate-500">Status:</span> <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${statusBadgeClasses(p.status)}`}>{p.status}</span></div>
          <div><span className="text-slate-500">Method:</span> {p.payment_method}</div>
          <div><span className="text-slate-500">Date:</span> {formatDate(p.payment_date)}</div>
          <div><span className="text-slate-500">Amount:</span> <span className="font-bold">{formatMoney(p.amount_paid)}</span></div>
          <div><span className="text-slate-500">Reference:</span> {p.reference_no || '\u2014'}</div>
          <div><span className="text-slate-500">Invoice:</span> {p.ap_vouchers?.supplier_invoices?.invoice_number}</div>
          <div><span className="text-slate-500">Vendor:</span> {p.vendor_name || '\u2014'}</div>
          <div><span className="text-slate-500">Terms:</span> {p.vendor_terms ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">{p.vendor_terms}</span> : '\u2014'}</div>
        </div>
        {p.status === 'Submitted' && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <button onClick={markPaid} disabled={working} className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center gap-2">
              {working ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} Mark Paid
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


export { Payments }