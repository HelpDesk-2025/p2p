import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Loader2, Send, Download, Banknote, X, ChevronRight,
  CheckCircle2, RotateCcw, XCircle, AlertTriangle, ShieldAlert,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { generateCvPdf, CvPdfData } from '../../lib/apvCvPdfGenerator';

type CVStatus = 'draft' | 'pending_approval' | 'approved' | 'released' | 'completed' | 'cancelled' | 'voided';
type PayMethod = 'check' | 'bank_transfer' | 'auto_debit' | 'online_payment';
type PayStatus = 'pending' | 'for_release' | 'released' | 'cleared' | 'bounced' | 'cancelled' | 'voided';

interface APVOption {
  id: string;
  apv_number: string;
  vendor_id: string | null;
  vendor_name: string;
  invoice_number: string;
  net_payable: number;
  due_date: string | null;
  payment_terms: string;
  company_id: string | null;
  status: string;
}

interface CV {
  id: string;
  cv_number: string;
  ap_voucher_id: string | null;
  vendor_id: string | null;
  payee_name: string;
  payment_method: PayMethod;
  bank_name: string;
  bank_account_number: string;
  check_number: string | null;
  check_date: string | null;
  reference_number: string | null;
  total_amount: number;
  payment_date: string | null;
  payment_status: PayStatus;
  status: CVStatus;
  remarks: string;
  voided_reason: string | null;
  created_at: string;
}

interface ToastMsg { id: number; type: 'success' | 'error' | 'info'; text: string; }

const INPUT = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const READONLY = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-700';

const STATUS_STYLES: Record<CVStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  pending_approval: 'bg-blue-100 text-blue-700 border-blue-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  released: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  completed: 'bg-emerald-700 text-white border-emerald-800',
  cancelled: 'bg-slate-700 text-white border-slate-800',
  voided: 'bg-rose-700 text-white border-rose-800',
};
const STATUS_LABELS: Record<CVStatus, string> = {
  draft: 'Draft', pending_approval: 'Pending Approval', approved: 'Approved',
  released: 'Released', completed: 'Completed', cancelled: 'Cancelled', voided: 'Voided',
};
const PAY_LABELS: Record<PayStatus, string> = {
  pending: 'Pending', for_release: 'For Release', released: 'Released',
  cleared: 'Cleared', bounced: 'Bounced', cancelled: 'Cancelled', voided: 'Voided',
};

function fmt(n: number) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function maskAccount(acct: string): string {
  if (!acct || acct.length <= 4) return acct;
  return '****' + acct.slice(-4);
}

interface Props { initialApvIds?: string[]; onBack?: () => void; }

