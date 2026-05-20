import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Send,
  Download,
  FileText,
  X,
  Trash2,
  Upload,
  ChevronRight,
  Package,
  FileSpreadsheet,
  Lock,
  Pencil,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission, MODULE_PERMISSIONS } from '../../lib/permissions';
import { uploadAttachments, downloadAttachment } from '../../lib/storageHelper';
import { generateGRNPdf } from '../../lib/grPdfGenerator';
import ExportModal from '../ExportModal';
import { FilterColumn, FilterValues } from '../FilterModal';
import { exportToStyledExcel } from '../../lib/excelExporter';

type GRStatus = 'draft' | 'confirmed' | 'cancelled';
type ReceiptType = 'full' | 'partial';
type Condition = 'good' | 'damaged' | 'defective' | 'wrong_item' | 'short_delivery';
type OverallCondition = 'good' | 'damaged' | 'mixed';

interface POOption {
  id: string;
  po_number: string;
  vendor_id: string | null;
  vendor_name: string;
  company_id: string | null;
  status: string;
  total_amount: number;
}

interface POItem {
  id: string;
  item_description: string;
  unit_of_measure: string;
  quantity: number;
}

interface GR {
  id: string;
  gr_number: string;
  purchase_order_id: string;
  po_number: string;
  vendor_id: string;
  vendor_name: string;
  company_id: string | null;
  received_by: string | null;
  inspected_by: string | null;
  receipt_date: string;
  delivery_receipt_number: string;
  receipt_type: ReceiptType;
  overall_condition: OverallCondition;
  warehouse_location: string;
  remarks: string;
  status: GRStatus;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
  locked_at: string | null;
  locked_by: string | null;
}

interface GRItem {
  id?: string;
  po_grn_id?: string;
  po_item_id: string;
  item_description: string;
  unit_of_measure: string;
  ordered_quantity: number;
  previously_received_quantity: number;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  rejection_reason: string;
  condition: Condition;
  remarks: string;
}

interface GRAttachment {
  id?: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  description: string;
}

interface UserOption {
  id: string;
  full_name: string;
  email: string;
}

interface ToastMsg {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

const INPUT_CLS = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const READONLY_CLS = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-700';

const STATUS_STYLES: Record<GRStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
};

const STATUS_LABELS: Record<GRStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

