import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Loader2, Send, Download, FileSpreadsheet, X, ChevronRight,
  CheckCircle2, RotateCcw, XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { generateApvPdf, ApvPdfData } from '../../lib/apvCvPdfGenerator';

type APVStatus = 'draft' | 'pending_approval' | 'approved' | 'returned' | 'rejected' | 'paid' | 'cancelled';

interface MatchedInvoice {
  id: string;
  invoice_ref_number: string;
  invoice_number: string;
  vendor_id: string | null;
  vendor_name: string;
  vendor_tin: string;
  po_number: string;
  purchase_order_id: string;
  payment_terms: string;
  due_date: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  net_payable: number;
  company_id: string | null;
}

interface APV {
  id: string;
  apv_number: string;
  vendor_invoice_id: string | null;
  purchase_order_id: string | null;
  po_number: string;
  invoice_number: string;
  vendor_id: string | null;
  vendor_name: string;
  vendor_tin: string;
  vendor_address: string;
  company_id: string | null;
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
  other_deductions_description: string;
  net_payable: number;
  payment_terms: string;
  due_date: string | null;
  posting_date: string;
  status: APVStatus;
  remarks: string;
  created_at: string;
}

interface CoaItem { account_code: string; account_name: string; }
interface EwtItem { rate: number; description: string; }

const INPUT = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const READONLY = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-700';

const STATUS_STYLES: Record<APVStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  pending_approval: 'bg-blue-100 text-blue-700 border-blue-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  returned: 'bg-amber-100 text-amber-800 border-amber-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  paid: 'bg-emerald-700 text-white border-emerald-800',
  cancelled: 'bg-slate-700 text-white border-slate-800',
};
const STATUS_LABELS: Record<APVStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  returned: 'Returned',
  rejected: 'Rejected',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

function fmt(n: number) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dueColor(d: string | null) {
  if (!d) return 'text-slate-500';
  const days = Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'text-rose-600 font-semibold';
  if (days <= 7) return 'text-orange-600 font-semibold';
  if (days <= 15) return 'text-amber-600';
  return 'text-emerald-600';
}

