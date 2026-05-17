import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Loader2, Send, Download, FileText, X, Trash2, Upload,
  Receipt, AlertTriangle, CheckCircle2, ChevronRight, Calendar, FileSpreadsheet,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { uploadAttachments, downloadAttachment } from '../../lib/storageHelper';
import { generateInvoiceMatchPdf } from '../../lib/invoiceMatchPdfGenerator';
import ExportModal from '../ExportModal';
import { FilterColumn, FilterValues } from '../FilterModal';
import { exportToStyledExcel } from '../../lib/excelExporter';

type InvoiceStatus = 'draft' | 'pending_matching' | 'matched' | 'exception' | 'posted' | 'cancelled';
type MatchStatus = 'matched' | 'mismatched' | 'pending_review' | 'resolved';

interface POOption {
  id: string;
  po_number: string;
  vendor_id: string | null;
  vendor_name: string;
  vendor_tin: string;
  payment_terms: string;
  company_id: string | null;
  status: string;
  total_amount: number;
}

interface POItemRow {
  id: string;
  item_description: string;
  unit_of_measure: string;
  quantity: number;
  unit_price: number;
}

interface InvoiceLine {
  id?: string;
  po_item_id: string;
  item_description: string;
  unit_of_measure: string;
  po_quantity: number;
  gr_accepted_quantity: number;
  previously_invoiced_quantity: number;
  invoiced_quantity: number;
  po_unit_price: number;
  invoiced_unit_price: number;
  invoiced_total_price: number;
  qty_match?: string;
  price_match?: string;
  qty_variance?: number;
  price_variance_amount?: number;
  price_variance_percentage?: number;
  item_match_status?: string;
}

interface Invoice {
  id: string;
  invoice_ref_number: string;
  purchase_order_id: string;
  po_number: string;
  vendor_id: string | null;
  vendor_name: string;
  vendor_tin: string;
  invoice_number: string;
  invoice_date: string | null;
  received_date: string | null;
  due_date: string | null;
  payment_terms: string;
  subtotal: number;
  vat_amount: number;
  ewt_amount: number;
  total_amount: number;
  net_payable: number;
  match_status: MatchStatus;
  match_score: number | null;
  status: InvoiceStatus;
  resolution_notes: string | null;
  created_at: string;
  company_id: string | null;
}

interface Attachment {
  id?: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  description: string;
}

interface ToastMsg { id: number; type: 'success' | 'error' | 'info'; text: string; }