const CONDITION_LABELS: Record<Condition, string> = {
  good: 'Good',
  damaged: 'Damaged',
  defective: 'Defective',
  wrong_item: 'Wrong Item',
  short_delivery: 'Short Delivery',
};

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function StatusBadge({ status }: { status: GRStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function GoodsReceipt() {
  const { user, profile, permissions } = useAuth();
  const [view, setView] = useState<'list' | 'create' | 'detail' | 'edit'>('list');
  const [grs, setGrs] = useState<GR[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<GRStatus | 'all'>('all');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showPoPicker, setShowPoPicker] = useState(false);
  const [poOptions, setPoOptions] = useState<POOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [activeGR, setActiveGR] = useState<GR | null>(null);
  const [activeItems, setActiveItems] = useState<GRItem[]>([]);
  const [activeAttachments, setActiveAttachments] = useState<GRAttachment[]>([]);
  const [draftPO, setDraftPO] = useState<POOption | null>(null);
  const [draftItems, setDraftItems] = useState<GRItem[]>([]);
  const [draftHeader, setDraftHeader] = useState<Partial<GR>>({});
  const [draftFiles, setDraftFiles] = useState<{ file: File; description: string }[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<GRAttachment[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [showLockConfirm, setShowLockConfirm] = useState(false);

  const showToast = (type: ToastMsg['type'], text: string) => {
    const id = Date.now();
    setToast({ id, type, text });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3500);
  };

  const canCreate = hasPermission(permissions, MODULE_PERMISSIONS.GOODS_RECEIPT_CREATE);
  const canEdit = hasPermission(permissions, MODULE_PERMISSIONS.GOODS_RECEIPT_EDIT);
  const canLock = hasPermission(permissions, MODULE_PERMISSIONS.GOODS_RECEIPT_LOCK);
  const canCancel = hasPermission(permissions, MODULE_PERMISSIONS.GOODS_RECEIPT_CANCEL);
  const canConfirm = hasPermission(permissions, MODULE_PERMISSIONS.GOODS_RECEIPT_CONFIRM);

  useEffect(() => {
    loadGRs();
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name');
    setUsers((data || []) as UserOption[]);
  };

  const loadGRs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('po_grns')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      showToast('error', `Failed to load GRs: ${error.message}`);
    } else {
      setGrs((data || []) as GR[]);
    }
    setLoading(false);
  };

  const filteredGRs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return grs.filter((g) => {
      if (statusFilter !== 'all' && g.status !== statusFilter) return false;
      if (!q) return true;
      return (
        g.gr_number.toLowerCase().includes(q) ||
        g.po_number.toLowerCase().includes(q) ||
        g.vendor_name.toLowerCase().includes(q)
      );
    });
  }, [grs, search, statusFilter]);

  const grExportColumns: FilterColumn[] = [
    { key: 'gr_number', label: 'GR No.', type: 'text' },
    { key: 'po_number', label: 'PO No.', type: 'text' },
    { key: 'vendor_name', label: 'Vendor', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'draft', label: 'Draft' }, { value: 'confirmed', label: 'Confirmed' },
      { value: 'cancelled', label: 'Cancelled' },
    ]},
  ];

  const handleExport = async (exportVals: FilterValues) => {
    setExporting(true);
    try {
      const from = exportVals.request_date_from;
      const to = exportVals.request_date_to;

      const allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('po_grns')
          .select('*')
          .gte('receipt_date', from)
          .lte('receipt_date', to)
          .is('deleted_at', null)
          .order('receipt_date', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (exportVals.status) query = query.eq('status', exportVals.status);

        const { data, error } = await query;
        if (error) throw error;

        allData.push(...(data || []));
        hasMore = (data?.length || 0) === pageSize;
        page++;
      }

      let filtered = allData;
      if (exportVals.gr_number) filtered = filtered.filter((g: any) => g.gr_number.toLowerCase().includes(exportVals.gr_number.toLowerCase()));
      if (exportVals.po_number) filtered = filtered.filter((g: any) => g.po_number.toLowerCase().includes(exportVals.po_number.toLowerCase()));
      if (exportVals.vendor_name) filtered = filtered.filter((g: any) => g.vendor_name.toLowerCase().includes(exportVals.vendor_name.toLowerCase()));

      const rows = filtered.map((g: any) => [
        g.gr_number || '',
        g.po_number || '',
        g.vendor_name || '',
        g.receipt_date ? new Date(g.receipt_date).toLocaleDateString('en-US') : '',
        g.receipt_type || '',
        g.overall_condition || '',
        g.warehouse_location || '',
        g.status || '',
      ]);
      exportToStyledExcel(rows, [
        { header: 'GR No.', width: 18 },
        { header: 'PO No.', width: 18 },
        { header: 'Vendor', width: 25 },
        { header: 'Receipt Date', width: 14 },
        { header: 'Receipt Type', width: 16 },
        { header: 'Condition', width: 14 },
        { header: 'Warehouse', width: 18 },
        { header: 'Status', width: 14 },
      ], 'Goods Receipts', `goods_receipts_${new Date().toISOString().split('T')[0]}.xlsx`);
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
      .select('id, po_number, vendor_id, vendor_name, company_id, status, total_amount')
      .in('status', ['dispatched', 'partially_received'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      showToast('error', error.message);
      return;
    }
    setPoOptions((data || []) as POOption[]);
  };

  const startCreate = async (po: POOption) => {
    const { data: poItems, error: itemErr } = await supabase
      .from('purchase_order_items')
      .select('id, item_description, unit_of_measure, quantity')
      .eq('purchase_order_id', po.id);
    if (itemErr) {
      showToast('error', itemErr.message);
      return;
    }
    const items = (poItems || []) as POItem[];
    const ids = items.map((i) => i.id);

    let prevByItem = new Map<string, number>();
    if (ids.length > 0) {
      const { data: prev } = await supabase
        .from('po_grn_items')
        .select('po_item_id, accepted_quantity, po_grn_id')
        .in('po_item_id', ids);
      const grnIds = Array.from(new Set((prev || []).map((p: any) => p.po_grn_id)));
      let confirmedSet = new Set<string>();
      if (grnIds.length > 0) {
        const { data: grnRows } = await supabase
          .from('po_grns')
          .select('id, status')
          .in('id', grnIds);
        confirmedSet = new Set((grnRows || []).filter((g: any) => g.status === 'confirmed').map((g: any) => g.id));
      }
      (prev || []).forEach((row: any) => {
        if (!confirmedSet.has(row.po_grn_id)) return;
        const cur = prevByItem.get(row.po_item_id) || 0;
        prevByItem.set(row.po_item_id, cur + Number(row.accepted_quantity || 0));
      });
    }

    const grItems: GRItem[] = items.map((it) => {
      const prevQty = prevByItem.get(it.id) || 0;
      return {
        po_item_id: it.id,
        item_description: it.item_description,
        unit_of_measure: it.unit_of_measure,
        ordered_quantity: Math.floor(Number(it.quantity) || 0),
        previously_received_quantity: prevQty,
        received_quantity: 0,
        accepted_quantity: 0,
        rejected_quantity: 0,
        rejection_reason: '',
        condition: 'good',
        remarks: '',
      };
    });

    setDraftPO(po);
    setDraftItems(grItems);
    setDraftHeader({
      receipt_date: new Date().toISOString().slice(0, 10),
      delivery_receipt_number: '',
      inspected_by: null,
      warehouse_location: '',
      overall_condition: 'good',
      remarks: '',
    });
    setDraftFiles([]);
    setExistingAttachments([]);
    setRemovedAttachmentIds([]);
    setShowPoPicker(false);
    setView('create');
  };

  const startEdit = () => {
    if (!activeGR) return;
    setDraftPO({
      id: activeGR.purchase_order_id,
      po_number: activeGR.po_number,
      vendor_id: activeGR.vendor_id,
      vendor_name: activeGR.vendor_name,
      company_id: activeGR.company_id,
      status: '',
      total_amount: 0,
    });
    setDraftHeader({
      receipt_date: activeGR.receipt_date,
      delivery_receipt_number: activeGR.delivery_receipt_number,
      inspected_by: activeGR.inspected_by,
      warehouse_location: activeGR.warehouse_location,
      overall_condition: activeGR.overall_condition,
      remarks: activeGR.remarks,
    });
    setDraftItems(activeItems.map((it) => ({ ...it })));
    setDraftFiles([]);
    setExistingAttachments([...activeAttachments]);
    setRemovedAttachmentIds([]);
    setView('edit');
  };

  const updateItem = (idx: number, patch: Partial<GRItem>) => {
    setDraftItems((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch };
      const remaining = merged.ordered_quantity - merged.previously_received_quantity;
      merged.received_quantity = Math.max(0, Math.min(Math.floor(merged.received_quantity || 0), remaining));
      merged.accepted_quantity = Math.max(0, Math.min(Math.floor(merged.accepted_quantity || 0), merged.received_quantity));
      merged.rejected_quantity = merged.received_quantity - merged.accepted_quantity;
      next[idx] = merged;
      return next;
    });
  };

  const computedReceiptType = useMemo<ReceiptType>(() => {
    if (draftItems.length === 0) return 'partial';
    return draftItems.every(
      (it) => it.previously_received_quantity + it.accepted_quantity >= it.ordered_quantity
    )
      ? 'full'
      : 'partial';
  }, [draftItems]);

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    const next: { file: File; description: string }[] = [];
    Array.from(files).forEach((f) => {
      if (!ALLOWED_MIME.includes(f.type)) {
        showToast('error', `${f.name}: only JPG/PNG/PDF allowed`);
        return;
      }
      if (f.size > MAX_FILE_SIZE) {
        showToast('error', `${f.name}: exceeds 10MB`);
        return;
      }
      next.push({ file: f, description: '' });
    });
    setDraftFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (idx: number) => {
    setDraftFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeExistingAttachment = (att: GRAttachment) => {
    if (att.id) {
      setRemovedAttachmentIds((prev) => [...prev, att.id!]);
    }
    setExistingAttachments((prev) => prev.filter((a) => a.id !== att.id));
  };

  const validateForSave = (confirming: boolean): string | null => {
    if (!draftPO) return 'No PO selected';
    if (!draftHeader.receipt_date) return 'Receipt date is required';
    const today = new Date().toISOString().slice(0, 10);
    if ((draftHeader.receipt_date || '') > today) return 'Receipt date cannot be in the future';
    if (confirming && !draftHeader.delivery_receipt_number?.trim()) {
      return 'Delivery Receipt Number is required to confirm';
    }
    if (!draftItems.some((i) => i.received_quantity > 0)) {
      return 'At least one item must have received quantity > 0';
    }
    for (const it of draftItems) {
      const remaining = it.ordered_quantity - it.previously_received_quantity;
      if (it.received_quantity > remaining) {
        return `${it.item_description}: received exceeds remaining (${remaining})`;
      }
      if (it.accepted_quantity > it.received_quantity) {
        return `${it.item_description}: accepted exceeds received`;
      }
      if (it.rejected_quantity > 0 && !it.rejection_reason.trim()) {
        return `${it.item_description}: rejection reason required`;
      }
    }
    return null;
  };

  const saveOrConfirm = async (confirming: boolean) => {
    if (!draftPO || !user) return;
    const err = validateForSave(confirming);
    if (err) {
      showToast('error', err);
      return;
    }
    setSaving(true);
    try {
      const grStatus: GRStatus = confirming ? 'confirmed' : 'draft';

      const { data: grJson, error: rpcErr } = await supabase.rpc('insert_po_grn_atomic', {
        p_company_id: draftPO.company_id || null,
        p_purchase_order_id: draftPO.id,
        p_po_number: draftPO.po_number || '',
        p_vendor_id: draftPO.vendor_id || '',
        p_vendor_name: draftPO.vendor_name || '',
        p_received_by: user.id,
        p_inspected_by: draftHeader.inspected_by || null,
        p_receipt_date: draftHeader.receipt_date || new Date().toISOString().split('T')[0],
        p_delivery_receipt_number: draftHeader.delivery_receipt_number || '',
        p_receipt_type: computedReceiptType,
        p_overall_condition: draftHeader.overall_condition || 'good',
        p_warehouse_location: draftHeader.warehouse_location || '',
        p_remarks: draftHeader.remarks || '',
        p_status: grStatus,
        p_confirmed_at: confirming ? new Date().toISOString() : null,
        p_created_by: user.id,
      });
      if (rpcErr) throw rpcErr;
      const newGR = grJson as GR;
      const grNumber = newGR.gr_number;

      const itemRows = draftItems.map((it) => ({
        po_grn_id: newGR.id,
        po_item_id: it.po_item_id,
        item_description: it.item_description,
        unit_of_measure: it.unit_of_measure,
        ordered_quantity: it.ordered_quantity,
        previously_received_quantity: it.previously_received_quantity,
        received_quantity: it.received_quantity,
        accepted_quantity: it.accepted_quantity,
        rejected_quantity: it.rejected_quantity,
        rejection_reason: it.rejection_reason,
        condition: it.condition,
        remarks: it.remarks,
      }));
      const { error: itemErr } = await supabase.from('po_grn_items').insert(itemRows);
      if (itemErr) throw itemErr;

      if (draftFiles.length > 0) {
        const uploads = await uploadAttachments(
          draftFiles.map((f) => ({ file: f.file, fileName: f.file.name })),
          `po-grns/${newGR.id}`,
          user.id
        );
        const attachmentRows = uploads.map((u, i) => ({
          po_grn_id: newGR.id,
          file_name: u.name,
          file_path: u.path,
          file_type: u.type,
          file_size: u.size,
          uploaded_by: user.id,
          description: draftFiles[i]?.description || '',
        }));
        await supabase.from('po_grn_attachments').insert(attachmentRows);
      }

      await supabase.from('po_grn_audit_logs').insert([
        {
          po_grn_id: newGR.id,
          action: confirming ? 'confirmed' : 'created',
          performed_by: user.id,
          remarks: confirming ? 'Confirmed receipt' : 'Saved as draft',
        },
      ]);

      if (confirming) {
        await supabase.rpc('recompute_po_receipt_status', { p_po_id: draftPO.id });
      }

      showToast('success', `GR ${grNumber} ${confirming ? 'confirmed' : 'saved'}.`);
      setView('list');
      setDraftPO(null);
      setDraftItems([]);
      setDraftHeader({});
      setDraftFiles([]);
      loadGRs();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save GR');
    } finally {
      setSaving(false);
    }
  };

  const updateGR = async (confirming: boolean) => {
    if (!activeGR || !user) return;
    const err = validateForSave(confirming);
    if (err) {
      showToast('error', err);
      return;
    }
    setSaving(true);
    try {
      const updatePayload: any = {
        receipt_date: draftHeader.receipt_date || activeGR.receipt_date,
        delivery_receipt_number: draftHeader.delivery_receipt_number || '',
        inspected_by: draftHeader.inspected_by || null,
        warehouse_location: draftHeader.warehouse_location || '',
        overall_condition: draftHeader.overall_condition || 'good',
        remarks: draftHeader.remarks || '',
        receipt_type: computedReceiptType,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };

      if (confirming && activeGR.status === 'draft') {
        updatePayload.status = 'confirmed';
        updatePayload.confirmed_at = new Date().toISOString();
      }

      const { error: updateErr } = await supabase
        .from('po_grns')
        .update(updatePayload)
        .eq('id', activeGR.id);
      if (updateErr) throw updateErr;

      await supabase.from('po_grn_items').delete().eq('po_grn_id', activeGR.id);
      const itemRows = draftItems.map((it) => ({
        po_grn_id: activeGR.id,
        po_item_id: it.po_item_id,
        item_description: it.item_description,
        unit_of_measure: it.unit_of_measure,
        ordered_quantity: it.ordered_quantity,
        previously_received_quantity: it.previously_received_quantity,
        received_quantity: it.received_quantity,
        accepted_quantity: it.accepted_quantity,
        rejected_quantity: it.rejected_quantity,
        rejection_reason: it.rejection_reason,
        condition: it.condition,
        remarks: it.remarks,
      }));
      const { error: itemErr } = await supabase.from('po_grn_items').insert(itemRows);
      if (itemErr) throw itemErr;

      if (removedAttachmentIds.length > 0) {
        await supabase.from('po_grn_attachments').delete().in('id', removedAttachmentIds);
      }

      if (draftFiles.length > 0) {
        const uploads = await uploadAttachments(
          draftFiles.map((f) => ({ file: f.file, fileName: f.file.name })),
          `po-grns/${activeGR.id}`,
          user.id
        );
        const attachmentRows = uploads.map((u, i) => ({
          po_grn_id: activeGR.id,
          file_name: u.name,
          file_path: u.path,
          file_type: u.type,
          file_size: u.size,
          uploaded_by: user.id,
          description: draftFiles[i]?.description || '',
        }));
        await supabase.from('po_grn_attachments').insert(attachmentRows);
      }

      const auditAction = confirming && activeGR.status === 'draft' ? 'confirmed' : 'edited';
      await supabase.from('po_grn_audit_logs').insert([
        {
          po_grn_id: activeGR.id,
          action: auditAction,
          performed_by: user.id,
          remarks: confirming && activeGR.status === 'draft' ? 'Confirmed receipt (edited)' : 'Edited receipt',
        },
      ]);

      if (confirming && activeGR.status === 'draft') {
        await supabase.rpc('recompute_po_receipt_status', { p_po_id: activeGR.purchase_order_id });
      } else if (activeGR.status === 'confirmed') {
        await supabase.rpc('recompute_po_receipt_status', { p_po_id: activeGR.purchase_order_id });
      }

      showToast('success', `GR ${activeGR.gr_number} updated.`);
      setView('list');
      setDraftPO(null);
      setDraftItems([]);
      setDraftHeader({});
      setDraftFiles([]);
      setExistingAttachments([]);
      setRemovedAttachmentIds([]);
      loadGRs();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to update GR');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (gr: GR) => {
    setActiveGR(gr);
    const [{ data: items }, { data: atts }] = await Promise.all([
      supabase.from('po_grn_items').select('*').eq('po_grn_id', gr.id),
      supabase.from('po_grn_attachments').select('*').eq('po_grn_id', gr.id),
    ]);
    setActiveItems((items || []) as GRItem[]);
    setActiveAttachments((atts || []) as GRAttachment[]);
    setView('detail');
  };

  const cancelGR = async () => {
    if (!activeGR || !user) return;
    const reason = prompt('Cancellation reason:');
    if (!reason) return;
    setSaving(true);
    try {
      await supabase
        .from('po_grns')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
          updated_by: user.id,
        })
        .eq('id', activeGR.id);
      await supabase.from('po_grn_audit_logs').insert([
        {
          po_grn_id: activeGR.id,
          action: 'cancelled',
          performed_by: user.id,
          remarks: reason,
        },
      ]);
      await supabase.rpc('recompute_po_receipt_status', { p_po_id: activeGR.purchase_order_id });
      showToast('success', 'GR cancelled.');
      setView('list');
      loadGRs();
    } finally {
      setSaving(false);
    }
  };

  const lockGR = async () => {
    if (!activeGR || !user) return;
    setShowLockConfirm(false);
    setSaving(true);
    try {
      const { error } = await supabase.rpc('lock_po_grn', {
        p_grn_id: activeGR.id,
        p_locked_by: user.id,
      });
      if (error) throw error;
      showToast('success', `GR ${activeGR.gr_number} locked.`);
      setView('list');
      loadGRs();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to lock GR');
    } finally {
      setSaving(false);
    }
  };

  const downloadAttachment_ = async (att: GRAttachment) => {
    try {
      const blob = await downloadAttachment(att.file_path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showToast('error', err.message || 'Download failed');
    }
  };

  const downloadGRNPdf = async (gr: GR) => {
    const [{ data: items }, { data: poRow }] = await Promise.all([
      supabase.from('po_grn_items').select('*').eq('po_grn_id', gr.id),
      supabase
        .from('purchase_orders')
        .select('vendor_address, vendor_contact, vendor_email, vendor_tin, department, expected_delivery_date')
        .eq('id', gr.purchase_order_id)
        .maybeSingle(),
    ]);
    const blob = await generateGRNPdf(gr, (items || []) as GRItem[], poRow || {});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${gr.gr_number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-[100]">
          <div
            className={`px-4 py-3 rounded-lg shadow-lg border flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : toast.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 size={18} />
            ) : toast.type === 'error' ? (
              <AlertTriangle size={18} />
            ) : (
              <FileText size={18} />
            )}
            <span className="text-sm font-medium">{toast.text}</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Goods Receipt</h1>
            <p className="text-sm text-slate-500">Record deliveries against dispatched purchase orders</p>
          </div>
          <div className="flex items-center gap-2">
            {view !== 'list' && (
              <button
                onClick={() => setView('list')}
                className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Back to list
              </button>
            )}
            {view === 'list' && (
              <button
                onClick={() => setShowExportModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
              >
                <FileSpreadsheet size={16} />
                Export to Excel
              </button>
            )}
            {view === 'list' && canCreate && (
              <button
                onClick={openPoPicker}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
              >
                <Plus size={16} />
                New Goods Receipt
              </button>
            )}
          </div>
        </div>

        {view === 'list' && (
          <ListView
            grs={filteredGRs}
            loading={loading}
            search={search}
            onSearch={setSearch}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            onOpen={openDetail}
            onDownload={downloadGRNPdf}
          />
        )}

        {view === 'create' && draftPO && (
          <CreateView
            po={draftPO}
            header={draftHeader}
            items={draftItems}
            files={draftFiles}
            users={users}
            receiptType={computedReceiptType}
            onHeaderChange={(k, v) => setDraftHeader((p) => ({ ...p, [k]: v }))}
            onItemChange={updateItem}
            onPickFiles={onPickFiles}
            onRemoveFile={removeFile}
            onFileDescChange={(idx, desc) =>
              setDraftFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, description: desc } : f)))
            }
            onSave={() => saveOrConfirm(false)}
            onConfirm={() => saveOrConfirm(true)}
            saving={saving}
          />
        )}

        {view === 'edit' && activeGR && draftPO && (
          <EditView
            gr={activeGR}
            po={draftPO}
            header={draftHeader}
            items={draftItems}
            newFiles={draftFiles}
            existingAttachments={existingAttachments}
            users={users}
            receiptType={computedReceiptType}
            canConfirm={canConfirm && activeGR.status === 'draft'}
            onHeaderChange={(k, v) => setDraftHeader((p) => ({ ...p, [k]: v }))}
            onItemChange={updateItem}
            onPickFiles={onPickFiles}
            onRemoveNewFile={removeFile}
            onRemoveExistingAttachment={removeExistingAttachment}
            onFileDescChange={(idx, desc) =>
              setDraftFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, description: desc } : f)))
            }
            onSave={() => updateGR(false)}
            onConfirm={() => updateGR(true)}
            saving={saving}
          />
        )}

        {view === 'detail' && activeGR && (
          <DetailView
            gr={activeGR}
            items={activeItems}
            attachments={activeAttachments}
            users={users}
            canEdit={canEdit && activeGR.status !== 'cancelled' && !activeGR.locked_at}
            canCancel={canCancel && activeGR.status !== 'cancelled' && !activeGR.locked_at}
            canLock={canLock && activeGR.status === 'confirmed' && !activeGR.locked_at}
            onEdit={startEdit}
            onCancel={cancelGR}
            onLock={() => setShowLockConfirm(true)}
            onDownloadPdf={() => downloadGRNPdf(activeGR)}
            onDownloadAtt={downloadAttachment_}
          />
        )}
      </div>

      {showPoPicker && (
        <Modal title="Select Dispatched Purchase Order" onClose={() => setShowPoPicker(false)}>
          {poOptions.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              <Package size={36} className="mx-auto mb-3 text-slate-300" />
              No dispatched POs available for receiving.
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {poOptions.map((po) => (
                <button
                  key={po.id}
                  onClick={() => startCreate(po)}
                  className="w-full text-left px-4 py-3 border border-slate-200 hover:border-blue-400 hover:bg-blue-50 rounded-lg flex items-center justify-between transition"
                >
                  <div>
                    <div className="font-semibold text-slate-900 text-sm">{po.po_number}</div>
                    <div className="text-xs text-slate-500">
                      {po.vendor_name} ·{' '}
                      <span className="capitalize">{po.status.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {showLockConfirm && (
        <Modal title="Lock Goods Receipt" onClose={() => setShowLockConfirm(false)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">This action is irreversible</p>
                <p className="text-sm text-amber-700 mt-1">
                  Once locked, this Goods Receipt cannot be edited or cancelled. Only proceed if all details are final.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowLockConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={lockGR}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                Lock Receipt
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ExportModal
        isOpen={showExportModal}
        onClose={() => { setShowExportModal(false); setExporting(false); }}
        columns={grExportColumns}
        onExport={handleExport}
        exporting={exporting}
      />
    </div>
  );
}

function ListView({
  grs,
  loading,
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  onOpen,
  onDownload,
}: {
  grs: GR[];
  loading: boolean;
  search: string;
  onSearch: (s: string) => void;
  statusFilter: GRStatus | 'all';
  onStatusFilter: (s: GRStatus | 'all') => void;
  onOpen: (g: GR) => void;
  onDownload: (g: GR) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex-1 min-w-[220px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search GR / PO / vendor..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilter(e.target.value as GRStatus | 'all')}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm">
          <Loader2 className="animate-spin inline mr-2" size={16} /> Loading...
        </div>
      ) : grs.length === 0 ? (
        <div className="py-16 text-center text-slate-500 text-sm">
          <Package className="mx-auto mb-3 text-slate-300" size={36} />
          No goods receipts yet.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="px-3 py-2">GR Number</th>
                <th className="px-3 py-2">PO Number</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Receipt Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grs.map((g) => (
                <tr key={g.id} onClick={() => onOpen(g)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <span className="inline-flex items-center gap-1.5">
                      {g.gr_number}
                      {g.locked_at && <Lock size={12} className="text-amber-500" />}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{g.po_number}</td>
                  <td className="px-3 py-2 text-slate-700">{g.vendor_name}</td>
                  <td className="px-3 py-2 text-slate-600">{g.receipt_date}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200 capitalize">
                      {g.receipt_type}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={g.status} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDownload(g);
                      }}
                      className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-xs"
                    >
                      <Download size={14} /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateView({
  po,
  header,
  items,
  files,
  users,
  receiptType,
  onHeaderChange,
  onItemChange,
  onPickFiles,
  onRemoveFile,
  onFileDescChange,
  onSave,
  onConfirm,
  saving,
}: {
  po: POOption;
  header: Partial<GR>;
  items: GRItem[];
  files: { file: File; description: string }[];
  users: UserOption[];
  receiptType: ReceiptType;
  onHeaderChange: (k: keyof GR, v: any) => void;
  onItemChange: (idx: number, patch: Partial<GRItem>) => void;
  onPickFiles: (files: FileList | null) => void;
  onRemoveFile: (idx: number) => void;
  onFileDescChange: (idx: number, desc: string) => void;
  onSave: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Receiving against</p>
          <p className="text-sm font-medium text-blue-900">
            {po.po_number} · {po.vendor_name}
          </p>
        </div>
        <span
          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
            receiptType === 'full'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          {receiptType} receipt
        </span>
      </div>

      <ReceiptForm
        header={header}
        items={items}
        files={files}
        existingAttachments={[]}
        users={users}
        receiptType={receiptType}
        onHeaderChange={onHeaderChange}
        onItemChange={onItemChange}
        onPickFiles={onPickFiles}
        onRemoveFile={onRemoveFile}
        onRemoveExistingAttachment={() => {}}
        onFileDescChange={onFileDescChange}
      />

      <div className="flex justify-end gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          Save as Draft
        </button>
        <button
          onClick={onConfirm}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Confirm Receipt
        </button>
      </div>
    </div>
  );
}

function EditView({
  gr,
  po,
  header,
  items,
  newFiles,
  existingAttachments,
  users,
  receiptType,
  canConfirm,
  onHeaderChange,
  onItemChange,
  onPickFiles,
  onRemoveNewFile,
  onRemoveExistingAttachment,
  onFileDescChange,
  onSave,
  onConfirm,
  saving,
}: {
  gr: GR;
  po: POOption;
  header: Partial<GR>;
  items: GRItem[];
  newFiles: { file: File; description: string }[];
  existingAttachments: GRAttachment[];
  users: UserOption[];
  receiptType: ReceiptType;
  canConfirm: boolean;
  onHeaderChange: (k: keyof GR, v: any) => void;
  onItemChange: (idx: number, patch: Partial<GRItem>) => void;
  onPickFiles: (files: FileList | null) => void;
  onRemoveNewFile: (idx: number) => void;
  onRemoveExistingAttachment: (att: GRAttachment) => void;
  onFileDescChange: (idx: number, desc: string) => void;
  onSave: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Editing</p>
          <p className="text-sm font-medium text-amber-900">
            {gr.gr_number} · {po.po_number} · {po.vendor_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={gr.status} />
          <span
            className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
              receiptType === 'full'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {receiptType} receipt
          </span>
        </div>
      </div>

      <ReceiptForm
        header={header}
        items={items}
        files={newFiles}
        existingAttachments={existingAttachments}
        users={users}
        receiptType={receiptType}
        onHeaderChange={onHeaderChange}
        onItemChange={onItemChange}
        onPickFiles={onPickFiles}
        onRemoveFile={onRemoveNewFile}
        onRemoveExistingAttachment={onRemoveExistingAttachment}
        onFileDescChange={onFileDescChange}
      />

      <div className="flex justify-end gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          Save Changes
        </button>
        {canConfirm && (
          <button
            onClick={onConfirm}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Confirm Receipt
          </button>
        )}
      </div>
    </div>
  );
}

function ReceiptForm({
  header,
  items,
  files,
  existingAttachments,
  users,
  receiptType,
  onHeaderChange,
  onItemChange,
  onPickFiles,
  onRemoveFile,
  onRemoveExistingAttachment,
  onFileDescChange,
}: {
  header: Partial<GR>;
  items: GRItem[];
  files: { file: File; description: string }[];
  existingAttachments: GRAttachment[];
  users: UserOption[];
  receiptType: ReceiptType;
  onHeaderChange: (k: keyof GR, v: any) => void;
  onItemChange: (idx: number, patch: Partial<GRItem>) => void;
  onPickFiles: (files: FileList | null) => void;
  onRemoveFile: (idx: number) => void;
  onRemoveExistingAttachment: (att: GRAttachment) => void;
  onFileDescChange: (idx: number, desc: string) => void;
}) {
  return (
    <>
      <Section title="Receipt Details">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Receipt Date *">
            <input
              type="date"
              value={header.receipt_date || ''}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => onHeaderChange('receipt_date', e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Delivery Receipt # *">
            <input
              value={header.delivery_receipt_number || ''}
              onChange={(e) => onHeaderChange('delivery_receipt_number', e.target.value)}
              className={INPUT_CLS}
              placeholder="Vendor DR / SI number"
            />
          </Field>
          <Field label="Inspected By">
            <select
              value={header.inspected_by || ''}
              onChange={(e) => onHeaderChange('inspected_by', e.target.value || null)}
              className={INPUT_CLS}
            >
              <option value="">— Select inspector —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Warehouse Location">
            <input
              value={header.warehouse_location || ''}
              onChange={(e) => onHeaderChange('warehouse_location', e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Overall Condition">
            <select
              value={header.overall_condition || 'good'}
              onChange={(e) => onHeaderChange('overall_condition', e.target.value)}
              className={INPUT_CLS}
            >
              <option value="good">Good</option>
              <option value="damaged">Damaged</option>
              <option value="mixed">Mixed</option>
            </select>
          </Field>
          <Field label="Receipt Type (auto)">
            <input value={receiptType.toUpperCase()} readOnly className={READONLY_CLS} />
          </Field>
        </div>
        <Field label="Remarks">
          <textarea
            rows={2}
            value={header.remarks || ''}
            onChange={(e) => onHeaderChange('remarks', e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
      </Section>

      <Section title="Items">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">UOM</th>
                <th className="px-2 py-2 text-right">Ordered</th>
                <th className="px-2 py-2 text-right">Prev. Recv</th>
                <th className="px-2 py-2 text-right">Remaining</th>
                <th className="px-2 py-2 text-right">Received</th>
                <th className="px-2 py-2 text-right">Accepted</th>
                <th className="px-2 py-2 text-right">Rejected</th>
                <th className="px-2 py-2">Condition</th>
                <th className="px-2 py-2">Rejection Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it, idx) => {
                const remaining = it.ordered_quantity - it.previously_received_quantity;
                return (
                  <tr key={idx} className="align-top">
                    <td className="px-2 py-2 text-slate-900">{it.item_description}</td>
                    <td className="px-2 py-2 text-slate-700">{it.unit_of_measure}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{it.ordered_quantity}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{it.previously_received_quantity}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold">{remaining}</td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={remaining}
                        step={1}
                        value={it.received_quantity}
                        onChange={(e) =>
                          onItemChange(idx, { received_quantity: parseInt(e.target.value || '0', 10) })
                        }
                        className="w-20 px-2 py-1 border border-slate-300 rounded text-right text-sm"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={it.received_quantity}
                        step={1}
                        value={it.accepted_quantity}
                        onChange={(e) =>
                          onItemChange(idx, { accepted_quantity: parseInt(e.target.value || '0', 10) })
                        }
                        className="w-20 px-2 py-1 border border-slate-300 rounded text-right text-sm"
                      />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-red-600 font-medium">
                      {it.rejected_quantity}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={it.condition}
                        onChange={(e) => onItemChange(idx, { condition: e.target.value as Condition })}
                        className="px-2 py-1 border border-slate-300 rounded text-sm"
                      >
                        {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={it.rejection_reason}
                        onChange={(e) => onItemChange(idx, { rejection_reason: e.target.value })}
                        disabled={it.rejected_quantity === 0}
                        placeholder={it.rejected_quantity > 0 ? 'Required' : '—'}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs disabled:bg-slate-50"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Attachments (Delivery Receipt, Photos, Inspection Report)">
        {existingAttachments.length > 0 && (
          <div className="space-y-2 mb-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Existing Files</p>
            {existingAttachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
                <FileText size={16} className="text-slate-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{a.file_name}</div>
                  <div className="text-xs text-slate-500">{a.description || a.file_type}</div>
                </div>
                <button
                  onClick={() => onRemoveExistingAttachment(a)}
                  className="text-red-600 hover:text-red-800"
                  title="Remove"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 text-sm text-slate-600">
          <Upload size={18} />
          <span>Click or drop JPG / PNG / PDF (max 10MB each)</span>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
        </label>
        {files.length > 0 && (
          <div className="mt-3 space-y-2">
            {files.map((f, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2">
                <FileText size={16} className="text-slate-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{f.file.name}</div>
                  <div className="text-xs text-slate-500">{(f.file.size / 1024).toFixed(1)} KB</div>
                </div>
                <input
                  placeholder="Description (e.g. Delivery Receipt)"
                  value={f.description}
                  onChange={(e) => onFileDescChange(idx, e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded text-xs flex-1"
                />
                <button
                  onClick={() => onRemoveFile(idx)}
                  className="text-red-600 hover:text-red-800"
                  title="Remove"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function DetailView({
  gr,
  items,
  attachments,
  users,
  canEdit,
  canCancel,
  canLock,
  onEdit,
  onCancel,
  onLock,
  onDownloadPdf,
  onDownloadAtt,
}: {
  gr: GR;
  items: GRItem[];
  attachments: GRAttachment[];
  users: UserOption[];
  canEdit: boolean;
  canCancel: boolean;
  canLock: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onLock: () => void;
  onDownloadPdf: () => void;
  onDownloadAtt: (att: GRAttachment) => void;
}) {
  const lockedByUser = users.find((u) => u.id === gr.locked_by);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{gr.gr_number}</h2>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={gr.status} />
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200 capitalize">
              {gr.receipt_type}
            </span>
            {gr.locked_at && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
                <Lock size={10} /> Locked
              </span>
            )}
          </div>
          {gr.locked_at && (
            <p className="text-xs text-slate-500 mt-1">
              Locked on {new Date(gr.locked_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              {lockedByUser ? ` by ${lockedByUser.full_name}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDownloadPdf}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            <Download size={16} /> Download PDF
          </button>
          {canEdit && (
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
            >
              <Pencil size={16} /> Edit
            </button>
          )}
          {canLock && (
            <button
              onClick={onLock}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg"
            >
              <Lock size={16} /> Lock
            </button>
          )}
          {canCancel && (
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg"
            >
              <Trash2 size={16} /> Cancel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Header">
          <KV label="PO Number" value={gr.po_number} />
          <KV label="Vendor" value={gr.vendor_name} />
          <KV label="Receipt Date" value={gr.receipt_date} />
          <KV label="DR Number" value={gr.delivery_receipt_number || '—'} />
          <KV label="Warehouse" value={gr.warehouse_location || '—'} />
          <KV label="Overall Condition" value={gr.overall_condition} />
          <KV label="Remarks" value={gr.remarks || '—'} />
        </Section>
        <Section title="Attachments">
          {attachments.length === 0 ? (
            <p className="text-sm text-slate-500">No attachments.</p>
          ) : (
            <ul className="space-y-2">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg"
                >
                  <FileText size={16} className="text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.file_name}</div>
                    <div className="text-xs text-slate-500">{a.description || a.file_type}</div>
                  </div>
                  <button
                    onClick={() => onDownloadAtt(a)}
                    className="text-blue-600 hover:text-blue-800 text-xs"
                  >
                    <Download size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Items">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">UOM</th>
                <th className="px-3 py-2 text-right">Ordered</th>
                <th className="px-3 py-2 text-right">Prev Recv</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2 text-right">Accepted</th>
                <th className="px-3 py-2 text-right">Rejected</th>
                <th className="px-3 py-2">Condition</th>
                <th className="px-3 py-2">Rejection Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it, idx) => (
                <tr key={it.id || idx}>
                  <td className="px-3 py-2 text-slate-900">{it.item_description}</td>
                  <td className="px-3 py-2 text-slate-700">{it.unit_of_measure}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.ordered_quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.previously_received_quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.received_quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{it.accepted_quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600">{it.rejected_quantity}</td>
                  <td className="px-3 py-2 capitalize">{CONDITION_LABELS[it.condition] || it.condition}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{it.rejection_reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
      <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
      {children}
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

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between text-sm gap-3 py-1 border-b border-slate-100 last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 text-right capitalize">{value}</span>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