export function CheckVoucher({ initialApvIds, onBack }: Props = {}) {
  const { user, profile } = useAuth();
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [vouchers, setVouchers] = useState<CV[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CVStatus | 'all'>('all');
  const [showApvPicker, setShowApvPicker] = useState(false);
  const [apvOptions, setApvOptions] = useState<APVOption[]>([]);
  const [selectedApvIds, setSelectedApvIds] = useState<string[]>([]);
  const [selectedApvs, setSelectedApvs] = useState<APVOption[]>([]);
  const [draft, setDraft] = useState<Partial<CV>>({});
  const [saving, setSaving] = useState(false);
  const [activeCv, setActiveCv] = useState<CV | null>(null);
  const [activeLinks, setActiveLinks] = useState<{ apv_number: string; invoice_number: string; net_payable: number }[]>([]);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [actionModal, setActionModal] = useState<'approve' | 'return' | 'reject' | 'release' | 'clear' | 'bounce' | 'void' | null>(null);
  const [actionRemarks, setActionRemarks] = useState('');

  const role = String(profile?.role || '');
  const isApprover = ['admin', 'finance', 'accounting'].includes(role);
  const isTreasury = ['admin', 'treasury', 'finance', 'accounting'].includes(role);

  const showToast = (type: ToastMsg['type'], text: string) => {
    const id = Date.now();
    setToast({ id, type, text });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3500);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (initialApvIds?.length) {
      (async () => {
        const { data } = await supabase
          .from('ap_vouchers')
          .select('id, apv_number, vendor_id, vendor_name, invoice_number, net_payable, due_date, payment_terms, company_id, status')
          .in('id', initialApvIds);
        const opts = (data || []) as APVOption[];
        setSelectedApvs(opts);
        setSelectedApvIds(opts.map((o) => o.id));
        if (opts[0]) {
          setDraft({
            vendor_id: opts[0].vendor_id,
            payee_name: opts[0].vendor_name,
            payment_method: 'check',
            payment_date: new Date().toISOString().split('T')[0],
            total_amount: opts.reduce((s, o) => s + Number(o.net_payable || 0), 0),
          });
          setView('create');
        }
      })();
    }
  }, [initialApvIds]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('check_vouchers')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) showToast('error', error.message);
    else setVouchers((data || []) as CV[]);
    setLoading(false);
  };

  const summary = useMemo(() => {
    const total = vouchers.length;
    const pending = vouchers.filter((v) => v.status === 'pending_approval').length;
    const approved = vouchers.filter((v) => v.status === 'approved').length;
    const released = vouchers.filter((v) => v.status === 'released').length;
    const totalAmount = vouchers
      .filter((v) => !['cancelled', 'voided'].includes(v.status))
      .reduce((s, v) => s + Number(v.total_amount || 0), 0);
    return { total, pending, approved, released, totalAmount };
  }, [vouchers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vouchers.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.cv_number.toLowerCase().includes(q) ||
        v.payee_name.toLowerCase().includes(q) ||
        (v.check_number || '').toLowerCase().includes(q) ||
        (v.reference_number || '').toLowerCase().includes(q)
      );
    });
  }, [vouchers, search, statusFilter]);

  const openApvPicker = async () => {
    setShowApvPicker(true);
    const { data } = await supabase
      .from('ap_vouchers')
      .select('id, apv_number, vendor_id, vendor_name, invoice_number, net_payable, due_date, payment_terms, company_id, status')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('due_date', { ascending: true });
    const opts = (data || []) as APVOption[];
    const { data: linked } = await supabase.from('cv_apv_links').select('ap_voucher_id');
    const used = new Set((linked || []).map((r: any) => r.ap_voucher_id));
    setApvOptions(opts.filter((o) => !used.has(o.id)));
  };

  const toggleApv = (id: string) => {
    setSelectedApvIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const confirmApvSelection = () => {
    const sel = apvOptions.filter((o) => selectedApvIds.includes(o.id));
    if (sel.length === 0) { showToast('error', 'Select at least one APV'); return; }
    const firstVendor = sel[0].vendor_id;
    if (sel.some((s) => s.vendor_id !== firstVendor)) {
      showToast('error', 'All selected APVs must be for the same vendor');
      return;
    }
    setSelectedApvs(sel);
    setDraft({
      vendor_id: sel[0].vendor_id,
      payee_name: sel[0].vendor_name,
      payment_method: 'check',
      payment_date: new Date().toISOString().split('T')[0],
      total_amount: sel.reduce((s, o) => s + Number(o.net_payable || 0), 0),
      bank_name: '',
      bank_account_number: '',
      check_number: '',
      check_date: '',
      reference_number: '',
      remarks: '',
    });
    setShowApvPicker(false);
    setView('create');
  };

  const updateDraft = (patch: Partial<CV>) => setDraft((p) => ({ ...p, ...patch }));

  const validate = (): string | null => {
    const payee = (draft.payee_name || '').trim();
    if (!payee) return 'Payee name is required';
    if (payee.toLowerCase() === 'cash') return 'Payment to CASH is strictly prohibited';
    if (selectedApvs.length === 0) return 'No APVs selected';
    if (!draft.payment_method) return 'Payment method is required';
    if (!draft.payment_date) return 'Payment date is required';
    if (!draft.bank_name) return 'Bank name is required';
    if (draft.payment_method === 'check') {
      if (!draft.check_number) return 'Check number is required';
      if (!draft.check_date) return 'Check date is required';
    } else if (draft.payment_method === 'auto_debit') {
      if (!draft.reference_number) return 'Bank credit memo reference is required for auto-debit';
    } else {
      if (!draft.reference_number) return 'Reference number is required';
    }
    return null;
  };

  const save = async (submit: boolean) => {
    const err = validate();
    if (err) { showToast('error', err); return; }
    setSaving(true);
    try {
      const { data: refData, error: refErr } = await supabase.rpc('generate_cv_number', {
        p_company_id: selectedApvs[0]?.company_id || null,
      });
      if (refErr) throw refErr;

      const { data: created, error: insErr } = await supabase
        .from('check_vouchers')
        .insert({
          cv_number: refData as string,
          ap_voucher_id: selectedApvs.length === 1 ? selectedApvs[0].id : null,
          company_id: selectedApvs[0]?.company_id,
          vendor_id: draft.vendor_id,
          payee_name: (draft.payee_name || '').trim(),
          payment_method: draft.payment_method,
          bank_name: draft.bank_name || '',
          bank_account_number: draft.bank_account_number || '',
          check_number: draft.check_number || null,
          check_date: draft.check_date || null,
          reference_number: draft.reference_number || null,
          total_amount: Number(draft.total_amount || 0),
          payment_date: draft.payment_date,
          status: submit ? 'pending_approval' : 'draft',
          payment_status: submit ? 'for_release' : 'pending',
          remarks: draft.remarks || '',
          created_by: user?.id,
          updated_by: user?.id,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      const links = selectedApvs.map((a) => ({
        check_voucher_id: created!.id,
        ap_voucher_id: a.id,
        amount: Number(a.net_payable),
      }));
      const { error: linkErr } = await supabase.from('cv_apv_links').insert(links);
      if (linkErr) throw linkErr;

      await supabase.from('payment_audit_logs').insert({
        reference_type: 'check_voucher',
        reference_id: created!.id,
        action: submit ? 'submitted' : 'created',
        performed_by: user?.id,
      });

      showToast('success', submit ? 'Submitted for approval' : 'Saved as draft');
      setView('list');
      setSelectedApvs([]);
      setSelectedApvIds([]);
      setDraft({});
      await load();
    } catch (e: any) {
      console.error(e);
      showToast('error', e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (cv: CV) => {
    setActiveCv(cv);
    const { data } = await supabase
      .from('cv_apv_links')
      .select('amount, ap_vouchers(apv_number, invoice_number, net_payable)')
      .eq('check_voucher_id', cv.id);
    const rows = (data || []).map((r: any) => ({
      apv_number: r.ap_vouchers?.apv_number || '-',
      invoice_number: r.ap_vouchers?.invoice_number || '-',
      net_payable: Number(r.amount || 0),
    }));
    setActiveLinks(rows);
    setView('detail');
  };

  const performAction = async () => {
    if (!activeCv || !actionModal) return;
    if (['return', 'reject', 'bounce', 'void'].includes(actionModal) && !actionRemarks.trim()) {
      showToast('error', 'Remarks required'); return;
    }
    setSaving(true);
    try {
      if (actionModal === 'approve') {
        await supabase.from('check_vouchers').update({
          status: 'approved', payment_status: 'for_release', updated_by: user?.id,
        }).eq('id', activeCv.id);
        await supabase.from('cv_approval_logs').insert({
          check_voucher_id: activeCv.id, approver_id: user?.id, approval_level: 1,
          status: 'approved', remarks: actionRemarks, acted_at: new Date().toISOString(),
        });
        await supabase.from('payment_audit_logs').insert({
          reference_type: 'check_voucher', reference_id: activeCv.id,
          action: 'approved', performed_by: user?.id, remarks: actionRemarks,
        });
      } else if (actionModal === 'return' || actionModal === 'reject') {
        const next = actionModal === 'return' ? 'cancelled' : 'cancelled';
        await supabase.from('check_vouchers').update({
          status: next, updated_by: user?.id,
        }).eq('id', activeCv.id);
        await supabase.from('cv_approval_logs').insert({
          check_voucher_id: activeCv.id, approver_id: user?.id, approval_level: 1,
          status: actionModal === 'return' ? 'returned' : 'rejected', remarks: actionRemarks,
          acted_at: new Date().toISOString(),
        });
        await supabase.from('payment_audit_logs').insert({
          reference_type: 'check_voucher', reference_id: activeCv.id,
          action: actionModal === 'return' ? 'returned' : 'rejected', performed_by: user?.id, remarks: actionRemarks,
        });
      } else if (actionModal === 'release') {
        const { error } = await supabase.rpc('release_check_voucher', {
          p_cv_id: activeCv.id, p_user_id: user?.id,
        });
        if (error) throw error;
      } else if (actionModal === 'clear') {
        await supabase.from('check_vouchers').update({
          payment_status: 'cleared', cleared_at: new Date().toISOString(),
          status: 'completed', updated_by: user?.id,
        }).eq('id', activeCv.id);
        await supabase.from('payment_audit_logs').insert({
          reference_type: 'check_voucher', reference_id: activeCv.id, action: 'cleared',
          performed_by: user?.id, remarks: actionRemarks,
        });
      } else if (actionModal === 'bounce') {
        await supabase.from('check_vouchers').update({
          payment_status: 'bounced', updated_by: user?.id,
        }).eq('id', activeCv.id);
        const { data: links } = await supabase.from('cv_apv_links').select('ap_voucher_id').eq('check_voucher_id', activeCv.id);
        for (const l of (links || []) as any[]) {
          await supabase.from('ap_vouchers').update({ status: 'approved' }).eq('id', l.ap_voucher_id).eq('status', 'paid');
          await supabase.from('payment_schedule').update({ is_paid: false, check_voucher_id: null }).eq('ap_voucher_id', l.ap_voucher_id);
        }
        await supabase.from('payment_audit_logs').insert({
          reference_type: 'check_voucher', reference_id: activeCv.id, action: 'bounced',
          performed_by: user?.id, remarks: actionRemarks,
        });
      } else if (actionModal === 'void') {
        const { error } = await supabase.rpc('void_check_voucher', {
          p_cv_id: activeCv.id, p_user_id: user?.id, p_reason: actionRemarks,
        });
        if (error) throw error;
      }

      showToast('success', `Action recorded`);
      setActionModal(null);
      setActionRemarks('');
      await load();
      const refreshed = (await supabase.from('check_vouchers').select('*').eq('id', activeCv.id).maybeSingle()).data;
      if (refreshed) setActiveCv(refreshed as CV);
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!activeCv) return;
    try {
      const data: CvPdfData = {
        cv_number: activeCv.cv_number,
        payment_date: activeCv.payment_date,
        payee_name: activeCv.payee_name,
        payment_method: activeCv.payment_method,
        bank_name: activeCv.bank_name,
        bank_account_number: maskAccount(activeCv.bank_account_number),
        check_number: activeCv.check_number,
        check_date: activeCv.check_date,
        reference_number: activeCv.reference_number,
        total_amount: Number(activeCv.total_amount),
        remarks: activeCv.remarks,
        apvs: activeLinks,
      };
      const blob = await generateCvPdf(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${activeCv.cv_number}.pdf`; a.click();
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
              <Banknote size={24} className="text-cyan-700" />
              Check Vouchers
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Treasury payment processing — payee must be the registered vendor</p>
          </div>
          {isTreasury && (
            <button onClick={openApvPicker}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus size={16} /> New Check Voucher
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <SummaryCard label="Total CVs" value={summary.total} accent="text-slate-700" />
          <SummaryCard label="Pending" value={summary.pending} accent="text-blue-700" />
          <SummaryCard label="Approved" value={summary.approved} accent="text-emerald-700" />
          <SummaryCard label="Released" value={summary.released} accent="text-cyan-700" />
          <SummaryCard label="Total Amount" value={fmt(summary.totalAmount)} accent="text-orange-700" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search by CV, payee, reference..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
              <option value="all">All Statuses</option>
              {(Object.keys(STATUS_LABELS) as CVStatus[]).map((s) => (
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
              <Banknote size={32} className="mx-auto mb-2 text-slate-300" />
              <p>No check vouchers yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-medium">CV Number</th>
                    <th className="px-4 py-2 font-medium">Payee</th>
                    <th className="px-4 py-2 font-medium">Method</th>
                    <th className="px-4 py-2 font-medium text-right">Amount</th>
                    <th className="px-4 py-2 font-medium">Payment Date</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Payment</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(v)}>
                      <td className="px-4 py-2 font-medium text-slate-900">{v.cv_number}</td>
                      <td className="px-4 py-2 text-slate-700">{v.payee_name}</td>
                      <td className="px-4 py-2 text-slate-700 capitalize">{v.payment_method.replace('_', ' ')}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-900">{fmt(Number(v.total_amount))}</td>
                      <td className="px-4 py-2 text-slate-700">{v.payment_date || '-'}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[v.status]}`}>
                          {STATUS_LABELS[v.status]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600">{PAY_LABELS[v.payment_status]}</td>
                      <td className="px-4 py-2 text-slate-400"><ChevronRight size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showApvPicker && (
          <ApvPickerModal
            options={apvOptions}
            selected={selectedApvIds}
            onToggle={toggleApv}
            onClose={() => setShowApvPicker(false)}
            onConfirm={confirmApvSelection}
          />
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
            <h1 className="text-2xl font-semibold text-slate-900">New Check Voucher</h1>
            <p className="text-sm text-slate-500 mt-0.5">{selectedApvs.length} APV(s) selected • {selectedApvs[0]?.vendor_name}</p>
          </div>
          <button onClick={() => (onBack ? onBack() : setView('list'))} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
        </div>

        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert size={20} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-rose-900">
            <strong>Payment to CASH is strictly prohibited.</strong> The payee must be the registered vendor name.
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Payee Name (Vendor)">
              <input readOnly value={draft.payee_name || ''} className={READONLY} />
            </Field>
            <Field label="Total Amount">
              <input readOnly value={`PHP ${fmt(Number(draft.total_amount || 0))}`} className={READONLY} />
            </Field>
            <Field label="Payment Date *">
              <input type="date" value={(draft.payment_date as string) || ''}
                onChange={(e) => updateDraft({ payment_date: e.target.value })} className={INPUT} />
            </Field>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Payment Method</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(['check', 'bank_transfer', 'auto_debit', 'online_payment'] as PayMethod[]).map((m) => (
              <button key={m} onClick={() => updateDraft({ payment_method: m })}
                className={`px-3 py-2 border rounded-lg text-sm font-medium capitalize transition ${
                  draft.payment_method === m ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 hover:bg-slate-50'
                }`}>
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Bank Name *">
              <input type="text" value={draft.bank_name || ''}
                onChange={(e) => updateDraft({ bank_name: e.target.value })} className={INPUT} />
            </Field>
            {draft.payment_method === 'check' ? (
              <>
                <Field label="Check Number *">
                  <input type="text" value={draft.check_number || ''}
                    onChange={(e) => updateDraft({ check_number: e.target.value })} className={INPUT} />
                </Field>
                <Field label="Check Date *">
                  <input type="date" value={(draft.check_date as string) || ''}
                    onChange={(e) => updateDraft({ check_date: e.target.value })} className={INPUT} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Bank Account Number">
                  <input type="text" value={draft.bank_account_number || ''}
                    onChange={(e) => updateDraft({ bank_account_number: e.target.value })} className={INPUT} />
                </Field>
                <Field label={draft.payment_method === 'auto_debit' ? 'Bank Credit Memo Ref *' : 'Reference Number *'}>
                  <input type="text" value={draft.reference_number || ''}
                    onChange={(e) => updateDraft({ reference_number: e.target.value })} className={INPUT} />
                </Field>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-800">Applied AP Vouchers</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2 text-left">APV</th>
                <th className="px-4 py-2 text-left">Invoice</th>
                <th className="px-4 py-2 text-left">Due Date</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selectedApvs.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 font-medium text-slate-900">{a.apv_number}</td>
                  <td className="px-4 py-2 text-slate-700">{a.invoice_number}</td>
                  <td className="px-4 py-2 text-slate-700">{a.due_date || '-'}</td>
                  <td className="px-4 py-2 text-right font-medium">{fmt(Number(a.net_payable))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr>
                <td colSpan={3} className="px-4 py-2 font-semibold text-right">TOTAL</td>
                <td className="px-4 py-2 text-right font-bold text-blue-700">PHP {fmt(Number(draft.total_amount || 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <Field label="Remarks">
            <textarea rows={3} value={draft.remarks || ''}
              onChange={(e) => updateDraft({ remarks: e.target.value })} className={INPUT} />
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

  if (!activeCv) return null;
  return (
    <div className="space-y-4">
      <Toast toast={toast} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{activeCv.cv_number}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{activeCv.payee_name} • PHP {fmt(Number(activeCv.total_amount))}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadPdf}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
            <Download size={14} /> CV PDF
          </button>
          <button onClick={() => setView('list')} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
            Back
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[activeCv.status]}`}>
          {STATUS_LABELS[activeCv.status]}
        </span>
        <span className="text-xs text-slate-600">Payment: <span className="font-semibold">{PAY_LABELS[activeCv.payment_status]}</span></span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <DetailField label="Payment Method" value={activeCv.payment_method.replace('_', ' ').toUpperCase()} />
        <DetailField label="Payment Date" value={activeCv.payment_date || '-'} />
        <DetailField label="Bank" value={activeCv.bank_name} />
        {activeCv.payment_method === 'check' ? (
          <>
            <DetailField label="Check Number" value={activeCv.check_number || '-'} />
            <DetailField label="Check Date" value={activeCv.check_date || '-'} />
          </>
        ) : (
          <>
            <DetailField label="Reference Number" value={activeCv.reference_number || '-'} />
            <DetailField label="Account" value={maskAccount(activeCv.bank_account_number)} />
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">Applied AP Vouchers</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2 text-left">APV</th>
              <th className="px-4 py-2 text-left">Invoice</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activeLinks.map((l, i) => (
              <tr key={i}>
                <td className="px-4 py-2 font-medium text-slate-900">{l.apv_number}</td>
                <td className="px-4 py-2 text-slate-700">{l.invoice_number}</td>
                <td className="px-4 py-2 text-right">{fmt(l.net_payable)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td colSpan={2} className="px-4 py-2 font-semibold text-right">TOTAL</td>
              <td className="px-4 py-2 text-right font-bold text-blue-700">PHP {fmt(Number(activeCv.total_amount))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {activeCv.voided_reason && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-2">
          <AlertTriangle size={18} className="text-rose-600 flex-shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-rose-700">Voided</div>
            <p className="text-rose-900 mt-1">{activeCv.voided_reason}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {activeCv.status === 'pending_approval' && isApprover && (
          <>
            <button onClick={() => { setActionModal('reject'); setActionRemarks(''); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-rose-300 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-50">
              <XCircle size={14} /> Reject
            </button>
            <button onClick={() => { setActionModal('return'); setActionRemarks(''); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-amber-300 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-50">
              <RotateCcw size={14} /> Return
            </button>
            <button onClick={() => { setActionModal('approve'); setActionRemarks(''); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
              <CheckCircle2 size={14} /> Approve
            </button>
          </>
        )}
        {activeCv.status === 'approved' && isTreasury && (
          <button onClick={() => { setActionModal('release'); setActionRemarks(''); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
            Release Payment
          </button>
        )}
        {activeCv.status === 'released' && activeCv.payment_method === 'check' && isTreasury && (
          <>
            <button onClick={() => { setActionModal('clear'); setActionRemarks(''); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
              Mark Cleared
            </button>
            <button onClick={() => { setActionModal('bounce'); setActionRemarks(''); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-rose-300 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-50">
              Mark Bounced
            </button>
          </>
        )}
        {!['voided', 'cancelled', 'completed'].includes(activeCv.status) && isTreasury && (
          <button onClick={() => { setActionModal('void'); setActionRemarks(''); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-rose-300 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-50">
            Void
          </button>
        )}
      </div>

      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900 capitalize">{actionModal} CV</h3>
              <button onClick={() => setActionModal(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5">
              <Field label={`Remarks ${['return', 'reject', 'bounce', 'void'].includes(actionModal) ? '*' : ''}`}>
                <textarea value={actionRemarks} onChange={(e) => setActionRemarks(e.target.value)}
                  rows={4} className={INPUT} />
              </Field>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setActionModal(null)} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={performAction} disabled={saving}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
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

function ApvPickerModal({
  options, selected, onToggle, onClose, onConfirm,
}: {
  options: APVOption[]; selected: string[];
  onToggle: (id: string) => void; onClose: () => void; onConfirm: () => void;
}) {
  const [q, setQ] = useState('');
  const filtered = options.filter((o) => !q ||
    o.apv_number.toLowerCase().includes(q.toLowerCase()) ||
    o.vendor_name.toLowerCase().includes(q.toLowerCase())
  );
  const total = options.filter((o) => selected.includes(o.id)).reduce((s, o) => s + Number(o.net_payable || 0), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">Select Approved AP Vouchers</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search APV or vendor..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No approved APVs available</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="px-4 py-2 w-10"></th>
                  <th className="px-4 py-2 text-left">APV</th>
                  <th className="px-4 py-2 text-left">Vendor</th>
                  <th className="px-4 py-2 text-left">Invoice</th>
                  <th className="px-4 py-2 text-left">Due</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((o) => (
                  <tr key={o.id} onClick={() => onToggle(o.id)}
                    className={`cursor-pointer hover:bg-slate-50 ${selected.includes(o.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} />
                    </td>
                    <td className="px-4 py-2 font-medium text-slate-900">{o.apv_number}</td>
                    <td className="px-4 py-2 text-slate-700">{o.vendor_name}</td>
                    <td className="px-4 py-2 text-slate-700">{o.invoice_number}</td>
                    <td className="px-4 py-2 text-slate-700">{o.due_date || '-'}</td>
                    <td className="px-4 py-2 text-right">{fmt(Number(o.net_payable))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Selected: <span className="font-semibold">{selected.length}</span> • Total: <span className="font-semibold">PHP {fmt(total)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
            <button onClick={onConfirm} disabled={selected.length === 0}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