function StatusBadge({ status }: { status: APVStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

interface ToastMsg { id: number; type: 'success' | 'error' | 'info'; text: string; }

export function APVoucher() {
  const { user, profile } = useAuth();
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [vouchers, setVouchers] = useState<APV[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<APVStatus | 'all'>('all');
  const [showInvoicePicker, setShowInvoicePicker] = useState(false);
  const [matchedInvoices, setMatchedInvoices] = useState<MatchedInvoice[]>([]);
  const [coa, setCoa] = useState<CoaItem[]>([]);
  const [ewtRates, setEwtRates] = useState<EwtItem[]>([]);
  const [activeApv, setActiveApv] = useState<APV | null>(null);
  const [draftInvoice, setDraftInvoice] = useState<MatchedInvoice | null>(null);
  const [draft, setDraft] = useState<Partial<APV>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [approveModal, setApproveModal] = useState<'approve' | 'return' | 'reject' | null>(null);
  const [actionRemarks, setActionRemarks] = useState('');

  const role = String(profile?.role || '');
  const isApprover = ['admin', 'finance', 'accounting'].includes(role);

  const showToast = (type: ToastMsg['type'], text: string) => {
    const id = Date.now();
    setToast({ id, type, text });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3500);
  };

  useEffect(() => { load(); loadRefs(); }, []);

  const loadRefs = async () => {
    const [c, e] = await Promise.all([
      supabase.from('chart_of_accounts').select('account_code, account_name').eq('is_active', true).order('account_code'),
      supabase.from('ewt_rate_options').select('rate, description').eq('is_active', true).order('rate'),
    ]);
    setCoa((c.data as CoaItem[]) || []);
    setEwtRates((e.data as EwtItem[]) || []);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ap_vouchers')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) showToast('error', error.message);
    else setVouchers((data || []) as APV[]);
    setLoading(false);
  };

  const summary = useMemo(() => {
    const total = vouchers.length;
    const pending = vouchers.filter((v) => v.status === 'pending_approval').length;
    const approved = vouchers.filter((v) => v.status === 'approved').length;
    const paid = vouchers.filter((v) => v.status === 'paid').length;
    const totalPayable = vouchers
      .filter((v) => ['approved', 'pending_approval'].includes(v.status))
      .reduce((s, v) => s + Number(v.net_payable || 0), 0);
    return { total, pending, approved, paid, totalPayable };
  }, [vouchers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vouchers.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.apv_number.toLowerCase().includes(q) ||
        v.po_number.toLowerCase().includes(q) ||
        v.vendor_name.toLowerCase().includes(q) ||
        v.invoice_number.toLowerCase().includes(q)
      );
    });
  }, [vouchers, search, statusFilter]);

  const openInvoicePicker = async () => {
    setShowInvoicePicker(true);
    const { data: invs } = await supabase
      .from('vendor_invoices')
      .select('id, invoice_ref_number, invoice_number, vendor_id, vendor_name, vendor_tin, po_number, purchase_order_id, payment_terms, due_date, subtotal, vat_amount, total_amount, net_payable, company_id')
      .eq('status', 'matched')
      .is('deleted_at', null);
    const invList = (invs || []) as MatchedInvoice[];
    const { data: existing } = await supabase
      .from('ap_vouchers')
      .select('vendor_invoice_id')
      .not('vendor_invoice_id', 'is', null)
      .is('deleted_at', null);
    const used = new Set((existing || []).map((r: any) => r.vendor_invoice_id));
    setMatchedInvoices(invList.filter((i) => !used.has(i.id)));
  };

  const startCreate = (inv: MatchedInvoice) => {
    setDraftInvoice(inv);
    setDraft({
      vendor_id: inv.vendor_id,
      vendor_name: inv.vendor_name,
      vendor_tin: inv.vendor_tin,
      vendor_address: '',
      po_number: inv.po_number,
      invoice_number: inv.invoice_number,
      purchase_order_id: inv.purchase_order_id,
      vendor_invoice_id: inv.id,
      payment_terms: inv.payment_terms,
      due_date: inv.due_date,
      company_id: inv.company_id,
      invoice_amount: Number(inv.subtotal || 0),
      vat_amount: Number(inv.vat_amount || 0),
      ewt_rate: 0,
      ewt_amount: 0,
      other_deductions: 0,
      other_deductions_description: '',
      gl_account_code: '',
      gl_account_name: '',
      cost_center: '',
      department: '',
      expense_category: '',
      posting_date: new Date().toISOString().split('T')[0],
      remarks: '',
    });
    setShowInvoicePicker(false);
    setView('create');
  };

  const computed = useMemo(() => {
    const inv = Number(draft.invoice_amount || 0);
    const vat = Number(draft.vat_amount || 0);
    const rate = Number(draft.ewt_rate || 0);
    const ewt = inv * (rate / 100);
    const other = Number(draft.other_deductions || 0);
    const net = inv + vat - ewt - other;
    return { ewt, net };
  }, [draft.invoice_amount, draft.vat_amount, draft.ewt_rate, draft.other_deductions]);

  const updateDraft = (patch: Partial<APV>) => setDraft((p) => ({ ...p, ...patch }));

  const handleGlChange = (code: string) => {
    const item = coa.find((c) => c.account_code === code);
    updateDraft({ gl_account_code: code, gl_account_name: item?.account_name || '' });
  };

  const validateDraft = (): string | null => {
    if (!draft.gl_account_code) return 'GL account is required';
    if (!draft.department) return 'Department / cost center is required';
    if (!draft.expense_category) return 'Expense category is required';
    if (Number(draft.invoice_amount || 0) <= 0) return 'Invoice amount must be positive';
    if (Number(draft.other_deductions || 0) > 0 && !draft.other_deductions_description) {
      return 'Describe the other deductions';
    }
    if (computed.net <= 0) return 'Net payable must be greater than zero';
    return null;
  };

  const save = async (submit: boolean) => {
    const err = validateDraft();
    if (err) { showToast('error', err); return; }
    setSaving(true);
    try {
      const { data: refData, error: refErr } = await supabase.rpc('generate_apv_number', {
        p_company_id: draft.company_id || null,
      });
      if (refErr) throw refErr;
      const apvNumber = refData as string;

      const { data: created, error: insErr } = await supabase
        .from('ap_vouchers')
        .insert({
          apv_number: apvNumber,
          vendor_invoice_id: draft.vendor_invoice_id,
          purchase_order_id: draft.purchase_order_id,
          po_number: draft.po_number || '',
          invoice_number: draft.invoice_number || '',
          vendor_id: draft.vendor_id,
          vendor_name: draft.vendor_name || '',
          vendor_tin: draft.vendor_tin || '',
          vendor_address: draft.vendor_address || '',
          company_id: draft.company_id,
          gl_account_code: draft.gl_account_code || '',
          gl_account_name: draft.gl_account_name || '',
          cost_center: draft.cost_center || '',
          department: draft.department || '',
          expense_category: draft.expense_category || '',
          invoice_amount: Number(draft.invoice_amount || 0),
          vat_amount: Number(draft.vat_amount || 0),
          ewt_rate: Number(draft.ewt_rate || 0),
          ewt_amount: Number(computed.ewt.toFixed(2)),
          other_deductions: Number(draft.other_deductions || 0),
          other_deductions_description: draft.other_deductions_description || '',
          net_payable: Number(computed.net.toFixed(2)),
          payment_terms: draft.payment_terms || '',
          due_date: draft.due_date,
          posting_date: draft.posting_date,
          status: submit ? 'pending_approval' : 'draft',
          remarks: draft.remarks || '',
          created_by: user?.id,
          updated_by: user?.id,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      await supabase.from('payment_audit_logs').insert({
        reference_type: 'ap_voucher',
        reference_id: created!.id,
        action: submit ? 'submitted' : 'created',
        performed_by: user?.id,
        new_values: { status: submit ? 'pending_approval' : 'draft' },
      });

      showToast('success', submit ? 'Submitted for approval' : 'Saved as draft');
      setView('list');
      await load();
    } catch (e: any) {
      console.error(e);
      showToast('error', e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (v: APV) => {
    setActiveApv(v);
    setView('detail');
  };

  const performAction = async () => {
    if (!activeApv || !approveModal) return;
    if ((approveModal === 'return' || approveModal === 'reject') && !actionRemarks.trim()) {
      showToast('error', 'Remarks required'); return;
    }
    setSaving(true);
    try {
      let nextStatus: APVStatus = activeApv.status;
      const update: Record<string, any> = { updated_by: user?.id };
      const audit: Record<string, any> = {
        reference_type: 'ap_voucher', reference_id: activeApv.id, performed_by: user?.id, remarks: actionRemarks,
      };
      if (approveModal === 'approve') {
        nextStatus = 'approved';
        update.status = 'approved';
        update.approved_at = new Date().toISOString();
        audit.action = 'approved';
      } else if (approveModal === 'return') {
        nextStatus = 'returned';
        update.status = 'returned';
        audit.action = 'returned';
      } else {
        nextStatus = 'rejected';
        update.status = 'rejected';
        update.rejected_at = new Date().toISOString();
        audit.action = 'rejected';
      }

      const { error: upErr } = await supabase.from('ap_vouchers').update(update).eq('id', activeApv.id);
      if (upErr) throw upErr;

      await supabase.from('apv_approval_logs').insert({
        ap_voucher_id: activeApv.id,
        approver_id: user?.id,
        approval_level: 1,
        status: approveModal === 'approve' ? 'approved' : approveModal === 'return' ? 'returned' : 'rejected',
        remarks: actionRemarks,
        acted_at: new Date().toISOString(),
      });
      await supabase.from('payment_audit_logs').insert(audit);

      if (nextStatus === 'approved') {
        await supabase.from('vendor_invoices').update({ status: 'posted' }).eq('id', activeApv.vendor_invoice_id);
        const dueDate = activeApv.due_date || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
        const batch = computeBatch(dueDate);
        await supabase.from('payment_schedule').upsert({
          ap_voucher_id: activeApv.id,
          vendor_id: activeApv.vendor_id,
          vendor_name: activeApv.vendor_name,
          net_payable: activeApv.net_payable,
          due_date: dueDate,
          scheduled_payment_date: dueDate,
          payment_batch: batch,
          is_paid: false,
        }, { onConflict: 'ap_voucher_id' });
      }

      showToast('success', `APV ${approveModal === 'approve' ? 'approved' : approveModal === 'return' ? 'returned' : 'rejected'}`);
      setApproveModal(null);
      setActionRemarks('');
      await load();
      const refreshed = (await supabase.from('ap_vouchers').select('*').eq('id', activeApv.id).maybeSingle()).data;
      if (refreshed) setActiveApv(refreshed as APV);
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!activeApv) return;
    try {
      const data: ApvPdfData = {
        apv_number: activeApv.apv_number,
        posting_date: activeApv.posting_date,
        vendor_name: activeApv.vendor_name,
        vendor_tin: activeApv.vendor_tin,
        vendor_address: activeApv.vendor_address,
        po_number: activeApv.po_number,
        invoice_number: activeApv.invoice_number,
        payment_terms: activeApv.payment_terms,
        due_date: activeApv.due_date,
        gl_account_code: activeApv.gl_account_code,
        gl_account_name: activeApv.gl_account_name,
        cost_center: activeApv.cost_center,
        department: activeApv.department,
        expense_category: activeApv.expense_category,
        invoice_amount: Number(activeApv.invoice_amount),
        vat_amount: Number(activeApv.vat_amount),
        ewt_rate: Number(activeApv.ewt_rate),
        ewt_amount: Number(activeApv.ewt_amount),
        other_deductions: Number(activeApv.other_deductions),
        net_payable: Number(activeApv.net_payable),
        remarks: activeApv.remarks,
      };
      const blob = await generateApvPdf(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${activeApv.apv_number}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast('error', e.message);
    }
  };

  if (view === 'list') {
    return (
      <div className="space-y-4">
        <Toast toast={toast} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet size={24} className="text-blue-600" />
              AP Vouchers
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Posting matched invoices for payment</p>
          </div>
          <button
            onClick={openInvoicePicker}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={16} /> New AP Voucher
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <SummaryCard label="Total APVs" value={summary.total} accent="text-slate-700" />
          <SummaryCard label="Pending Approval" value={summary.pending} accent="text-blue-700" />
          <SummaryCard label="Approved" value={summary.approved} accent="text-emerald-700" />
          <SummaryCard label="Paid" value={summary.paid} accent="text-emerald-800" />
          <SummaryCard label="Outstanding" value={fmt(summary.totalPayable)} accent="text-orange-700" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" placeholder="Search by APV, PO, invoice, vendor..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="all">All Statuses</option>
              {(Object.keys(STATUS_LABELS) as APVStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="p-8 flex items-center justify-center text-slate-500">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <FileSpreadsheet size={32} className="mx-auto mb-2 text-slate-300" />
              <p>No AP vouchers yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-medium">APV Number</th>
                    <th className="px-4 py-2 font-medium">PO</th>
                    <th className="px-4 py-2 font-medium">Invoice</th>
                    <th className="px-4 py-2 font-medium">Vendor</th>
                    <th className="px-4 py-2 font-medium text-right">Amount</th>
                    <th className="px-4 py-2 font-medium text-right">Net Payable</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Due Date</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(v)}>
                      <td className="px-4 py-2 font-medium text-slate-900">{v.apv_number}</td>
                      <td className="px-4 py-2 text-slate-700">{v.po_number || '-'}</td>
                      <td className="px-4 py-2 text-slate-700">{v.invoice_number || '-'}</td>
                      <td className="px-4 py-2 text-slate-700">{v.vendor_name}</td>
                      <td className="px-4 py-2 text-right text-slate-700">{fmt(Number(v.invoice_amount))}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-900">{fmt(Number(v.net_payable))}</td>
                      <td className="px-4 py-2"><StatusBadge status={v.status} /></td>
                      <td className={`px-4 py-2 text-sm ${dueColor(v.due_date)}`}>{v.due_date || '-'}</td>
                      <td className="px-4 py-2 text-slate-400"><ChevronRight size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showInvoicePicker && (
          <InvoicePickerModal invoices={matchedInvoices} onClose={() => setShowInvoicePicker(false)} onSelect={startCreate} />
        )}
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="space-y-4">
        <Toast toast={toast} />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">New AP Voucher</h1>
            <p className="text-sm text-slate-500 mt-0.5">From invoice {draftInvoice?.invoice_ref_number}</p>
          </div>
          <button onClick={() => setView('list')} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Vendor"><input readOnly value={draft.vendor_name || ''} className={READONLY} /></Field>
            <Field label="PO Number"><input readOnly value={draft.po_number || ''} className={READONLY} /></Field>
            <Field label="Invoice Number"><input readOnly value={draft.invoice_number || ''} className={READONLY} /></Field>
            <Field label="Payment Terms"><input readOnly value={draft.payment_terms || ''} className={READONLY} /></Field>
            <Field label="Due Date"><input readOnly value={draft.due_date || ''} className={READONLY} /></Field>
            <Field label="Posting Date *">
              <input type="date" value={(draft.posting_date as string) || ''}
                onChange={(e) => updateDraft({ posting_date: e.target.value })} className={INPUT} />
            </Field>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">GL Coding</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="GL Account *">
              <select value={draft.gl_account_code || ''} onChange={(e) => handleGlChange(e.target.value)} className={INPUT}>
                <option value="">Select account...</option>
                {coa.map((c) => (
                  <option key={c.account_code} value={c.account_code}>
                    {c.account_code} - {c.account_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cost Center">
              <input type="text" value={draft.cost_center || ''} onChange={(e) => updateDraft({ cost_center: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Department *">
              <input type="text" value={draft.department || ''} onChange={(e) => updateDraft({ department: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Expense Category *">
              <input type="text" value={draft.expense_category || ''} onChange={(e) => updateDraft({ expense_category: e.target.value })} className={INPUT} />
            </Field>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Amounts and Deductions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Invoice Amount">
              <input readOnly value={fmt(Number(draft.invoice_amount || 0))} className={READONLY} />
            </Field>
            <Field label="VAT (12%)">
              <input readOnly value={fmt(Number(draft.vat_amount || 0))} className={READONLY} />
            </Field>
            <Field label="EWT Rate">
              <select value={String(draft.ewt_rate || 0)} onChange={(e) => updateDraft({ ewt_rate: parseFloat(e.target.value) })} className={INPUT}>
                <option value="0">No EWT</option>
                {ewtRates.map((r) => (
                  <option key={r.rate} value={r.rate}>{r.description}</option>
                ))}
              </select>
            </Field>
            <Field label="EWT Amount">
              <input readOnly value={fmt(computed.ewt)} className={READONLY} />
            </Field>
            <Field label="Other Deductions">
              <input type="number" step="0.01" min="0" value={Number(draft.other_deductions || 0)}
                onChange={(e) => updateDraft({ other_deductions: parseFloat(e.target.value) || 0 })} className={INPUT} />
            </Field>
            <Field label="Description (if other deductions)">
              <input type="text" value={draft.other_deductions_description || ''}
                onChange={(e) => updateDraft({ other_deductions_description: e.target.value })} className={INPUT} />
            </Field>
          </div>
          <div className="border-t border-slate-200 pt-3 flex items-center justify-end gap-6">
            <span className="text-sm text-slate-600">Net Payable</span>
            <span className="text-2xl font-semibold text-blue-700">PHP {fmt(computed.net)}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <Field label="Remarks">
            <textarea rows={3} value={draft.remarks || ''} onChange={(e) => updateDraft({ remarks: e.target.value })} className={INPUT} />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={() => save(false)} disabled={saving}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            Save Draft
          </button>
          <button onClick={() => save(true)} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Submit for Approval
          </button>
        </div>
      </div>
    );
  }

  // DETAIL
  if (!activeApv) return null;

  return (
    <div className="space-y-4">
      <Toast toast={toast} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{activeApv.apv_number}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{activeApv.vendor_name} • PO {activeApv.po_number}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadPdf}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
            <Download size={14} /> APV PDF
          </button>
          <button onClick={() => setView('list')} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
            Back
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2"><StatusBadge status={activeApv.status} /></div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <DetailField label="Vendor" value={activeApv.vendor_name} />
        <DetailField label="TIN" value={activeApv.vendor_tin} />
        <DetailField label="Invoice Number" value={activeApv.invoice_number} />
        <DetailField label="Payment Terms" value={activeApv.payment_terms} />
        <DetailField label="Posting Date" value={activeApv.posting_date} />
        <DetailField label="Due Date" value={activeApv.due_date || '-'} />
        <DetailField label="GL Account" value={`${activeApv.gl_account_code} - ${activeApv.gl_account_name}`} />
        <DetailField label="Department" value={activeApv.department} />
        <DetailField label="Expense Category" value={activeApv.expense_category} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Amounts</h2>
        <div className="space-y-2 text-sm max-w-md ml-auto">
          <Row label="Invoice Amount" value={Number(activeApv.invoice_amount)} />
          <Row label="VAT" value={Number(activeApv.vat_amount)} />
          <Row label={`EWT (${Number(activeApv.ewt_rate)}%)`} value={-Number(activeApv.ewt_amount)} />
          <Row label="Other Deductions" value={-Number(activeApv.other_deductions)} />
          <div className="border-t border-slate-200 pt-2">
            <Row label="Net Payable" value={Number(activeApv.net_payable)} bold accent="text-blue-700" />
          </div>
        </div>
      </div>

      {activeApv.remarks && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-amber-700 mb-1">Remarks</div>
          <p className="text-sm text-amber-900">{activeApv.remarks}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {activeApv.status === 'pending_approval' && isApprover && (
          <>
            <button onClick={() => { setApproveModal('reject'); setActionRemarks(''); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-rose-300 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-50">
              <XCircle size={14} /> Reject
            </button>
            <button onClick={() => { setApproveModal('return'); setActionRemarks(''); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-amber-300 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-50">
              <RotateCcw size={14} /> Return
            </button>
            <button onClick={() => { setApproveModal('approve'); setActionRemarks(''); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
              <CheckCircle2 size={14} /> Approve
            </button>
          </>
        )}
      </div>

      {approveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900 capitalize">{approveModal} APV</h3>
              <button onClick={() => setApproveModal(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5">
              <Field label={`Remarks ${approveModal === 'approve' ? '' : '*'}`}>
                <textarea value={actionRemarks} onChange={(e) => setActionRemarks(e.target.value)}
                  rows={4} className={INPUT} />
              </Field>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setApproveModal(null)} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={performAction} disabled={saving}
                className={`px-4 py-1.5 text-sm text-white rounded-lg disabled:opacity-50 ${
                  approveModal === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' :
                  approveModal === 'return' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}>
                {saving ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function computeBatch(due: string): 'weekly' | 'bi_monthly' | 'monthly' | 'special' {
  const days = Math.floor((new Date(due).getTime() - Date.now()) / 86400000);
  if (days <= 7) return 'weekly';
  if (days <= 15) return 'bi_monthly';
  if (days <= 31) return 'monthly';
  return 'special';
}

function SummaryCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-medium text-slate-800 mt-0.5">{value || '-'}</div>
    </div>
  );
}

function Row({ label, value, bold = false, accent = '' }: { label: string; value: number; bold?: boolean; accent?: string }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-semibold' : ''} ${accent}`}>
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-900">{fmt(value)}</span>
    </div>
  );
}

function Toast({ toast }: { toast: ToastMsg | null }) {
  if (!toast) return null;
  const styles = {
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    error: 'bg-rose-50 text-rose-800 border-rose-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
  };
  return (
    <div className={`fixed bottom-4 right-4 px-4 py-2 border rounded-lg shadow-lg z-[60] ${styles[toast.type]}`}>
      {toast.text}
    </div>
  );
}

function InvoicePickerModal({
  invoices, onClose, onSelect,
}: { invoices: MatchedInvoice[]; onClose: () => void; onSelect: (i: MatchedInvoice) => void }) {
  const [q, setQ] = useState('');
  const filtered = invoices.filter((i) => !q ||
    i.invoice_ref_number.toLowerCase().includes(q.toLowerCase()) ||
    i.vendor_name.toLowerCase().includes(q.toLowerCase()) ||
    i.po_number.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">Select Matched Invoice</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search invoice, vendor, PO..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No matched invoices available</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((i) => (
                <li key={i.id} onClick={() => onSelect(i)}
                  className="px-5 py-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{i.invoice_ref_number}</div>
                    <div className="text-xs text-slate-500">{i.vendor_name} • PO {i.po_number} • Inv {i.invoice_number}</div>
                  </div>
                  <div className="text-sm font-medium text-slate-700">{fmt(Number(i.net_payable))}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