const INPUT_CLS = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const READONLY_CLS = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-700';

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  pending_matching: 'bg-blue-100 text-blue-700 border-blue-200',
  matched: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  exception: 'bg-rose-100 text-rose-700 border-rose-200',
  posted: 'bg-emerald-700 text-white border-emerald-800',
  cancelled: 'bg-rose-700 text-white border-rose-800',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  pending_matching: 'Pending Matching',
  matched: 'Matched',
  exception: 'Exception',
  posted: 'Posted',
  cancelled: 'Cancelled',
};

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function MatchBadge({ status }: { status: MatchStatus }) {
  const styles: Record<MatchStatus, string> = {
    matched: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    mismatched: 'bg-rose-50 text-rose-700 border-rose-200',
    pending_review: 'bg-slate-50 text-slate-600 border-slate-200',
    resolved: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[status]}`}>
      {status === 'matched' ? 'Match' : status === 'mismatched' ? 'Mismatch' : status === 'resolved' ? 'Resolved' : 'Pending'}
    </span>
  );
}

function dueColor(dueDate: string | null): string {
  if (!dueDate) return 'text-slate-500';
  const days = Math.floor((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'text-rose-600 font-semibold';
  if (days <= 7) return 'text-orange-600 font-semibold';
  if (days <= 15) return 'text-amber-600';
  return 'text-emerald-600';
}

function termsToDays(terms: string): number {
  const m = String(terms || '').match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  if (/cod/i.test(terms || '')) return 0;
  return 30;
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function VendorInvoice() {
  const { user, profile } = useAuth();
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showPoPicker, setShowPoPicker] = useState(false);
  const [poOptions, setPoOptions] = useState<POOption[]>([]);
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [activeLines, setActiveLines] = useState<InvoiceLine[]>([]);
  const [activeAttachments, setActiveAttachments] = useState<Attachment[]>([]);
  const [draftPO, setDraftPO] = useState<POOption | null>(null);
  const [draftLines, setDraftLines] = useState<InvoiceLine[]>([]);
  const [draftHeader, setDraftHeader] = useState<Partial<Invoice>>({});
  const [draftFiles, setDraftFiles] = useState<{ file: File; description: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [overrideThreshold, setOverrideThreshold] = useState({ pct: 5, amt: 1000 });

  const showToast = (type: ToastMsg['type'], text: string) => {
    const id = Date.now();
    setToast({ id, type, text });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3500);
  };

  const role = String(profile?.role || '');
  const isAdmin = role === 'admin';
  const canResolve = ['admin', 'finance', 'accounting', 'treasury'].includes(role);
  const canPost = ['admin', 'finance', 'accounting'].includes(role);

  useEffect(() => {
    loadInvoices();
    loadOverrideThreshold();
  }, []);

  const loadOverrideThreshold = async () => {
    const { data } = await supabase
      .from('matching_tolerance_settings')
      .select('tolerance_percentage, tolerance_amount')
      .eq('tolerance_type', 'override_threshold')
      .eq('is_active', true)
      .maybeSingle();
    if (data) {
      setOverrideThreshold({
        pct: Number(data.tolerance_percentage || 5),
        amt: Number(data.tolerance_amount || 1000),
      });
    }
  };

  const loadInvoices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vendor_invoices')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      showToast('error', `Failed to load: ${error.message}`);
    } else {
      setInvoices((data || []) as Invoice[]);
    }
    setLoading(false);
  };

  const summary = useMemo(() => {
    const total = invoices.length;
    const matched = invoices.filter((i) => i.status === 'matched').length;
    const exceptions = invoices.filter((i) => i.status === 'exception').length;
    const posted = invoices.filter((i) => i.status === 'posted').length;
    const totalPayable = invoices
      .filter((i) => i.status !== 'cancelled')
      .reduce((sum, i) => sum + Number(i.net_payable || 0), 0);
    return { total, matched, exceptions, posted, totalPayable };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (!q) return true;
      return (
        i.invoice_ref_number.toLowerCase().includes(q) ||
        i.po_number.toLowerCase().includes(q) ||
        i.vendor_name.toLowerCase().includes(q) ||
        i.invoice_number.toLowerCase().includes(q)
      );
    });
  }, [invoices, search, statusFilter]);

  const invoiceExportColumns: FilterColumn[] = [
    { key: 'invoice_ref_number', label: 'Invoice Ref No.', type: 'text' },
    { key: 'po_number', label: 'PO No.', type: 'text' },
    { key: 'vendor_name', label: 'Vendor', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'draft', label: 'Draft' }, { value: 'submitted', label: 'Submitted' },
      { value: 'matched', label: 'Matched' }, { value: 'discrepancy', label: 'Discrepancy' },
      { value: 'resolved', label: 'Resolved' }, { value: 'cancelled', label: 'Cancelled' },
    ]},
  ];

  const handleExport = async (exportVals: FilterValues) => {
    setExporting(true);
    try {
      const from = exportVals.request_date_from;
      const to = exportVals.request_date_to;

      let query = supabase
        .from('vendor_invoices')
        .select('*')
        .gte('invoice_date', from)
        .lte('invoice_date', to + 'T23:59:59')
        .order('invoice_date', { ascending: false })
        .limit(10000);

      if (exportVals.status) query = query.eq('status', exportVals.status);

      const { data, error } = await query;
      if (error) throw error;

      let filtered = data || [];
      if (exportVals.invoice_ref_number) filtered = filtered.filter((i: any) => i.invoice_ref_number.toLowerCase().includes(exportVals.invoice_ref_number.toLowerCase()));
      if (exportVals.po_number) filtered = filtered.filter((i: any) => i.po_number.toLowerCase().includes(exportVals.po_number.toLowerCase()));
      if (exportVals.vendor_name) filtered = filtered.filter((i: any) => i.vendor_name.toLowerCase().includes(exportVals.vendor_name.toLowerCase()));

      const rows = filtered.map((i: any) => [
        i.invoice_ref_number || '',
        i.po_number || '',
        i.vendor_name || '',
        i.invoice_number || '',
        i.invoice_date ? new Date(i.invoice_date).toLocaleDateString('en-US') : '',
        i.due_date ? new Date(i.due_date).toLocaleDateString('en-US') : '',
        i.total_amount || 0,
        i.net_payable || 0,
        i.match_status || '',
        i.status || '',
      ]);
      exportToStyledExcel(rows, [
        { header: 'Invoice Ref No.', width: 18 },
        { header: 'PO No.', width: 18 },
        { header: 'Vendor', width: 25 },
        { header: 'Invoice No.', width: 16 },
        { header: 'Invoice Date', width: 14 },
        { header: 'Due Date', width: 14 },
        { header: 'Total Amount', width: 15, isAmount: true },
        { header: 'Net Payable', width: 15, isAmount: true },
        { header: 'Match Status', width: 14 },
        { header: 'Status', width: 14 },
      ], 'Vendor Invoices', `vendor_invoices_${new Date().toISOString().split('T')[0]}.xlsx`);
      setShowExportModal(false);
    } catch (error: any) {
      alert('Export failed: ' + (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const openPoPicker = async () => {
    setShowPoPicker(true);
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, po_number, vendor_id, vendor_name, vendor_tin, payment_terms, company_id, status, total_amount')
      .in('status', ['partially_received', 'fully_received'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      showToast('error', error.message);
      return;
    }
    setPoOptions((data || []) as POOption[]);
  };

  const startCreateFromPO = async (po: POOption) => {
    const { data: poItems } = await supabase
      .from('purchase_order_items')
      .select('id, item_description, unit_of_measure, quantity, unit_price')
      .eq('purchase_order_id', po.id)
      .order('created_at', { ascending: true });

    const { data: grItems } = await supabase
      .from('po_grn_items')
      .select(`po_item_id, accepted_quantity, po_grns!inner(status, purchase_order_id)`)
      .eq('po_grns.purchase_order_id', po.id);

    const accepted = new Map<string, number>();
    (grItems || []).forEach((row: any) => {
      if (row.po_grns?.status !== 'confirmed') return;
      accepted.set(row.po_item_id, (accepted.get(row.po_item_id) || 0) + Number(row.accepted_quantity || 0));
    });

    const { data: prevLines } = await supabase
      .from('vendor_invoice_items')
      .select(`po_item_id, invoiced_quantity, vendor_invoices!inner(status, purchase_order_id)`)
      .eq('vendor_invoices.purchase_order_id', po.id);

    const prevByItem = new Map<string, number>();
    (prevLines || []).forEach((row: any) => {
      if (!['matched', 'posted', 'exception', 'pending_matching'].includes(row.vendor_invoices?.status)) return;
      prevByItem.set(row.po_item_id, (prevByItem.get(row.po_item_id) || 0) + Number(row.invoiced_quantity || 0));
    });

    const lines: InvoiceLine[] = (poItems || []).map((it: POItemRow) => {
      const acceptedQty = accepted.get(it.id) || 0;
      const prevInv = prevByItem.get(it.id) || 0;
      const remaining = Math.max(0, acceptedQty - prevInv);
      return {
        po_item_id: it.id,
        item_description: it.item_description,
        unit_of_measure: it.unit_of_measure,
        po_quantity: Number(it.quantity || 0),
        gr_accepted_quantity: acceptedQty,
        previously_invoiced_quantity: prevInv,
        invoiced_quantity: remaining,
        po_unit_price: Number(it.unit_price || 0),
        invoiced_unit_price: Number(it.unit_price || 0),
        invoiced_total_price: remaining * Number(it.unit_price || 0),
      };
    });

    const today = new Date().toISOString().split('T')[0];
    const due = addDays(today, termsToDays(po.payment_terms));

    setDraftPO(po);
    setDraftLines(lines);
    setDraftHeader({
      vendor_id: po.vendor_id,
      vendor_name: po.vendor_name,
      vendor_tin: po.vendor_tin,
      po_number: po.po_number,
      payment_terms: po.payment_terms,
      invoice_date: today,
      received_date: today,
      due_date: due,
      company_id: po.company_id,
      invoice_number: '',
      ewt_amount: 0,
    });
    setDraftFiles([]);
    setShowPoPicker(false);
    setView('create');
  };

  const updateDraftLine = (idx: number, patch: Partial<InvoiceLine>) => {
    setDraftLines((prev) => {
      const next = [...prev];
      const merged: InvoiceLine = { ...next[idx], ...patch };
      merged.invoiced_total_price = Number(merged.invoiced_quantity || 0) * Number(merged.invoiced_unit_price || 0);
      next[idx] = merged;
      return next;
    });
  };

  const updateHeader = (patch: Partial<Invoice>) => {
    setDraftHeader((prev) => {
      const next = { ...prev, ...patch };
      if (patch.invoice_date && draftPO) {
        next.due_date = addDays(patch.invoice_date as string, termsToDays(draftPO.payment_terms));
      }
      return next;
    });
  };

  const totals = useMemo(() => {
    const subtotal = draftLines.reduce((s, l) => s + Number(l.invoiced_total_price || 0), 0);
    const vat = subtotal * 0.12;
    const ewt = Number(draftHeader.ewt_amount || 0);
    const total = subtotal + vat;
    const net = total - ewt;
    return { subtotal, vat, ewt, total, net };
  }, [draftLines, draftHeader.ewt_amount]);

  const onAddFiles = (files: FileList | null) => {
    if (!files) return;
    const accepted: { file: File; description: string }[] = [];
    Array.from(files).forEach((f) => {
      if (!ALLOWED_MIME.includes(f.type)) {
        showToast('error', `${f.name}: type not allowed`);
        return;
      }
      if (f.size > MAX_FILE_SIZE) {
        showToast('error', `${f.name}: exceeds 10MB`);
        return;
      }
      accepted.push({ file: f, description: 'Sales Invoice' });
    });
    setDraftFiles((prev) => [...prev, ...accepted]);
  };

  const removeDraftFile = (idx: number) => {
    setDraftFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const validateDraft = (forSubmit: boolean): string | null => {
    if (!draftPO) return 'Select a Purchase Order';
    if (!draftHeader.invoice_number) return 'Vendor invoice number is required';
    if (!draftHeader.invoice_date) return 'Invoice date is required';
    const today = new Date().toISOString().split('T')[0];
    if ((draftHeader.invoice_date as string) > today) return 'Invoice date cannot be in the future';
    if (!draftHeader.received_date) return 'Received date is required';
    if ((draftHeader.received_date as string) < (draftHeader.invoice_date as string)) {
      return 'Received date must be on or after invoice date';
    }
    for (let i = 0; i < draftLines.length; i++) {
      const l = draftLines[i];
      if (l.invoiced_quantity < 0 || l.invoiced_unit_price < 0) {
        return `Line ${i + 1}: negative values not allowed`;
      }
      const remaining = Math.max(0, l.gr_accepted_quantity - l.previously_invoiced_quantity);
      if (l.invoiced_quantity > remaining + 0.0001) {
        return `Line ${i + 1}: invoiced qty exceeds remaining (${remaining})`;
      }
    }
    if (forSubmit && draftFiles.length === 0) {
      return 'At least one supporting document is required to submit';
    }
    return null;
  };

  const saveInvoice = async (submit: boolean) => {
    const err = validateDraft(submit);
    if (err) { showToast('error', err); return; }
    setSaving(true);
    try {
      const { data: refData, error: refErr } = await supabase.rpc('generate_vendor_invoice_number', {
        p_company_id: draftPO!.company_id,
      });
      if (refErr) throw refErr;
      const refNumber = refData as string;

      const { data: created, error: insErr } = await supabase
        .from('vendor_invoices')
        .insert({
          invoice_ref_number: refNumber,
          purchase_order_id: draftPO!.id,
          po_number: draftPO!.po_number,
          company_id: draftPO!.company_id,
          vendor_id: draftPO!.vendor_id,
          vendor_name: draftHeader.vendor_name || '',
          vendor_tin: draftHeader.vendor_tin || '',
          invoice_number: draftHeader.invoice_number || '',
          invoice_date: draftHeader.invoice_date,
          received_date: draftHeader.received_date,
          due_date: draftHeader.due_date,
          payment_terms: draftHeader.payment_terms || '',
          subtotal: Number(totals.subtotal.toFixed(2)),
          vat_amount: Number(totals.vat.toFixed(2)),
          ewt_amount: Number(totals.ewt.toFixed(2)),
          total_amount: Number(totals.total.toFixed(2)),
          net_payable: Number(totals.net.toFixed(2)),
          status: submit ? 'pending_matching' : 'draft',
          created_by: user?.id,
          updated_by: user?.id,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      const lineRows = draftLines.map((l) => ({
        vendor_invoice_id: created!.id,
        po_item_id: l.po_item_id,
        item_description: l.item_description,
        unit_of_measure: l.unit_of_measure,
        po_quantity: l.po_quantity,
        gr_accepted_quantity: l.gr_accepted_quantity,
        previously_invoiced_quantity: l.previously_invoiced_quantity,
        invoiced_quantity: l.invoiced_quantity,
        po_unit_price: l.po_unit_price,
        invoiced_unit_price: l.invoiced_unit_price,
        invoiced_total_price: Number((l.invoiced_quantity * l.invoiced_unit_price).toFixed(2)),
      }));
      const { error: itemsErr } = await supabase.from('vendor_invoice_items').insert(lineRows);
      if (itemsErr) throw itemsErr;

      if (draftFiles.length > 0) {
        const uploads = await uploadAttachments(
          draftFiles.map((f) => ({ file: f.file, fileName: f.file.name })),
          'vendor-invoices',
          user!.id
        );
        const attRows = uploads.map((u, i) => ({
          vendor_invoice_id: created!.id,
          file_name: u.name,
          file_path: u.path,
          file_type: u.type,
          file_size: u.size,
          description: draftFiles[i]?.description || 'Sales Invoice',
          uploaded_by: user?.id,
        }));
        await supabase.from('vendor_invoice_attachments').insert(attRows);
      }

      await supabase.from('invoice_audit_logs').insert({
        vendor_invoice_id: created!.id,
        action: submit ? 'submitted' : 'created',
        performed_by: user?.id,
        new_values: { status: submit ? 'pending_matching' : 'draft' },
      });

      if (submit) {
        const { error: matchErr } = await supabase.rpc('compute_invoice_match', { p_invoice_id: created!.id });
        if (matchErr) throw matchErr;
        await supabase.from('invoice_audit_logs').insert({
          vendor_invoice_id: created!.id,
          action: 'matched',
          performed_by: user?.id,
        });
      }

      showToast('success', submit ? 'Submitted for matching' : 'Saved as draft');
      setView('list');
      await loadInvoices();
    } catch (e: any) {
      console.error(e);
      showToast('error', e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (inv: Invoice) => {
    setActiveInvoice(inv);
    const { data: lines } = await supabase
      .from('vendor_invoice_items')
      .select('*')
      .eq('vendor_invoice_id', inv.id)
      .order('created_at', { ascending: true });
    const { data: atts } = await supabase
      .from('vendor_invoice_attachments')
      .select('*')
      .eq('vendor_invoice_id', inv.id);
    setActiveLines((lines || []) as InvoiceLine[]);
    setActiveAttachments((atts || []) as Attachment[]);
    setResolutionNotes(inv.resolution_notes || '');
    setView('detail');
  };

  const computeRequiresOverride = (lines: InvoiceLine[]): boolean => {
    return lines.some((l) => {
      if (l.item_match_status !== 'mismatched') return false;
      const pct = Number(l.price_variance_percentage || 0);
      const amt = Math.abs(Number(l.price_variance_amount || 0)) * Number(l.invoiced_quantity || 0);
      return pct >= overrideThreshold.pct || amt >= overrideThreshold.amt;
    });
  };

  const resolveException = async () => {
    if (!activeInvoice) return;
    if (!resolutionNotes.trim()) { showToast('error', 'Resolution notes required'); return; }
    const requiresOverride = computeRequiresOverride(activeLines);
    if (requiresOverride && !canResolve) {
      showToast('error', 'This variance requires Finance Manager approval');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('vendor_invoices')
        .update({
          match_status: 'resolved',
          status: 'matched',
          resolution_notes: resolutionNotes,
          resolved_by: user?.id,
          resolved_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq('id', activeInvoice.id);
      if (error) throw error;
      await supabase.from('invoice_audit_logs').insert({
        vendor_invoice_id: activeInvoice.id,
        action: requiresOverride ? 'overridden' : 'resolved',
        performed_by: user?.id,
        remarks: resolutionNotes,
      });
      showToast('success', 'Resolved');
      setResolutionOpen(false);
      await loadInvoices();
      const refreshed = (await supabase.from('vendor_invoices').select('*').eq('id', activeInvoice.id).maybeSingle()).data;
      if (refreshed) setActiveInvoice(refreshed as Invoice);
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const postInvoice = async () => {
    if (!activeInvoice || !canPost) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('vendor_invoices')
        .update({ status: 'posted', posted_at: new Date().toISOString(), updated_by: user?.id })
        .eq('id', activeInvoice.id);
      if (error) throw error;
      await supabase.from('invoice_audit_logs').insert({
        vendor_invoice_id: activeInvoice.id,
        action: 'posted',
        performed_by: user?.id,
      });
      showToast('success', 'Invoice posted');
      await loadInvoices();
      setActiveInvoice({ ...activeInvoice, status: 'posted' });
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const cancelInvoice = async () => {
    if (!activeInvoice) return;
    if (!confirm('Cancel this invoice?')) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('vendor_invoices')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_by: user?.id })
        .eq('id', activeInvoice.id);
      if (error) throw error;
      await supabase.from('invoice_audit_logs').insert({
        vendor_invoice_id: activeInvoice.id,
        action: 'cancelled',
        performed_by: user?.id,
      });
      showToast('success', 'Cancelled');
      await loadInvoices();
      setView('list');
    } catch (e: any) {
      showToast('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const downloadAtt = async (att: Attachment) => {
    try {
      const blob = await downloadAttachment(att.file_path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = att.file_name; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast('error', e.message);
    }
  };

  const downloadReport = async () => {
    if (!activeInvoice) return;
    try {
      const blob = await generateInvoiceMatchPdf(activeInvoice as any, activeLines as any);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${activeInvoice.invoice_ref_number}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast('error', e.message);
    }
  };

  // ====================================================== RENDER ============
  if (view === 'list') {
    return (
      <div className="space-y-4">
        <Toast toast={toast} />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
              <Receipt size={24} className="text-blue-600" />
              Invoice Receipt & 3-Way Matching
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">AP invoice encoding, matching, and exception handling</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExportModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
            >
              <FileSpreadsheet size={16} /> Export to Excel
            </button>
            <button
              onClick={openPoPicker}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              <Plus size={16} /> New Invoice
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <SummaryCard label="Total Invoices" value={summary.total} accent="text-slate-700" />
          <SummaryCard label="Matched" value={summary.matched} accent="text-emerald-700" />
          <SummaryCard label="Exceptions" value={summary.exceptions} accent="text-rose-700" />
          <SummaryCard label="Posted" value={summary.posted} accent="text-emerald-800" />
          <SummaryCard
            label="Total Payable"
            value={summary.totalPayable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            accent="text-blue-700"
          />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by invoice ref, PO, vendor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | 'all')}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="pending_matching">Pending Matching</option>
              <option value="matched">Matched</option>
              <option value="exception">Exception</option>
              <option value="posted">Posted</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {loading ? (
            <div className="p-8 flex items-center justify-center text-slate-500">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Receipt size={32} className="mx-auto mb-2 text-slate-300" />
              <p>No invoices yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-medium">Invoice Ref</th>
                    <th className="px-4 py-2 font-medium">PO Number</th>
                    <th className="px-4 py-2 font-medium">Vendor</th>
                    <th className="px-4 py-2 font-medium text-right">Amount</th>
                    <th className="px-4 py-2 font-medium">Match</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Due Date</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => openDetail(inv)}
                    >
                      <td className="px-4 py-2 font-medium text-slate-900">{inv.invoice_ref_number}</td>
                      <td className="px-4 py-2 text-slate-700">{inv.po_number}</td>
                      <td className="px-4 py-2 text-slate-700">{inv.vendor_name}</td>
                      <td className="px-4 py-2 text-right text-slate-700">
                        {Number(inv.net_payable).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2"><MatchBadge status={inv.match_status} /></td>
                      <td className="px-4 py-2"><StatusBadge status={inv.status} /></td>
                      <td className={`px-4 py-2 text-sm ${dueColor(inv.due_date)}`}>
                        {inv.due_date || '-'}
                      </td>
                      <td className="px-4 py-2 text-slate-400">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showPoPicker && (
          <PoPickerModal
            options={poOptions}
            onClose={() => setShowPoPicker(false)}
            onSelect={startCreateFromPO}
          />
        )}
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="space-y-4">
        <Toast toast={toast} />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">New Vendor Invoice</h1>
            <p className="text-sm text-slate-500 mt-0.5">For PO {draftPO?.po_number}</p>
          </div>
          <button
            onClick={() => setView('list')}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="PO Number"><input type="text" value={draftHeader.po_number || ''} readOnly className={READONLY_CLS} /></Field>
            <Field label="Vendor"><input type="text" value={draftHeader.vendor_name || ''} readOnly className={READONLY_CLS} /></Field>
            <Field label="Vendor TIN"><input type="text" value={draftHeader.vendor_tin || ''} readOnly className={READONLY_CLS} /></Field>
            <Field label="Vendor Invoice Number *">
              <input
                type="text"
                value={draftHeader.invoice_number || ''}
                onChange={(e) => updateHeader({ invoice_number: e.target.value })}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Invoice Date *">
              <input
                type="date"
                value={(draftHeader.invoice_date as string) || ''}
                onChange={(e) => updateHeader({ invoice_date: e.target.value })}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Received Date *">
              <input
                type="date"
                value={(draftHeader.received_date as string) || ''}
                onChange={(e) => updateHeader({ received_date: e.target.value })}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Payment Terms"><input type="text" value={draftHeader.payment_terms || ''} readOnly className={READONLY_CLS} /></Field>
            <Field label="Due Date"><input type="text" value={(draftHeader.due_date as string) || ''} readOnly className={READONLY_CLS} /></Field>
            <Field label="EWT Amount">
              <input
                type="number"
                step="0.01"
                value={Number(draftHeader.ewt_amount || 0)}
                onChange={(e) => updateHeader({ ewt_amount: parseFloat(e.target.value) || 0 })}
                className={INPUT_CLS}
              />
            </Field>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Line Items</h2>
            <p className="text-xs text-slate-500">PO ordered vs GR accepted vs Invoiced</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">PO Qty</th>
                  <th className="px-3 py-2 text-right font-medium">GR Accepted</th>
                  <th className="px-3 py-2 text-right font-medium">Prev. Inv.</th>
                  <th className="px-3 py-2 text-right font-medium">Remaining</th>
                  <th className="px-3 py-2 text-right font-medium">Inv. Qty *</th>
                  <th className="px-3 py-2 text-right font-medium">PO Price</th>
                  <th className="px-3 py-2 text-right font-medium">Inv. Price *</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {draftLines.map((l, i) => {
                  const remaining = Math.max(0, l.gr_accepted_quantity - l.previously_invoiced_quantity);
                  return (
                    <tr key={l.po_item_id}>
                      <td className="px-3 py-2 text-slate-800">
                        <div className="font-medium">{l.item_description}</div>
                        <div className="text-xs text-slate-500">{l.unit_of_measure}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{l.po_quantity.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{l.gr_accepted_quantity.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{l.previously_invoiced_quantity.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium text-emerald-700">{remaining.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          max={remaining}
                          value={l.invoiced_quantity}
                          onChange={(e) => updateDraftLine(i, { invoiced_quantity: parseFloat(e.target.value) || 0 })}
                          className="w-24 px-2 py-1 border border-slate-300 rounded text-right text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{l.po_unit_price.toFixed(4)}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={l.invoiced_unit_price}
                          onChange={(e) => updateDraftLine(i, { invoiced_unit_price: parseFloat(e.target.value) || 0 })}
                          className="w-24 px-2 py-1 border border-slate-300 rounded text-right text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">
                        {Number(l.invoiced_total_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Upload size={16} /> Supporting Documents
            </h2>
            <input
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={(e) => onAddFiles(e.target.files)}
              className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="text-xs text-slate-500 mt-1">JPG, PNG, PDF up to 10MB. Required to submit.</p>
            {draftFiles.length > 0 && (
              <ul className="mt-3 space-y-2">
                {draftFiles.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                    <FileText size={16} className="text-slate-500 flex-shrink-0" />
                    <span className="text-sm text-slate-700 truncate flex-1">{f.file.name}</span>
                    <select
                      value={f.description}
                      onChange={(e) => {
                        const next = [...draftFiles];
                        next[i] = { ...next[i], description: e.target.value };
                        setDraftFiles(next);
                      }}
                      className="text-xs px-2 py-1 border border-slate-300 rounded"
                    >
                      <option>Sales Invoice</option>
                      <option>Official Receipt</option>
                      <option>BIR Form 2307</option>
                      <option>Delivery Receipt</option>
                      <option>Other</option>
                    </select>
                    <button onClick={() => removeDraftFile(i)} className="text-rose-500 hover:text-rose-700">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Totals</h2>
            <div className="space-y-2 text-sm">
              <Row label="Subtotal" value={totals.subtotal} />
              <Row label="VAT (12%)" value={totals.vat} />
              <Row label="EWT" value={totals.ewt} />
              <div className="border-t border-slate-200 pt-2">
                <Row label="Total" value={totals.total} bold />
                <Row label="Net Payable" value={totals.net} bold accent="text-blue-700" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => saveInvoice(false)}
            disabled={saving}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            onClick={() => saveInvoice(true)}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Submit for Matching
          </button>
        </div>
      </div>
    );
  }

  // DETAIL VIEW
  if (!activeInvoice) return null;

  return (
    <div className="space-y-4">
      <Toast toast={toast} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{activeInvoice.invoice_ref_number}</h1>
          <p className="text-sm text-slate-500 mt-0.5">PO {activeInvoice.po_number} • {activeInvoice.vendor_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadReport}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
          >
            <Download size={14} /> Verification Report
          </button>
          <button
            onClick={() => setView('list')}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Back
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={activeInvoice.status} />
        <MatchBadge status={activeInvoice.match_status} />
        {activeInvoice.match_score != null && (
          <span className="text-xs text-slate-600">
            Match Score: <span className="font-semibold">{Number(activeInvoice.match_score).toFixed(1)}%</span>
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <DetailField label="Vendor Invoice No." value={activeInvoice.invoice_number} />
        <DetailField label="Invoice Date" value={activeInvoice.invoice_date || '-'} />
        <DetailField label="Received Date" value={activeInvoice.received_date || '-'} />
        <DetailField label="Payment Terms" value={activeInvoice.payment_terms} />
        <DetailField label="Due Date" value={activeInvoice.due_date || '-'} />
        <DetailField label="Vendor TIN" value={activeInvoice.vendor_tin} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">3-Way Match Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">PO Qty</th>
                <th className="px-3 py-2 text-right font-medium">GR Qty</th>
                <th className="px-3 py-2 text-right font-medium">Inv. Qty</th>
                <th className="px-3 py-2 text-right font-medium">PO Price</th>
                <th className="px-3 py-2 text-right font-medium">Inv. Price</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-center font-medium">Qty</th>
                <th className="px-3 py-2 text-center font-medium">Price</th>
                <th className="px-3 py-2 text-center font-medium">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeLines.map((l) => (
                <tr key={l.id || l.po_item_id}>
                  <td className="px-3 py-2 text-slate-800">
                    <div className="font-medium">{l.item_description}</div>
                    <div className="text-xs text-slate-500">{l.unit_of_measure}</div>
                  </td>
                  <td className="px-3 py-2 text-right">{Number(l.po_quantity).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(l.gr_accepted_quantity).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-medium">{Number(l.invoiced_quantity).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(l.po_unit_price).toFixed(4)}</td>
                  <td className="px-3 py-2 text-right font-medium">{Number(l.invoiced_unit_price).toFixed(4)}</td>
                  <td className="px-3 py-2 text-right">{Number(l.invoiced_total_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-center"><FlagPill flag={l.qty_match} /></td>
                  <td className="px-3 py-2 text-center"><FlagPill flag={l.price_match} /></td>
                  <td className="px-3 py-2 text-center">
                    {l.item_match_status === 'matched' ? (
                      <CheckCircle2 size={16} className="text-emerald-600 inline" />
                    ) : (
                      <AlertTriangle size={16} className="text-rose-600 inline" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Totals</h2>
          <div className="space-y-2 text-sm">
            <Row label="Subtotal" value={Number(activeInvoice.subtotal)} />
            <Row label="VAT" value={Number(activeInvoice.vat_amount)} />
            <Row label="EWT" value={Number(activeInvoice.ewt_amount)} />
            <div className="border-t border-slate-200 pt-2">
              <Row label="Total" value={Number(activeInvoice.total_amount)} bold />
              <Row label="Net Payable" value={Number(activeInvoice.net_payable)} bold accent="text-blue-700" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Attachments</h2>
          {activeAttachments.length === 0 ? (
            <p className="text-sm text-slate-500">No attachments</p>
          ) : (
            <ul className="space-y-2">
              {activeAttachments.map((att) => (
                <li key={att.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                  <FileText size={16} className="text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800 truncate">{att.file_name}</div>
                    <div className="text-xs text-slate-500">{att.description}</div>
                  </div>
                  <button onClick={() => downloadAtt(att)} className="text-blue-600 hover:text-blue-800">
                    <Download size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {activeInvoice.resolution_notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-amber-700 mb-1">Resolution Notes</div>
          <p className="text-sm text-amber-900">{activeInvoice.resolution_notes}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {activeInvoice.status === 'exception' && canResolve && (
          <button
            onClick={() => setResolutionOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
          >
            Resolve Exception
          </button>
        )}
        {activeInvoice.status === 'matched' && canPost && (
          <button
            onClick={postInvoice}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            Post Invoice
          </button>
        )}
        {!['posted', 'cancelled'].includes(activeInvoice.status) && (canResolve || isAdmin) && (
          <button
            onClick={cancelInvoice}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 border border-rose-300 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-50 disabled:opacity-50"
          >
            Cancel Invoice
          </button>
        )}
      </div>

      {resolutionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">Resolve Exception</h3>
              <button onClick={() => setResolutionOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {computeRequiresOverride(activeLines) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  Variance exceeds threshold ({overrideThreshold.pct}% or PHP {overrideThreshold.amt}). Finance Manager approval is recorded with this resolution.
                </div>
              )}
              <Field label="Resolution Notes *">
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={4}
                  className={INPUT_CLS}
                  placeholder="Justification, agreed adjustments, vendor confirmation..."
                />
              </Field>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setResolutionOpen(false)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={resolveException}
                disabled={saving}
                className="px-4 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ExportModal
        isOpen={showExportModal}
        onClose={() => { setShowExportModal(false); setExporting(false); }}
        columns={invoiceExportColumns}
        onExport={handleExport}
        exporting={exporting}
      />
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

function Row({ label, value, bold = false, accent = '' }: { label: string; value: number; bold?: boolean; accent?: string }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-semibold' : ''} ${accent}`}>
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-900">
        {Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

function FlagPill({ flag }: { flag?: string }) {
  if (!flag) return <span className="text-xs text-slate-400">-</span>;
  const styles: Record<string, string> = {
    match: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    over: 'bg-rose-50 text-rose-700 border-rose-200',
    under: 'bg-amber-50 text-amber-700 border-amber-200',
    mismatch: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium border rounded ${styles[flag] || styles.match}`}>
      {flag.toUpperCase()}
    </span>
  );
}

function PoPickerModal({
  options, onClose, onSelect,
}: { options: POOption[]; onClose: () => void; onSelect: (po: POOption) => void }) {
  const [q, setQ] = useState('');
  const filtered = options.filter((p) =>
    !q || p.po_number.toLowerCase().includes(q.toLowerCase()) || p.vendor_name.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">Select Purchase Order</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search PO or vendor..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No eligible POs found</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((po) => (
                <li
                  key={po.id}
                  onClick={() => onSelect(po)}
                  className="px-5 py-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-slate-900">{po.po_number}</div>
                    <div className="text-xs text-slate-500">{po.vendor_name} • {po.payment_terms}</div>
                  </div>
                  <div className="text-sm text-slate-700">
                    {Number(po.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
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
