import { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  FileText,
  CheckCircle2,
  X,
  Send,
  Download,
  Mail,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Trash2,
  FileSpreadsheet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { generatePurchaseOrderPdf } from '../../lib/poPdfGenerator';
import { generateAndUploadPOMergedPdf } from '../../lib/poMergedPdfGenerator';
import { getApprovalFlow, createApprovalLedgerEntry, sendApprovalEmailToAll } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import ExportModal from '../ExportModal';
import FilterModal, { FilterColumn, FilterValues, applyFilters, getActiveFilterCount } from '../FilterModal';
import { exportToStyledExcel } from '../../lib/excelExporter';
import Pagination from '../Pagination';

type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'returned'
  | 'rejected'
  | 'dispatched'
  | 'partially_received'
  | 'fully_received'
  | 'closed'
  | 'cancelled';

interface POItem {
  id?: string;
  item_description: string;
  unit_of_measure: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  ewt_amount: number;
  pr_item_id: string;
  remarks: string;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  canvass_request_id: string | null;
  pr_id: string | null;
  vendor_id: string | null;
  vendor_name: string;
  vendor_address: string;
  vendor_contact: string;
  vendor_email: string;
  vendor_tin: string;
  vendor_bank_account: string;
  vendor_bank_name: string;
  vendor_bank_address: string;
  company_id: string | null;
  company_name: string;
  department: string;
  requested_by: string | null;
  prepared_by: string | null;
  po_date: string;
  expected_delivery_date: string | null;
  delivery_address: string;
  payment_terms: string;
  payment_terms_custom: string;
  delivery_terms: string;
  remarks: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  budget_status: 'within_budget' | 'over_budget' | 'no_budget';
  status: POStatus;
  current_approver_id: string | null;
  current_approval_level: number;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string;
  dispatched_at: string | null;
  pdf_path: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface CanvassRow {
  id: string;
  canvass_number: string;
  pr_id: string | null;
  total_amount: number;
  department: string | null;
  company_id: string | null;
  requester_id: string | null;
  recommended_quotation_index: number | null;
  suppliers: any;
  items: any;
  companies?: { name: string } | null;
}

interface ToastMsg {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

const STATUS_STYLES: Record<POStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  pending_approval: 'bg-orange-100 text-orange-700 border-orange-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  returned: 'bg-blue-100 text-blue-700 border-blue-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  dispatched: 'bg-teal-100 text-teal-800 border-teal-200',
  partially_received: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  fully_received: 'bg-green-200 text-green-900 border-green-300',
  closed: 'bg-emerald-700 text-white border-emerald-800',
  cancelled: 'bg-rose-700 text-white border-rose-800',
};

const STATUS_LABELS: Record<POStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  returned: 'Returned',
  rejected: 'Rejected',
  dispatched: 'Dispatched',
  partially_received: 'Partially Received',
  fully_received: 'Fully Received',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const PAYMENT_TERMS = ['Net 15', 'Net 30', 'Net 60', 'COD', '50% Down / 50% Delivery', 'Custom'];

const INPUT_CLS = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const READONLY_CLS = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 text-slate-700';

function fmtMoney(n: number): string {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: POStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function BudgetBadge({ status }: { status: PurchaseOrder['budget_status'] }) {
  const map: Record<PurchaseOrder['budget_status'], { cls: string; label: string }> = {
    within_budget: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Within Budget' },
    over_budget: { cls: 'bg-red-50 text-red-700 border-red-200', label: 'Over Budget' },
    no_budget: { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'No Budget Allocated' },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function PurchaseOrder() {
  const { user, profile } = useAuth();
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('po_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [activeOrder, setActiveOrder] = useState<PurchaseOrder | null>(null);
  const [activeItems, setActiveItems] = useState<POItem[]>([]);
  const [showCanvassPicker, setShowCanvassPicker] = useState(false);
  const [availableCanvasses, setAvailableCanvasses] = useState<CanvassRow[]>([]);
  const [draftCanvass, setDraftCanvass] = useState<CanvassRow | null>(null);
  const [draftPO, setDraftPO] = useState<Partial<PurchaseOrder>>({});
  const [draftItems, setDraftItems] = useState<POItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [trackerKey, setTrackerKey] = useState(0);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchEmail, setDispatchEmail] = useState('');
  const [draftPONumber, setDraftPONumber] = useState('');

  const showToast = (type: ToastMsg['type'], text: string) => {
    const id = Date.now();
    setToast({ id, type, text });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3500);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, companies ( name )')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      showToast('error', `Failed to load POs: ${error.message}`);
    } else {
      const mapped = (data || []).map((row: any) => ({
        ...row,
        company_name: row.companies?.name || '',
      }));
      setOrders(mapped as PurchaseOrder[]);
    }
    setLoading(false);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown size={14} className="opacity-40" />;
    }
    return sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  const poFilterColumns: FilterColumn[] = [
    { key: 'po_number', label: 'PO No.', type: 'text' },
    { key: 'vendor_name', label: 'Vendor', type: 'text' },
    { key: 'department', label: 'Department', type: 'text' },
    { key: 'po_date', label: 'PO Date', type: 'dateRange' },
    { key: 'total_amount', label: 'Amount', type: 'number' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'draft', label: 'Draft' }, { value: 'pending_approval', label: 'Pending' },
      { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' },
      { value: 'dispatched', label: 'Dispatched' }, { value: 'partially_received', label: 'Partially Received' },
      { value: 'fully_received', label: 'Fully Received' }, { value: 'closed', label: 'Closed' },
    ]},
  ];

  const poExportColumns: FilterColumn[] = [
    { key: 'po_number', label: 'PO No.', type: 'text' },
    { key: 'vendor_name', label: 'Vendor', type: 'text' },
    { key: 'department', label: 'Department', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'draft', label: 'Draft' }, { value: 'pending_approval', label: 'Pending' },
      { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' },
      { value: 'dispatched', label: 'Dispatched' }, { value: 'partially_received', label: 'Partially Received' },
      { value: 'fully_received', label: 'Fully Received' }, { value: 'closed', label: 'Closed' },
    ]},
  ];

  const poGetFieldValue = (item: any, key: string) => {
    return item[key] ?? '';
  };

  const filteredOrders = applyFilters(
    orders.filter((o) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        o.po_number.toLowerCase().includes(term) ||
        o.vendor_name.toLowerCase().includes(term) ||
        o.department.toLowerCase().includes(term) ||
        o.status.toLowerCase().includes(term) ||
        String(o.total_amount).includes(term)
      );
    }),
    filterValues,
    poFilterColumns,
    poGetFieldValue
  );

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    let aVal: any = a[sortColumn as keyof PurchaseOrder];
    let bVal: any = b[sortColumn as keyof PurchaseOrder];

    if (aVal == null) aVal = '';
    if (bVal == null) bVal = '';

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = sortedOrders.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => setCurrentPage(page);
  const handleItemsPerPageChange = (n: number) => { setItemsPerPage(n); setCurrentPage(1); };

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
          .from('purchase_orders')
          .select('*')
          .gte('po_date', from + 'T00:00:00')
          .lte('po_date', to + 'T23:59:59')
          .is('deleted_at', null)
          .order('po_date', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (exportVals.status) query = query.eq('status', exportVals.status);

        const { data, error } = await query;
        if (error) throw error;

        allData.push(...(data || []));
        hasMore = (data?.length || 0) === pageSize;
        page++;
      }

      let filtered = allData;
      if (exportVals.po_number) filtered = filtered.filter((o: any) => o.po_number.toLowerCase().includes(exportVals.po_number.toLowerCase()));
      if (exportVals.vendor_name) filtered = filtered.filter((o: any) => o.vendor_name.toLowerCase().includes(exportVals.vendor_name.toLowerCase()));
      if (exportVals.department) filtered = filtered.filter((o: any) => o.department.toLowerCase().includes(exportVals.department.toLowerCase()));

      const rows = filtered.map((o: any) => [
        o.po_number || '',
        o.vendor_name || '',
        o.department || '',
        o.po_date ? new Date(o.po_date).toLocaleDateString('en-US') : '',
        o.delivery_date ? new Date(o.delivery_date).toLocaleDateString('en-US') : '',
        o.total_amount || 0,
        o.status || '',
      ]);
      exportToStyledExcel(rows, [
        { header: 'PO No.', width: 18 },
        { header: 'Vendor', width: 25 },
        { header: 'Department', width: 16 },
        { header: 'PO Date', width: 14 },
        { header: 'Delivery Date', width: 14 },
        { header: 'Total Amount', width: 15, isAmount: true },
        { header: 'Status', width: 18 },
      ], 'Purchase Orders', `purchase_orders_${new Date().toISOString().split('T')[0]}.xlsx`);
      setShowExportModal(false);
    } catch (error: any) {
      alert('Export failed: ' + (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const openCanvassPicker = async () => {
    setShowCanvassPicker(true);
    const { data: canvData, error: canvErr } = await supabase
      .from('canvass_requests')
      .select('id, canvass_number, pr_id, total_amount, department, company_id, requester_id, recommended_quotation_index, suppliers, items, companies ( name )')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    if (canvErr) {
      showToast('error', canvErr.message);
      return;
    }
    const { data: existingPOs } = await supabase
      .from('purchase_orders')
      .select('canvass_request_id')
      .is('deleted_at', null)
      .not('canvass_request_id', 'is', null);
    const usedIds = new Set((existingPOs || []).map((r: any) => r.canvass_request_id));
    setAvailableCanvasses(((canvData || []) as CanvassRow[]).filter((c) => !usedIds.has(c.id)));
  };

  const startCreateFromCanvass = async (c: CanvassRow) => {
    const winningIndex = typeof c.recommended_quotation_index === 'number' ? c.recommended_quotation_index : 0;
    const winner = Array.isArray(c.suppliers) ? c.suppliers[winningIndex] : null;
    if (!winner) {
      showToast('error', 'Selected canvass has no winning vendor.');
      return;
    }
    const ewtTotal = Number(winner.ewt || 0);
    const sourceItems: any[] = Array.isArray(winner.items) ? winner.items : [];
    const itemsLineTotal = sourceItems.reduce(
      (sum, it: any) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0),
      0,
    );
    const winnerItems: POItem[] = sourceItems.map((it: any, idx: number) => {
      const qty = Number(it.quantity || 0);
      const price = Number(it.unit_price || 0);
      const lineTotal = Number((qty * price).toFixed(2));
      const lineEwt = itemsLineTotal > 0
        ? Number(((lineTotal / itemsLineTotal) * ewtTotal).toFixed(2))
        : (idx === 0 ? ewtTotal : 0);
      return {
        item_description: it.description || '',
        unit_of_measure: it.uom || '',
        quantity: qty,
        unit_price: price,
        total_price: lineTotal,
        ewt_amount: lineEwt,
        pr_item_id: '',
        remarks: '',
      };
    });
    const vatable = !!winner.vatable;
    const subtotal = vatable
      ? Number(Number(winner.net_of_vat || 0).toFixed(2))
      : Number(winnerItems.reduce((sum, it) => sum + it.total_price, 0).toFixed(2));
    const vat = vatable
      ? Number(Number(winner.vat_12 || 0).toFixed(2))
      : 0;
    const total = Number((subtotal + vat - ewtTotal).toFixed(2));

    setDraftCanvass(c);
    setDraftItems(winnerItems);
    setDraftPO({
      canvass_request_id: c.id,
      pr_id: c.pr_id,
      vendor_id: winner.vendor_number || null,
      vendor_name: winner.vendor_name || winner.registered_name || '',
      vendor_address: winner.complete_address || '',
      vendor_contact: winner.contact_no || '',
      vendor_email: winner.email_address || '',
      vendor_tin: winner.tin || '',
      vendor_bank_account: winner.bank_account || '',
      vendor_bank_name: winner.bank_name || '',
      vendor_bank_address: winner.bank_address || '',
      company_id: c.company_id,
      company_name: c.companies?.name || '',
      department: c.department || '',
      requested_by: c.requester_id,
      po_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: '',
      delivery_address: '',
      payment_terms: 'Net 30',
      payment_terms_custom: '',
      delivery_terms: '',
      remarks: '',
      subtotal,
      vat_amount: vat,
      total_amount: total,
      budget_status: 'no_budget',
    });
    setShowCanvassPicker(false);
    setView('create');

    // Generate PO number from number series
    try {
      const { data: poNum, error: numErr } = await supabase.rpc('get_next_number', {
        p_series_name: 'Purchase Order',
        p_company_id: c.company_id || null,
      });
      if (!numErr && poNum) {
        setDraftPONumber(poNum as string);
      }
    } catch (err) {
      console.error('Error pre-generating PO number:', err);
    }
  };

  const recomputeTotals = (items: POItem[], subtotal: number, vat: number) => {
    const ewt = items.reduce((sum, it) => sum + Number(it.ewt_amount || 0), 0);
    return {
      subtotal: Number(subtotal.toFixed(2)),
      vat: Number(vat.toFixed(2)),
      total: Number((subtotal + vat - ewt).toFixed(2)),
    };
  };

  const updateDraftField = <K extends keyof PurchaseOrder>(key: K, value: PurchaseOrder[K]) => {
    setDraftPO((prev) => ({ ...prev, [key]: value }));
  };

  const saveDraftOrSubmit = async (submit: boolean) => {
    if (!draftCanvass || !user) return;
    if (!draftPO.delivery_address || !draftPO.expected_delivery_date) {
      showToast('error', 'Delivery address and expected delivery date are required.');
      return;
    }
    if (draftItems.length === 0) {
      showToast('error', 'At least one line item is required.');
      return;
    }

    setSaving(true);
    try {
      let poNumber = draftPONumber;
      if (!poNumber) {
        const { data: poNumberData, error: numErr } = await supabase.rpc('get_next_number', {
          p_series_name: 'Purchase Order',
          p_company_id: draftPO.company_id || null,
        });
        if (numErr) throw numErr;
        poNumber = poNumberData as string;
      }

      const initialStatus: POStatus = submit ? 'pending_approval' : 'draft';

      const { data: inserted, error: insErr } = await supabase
        .from('purchase_orders')
        .insert([
          {
            po_number: poNumber,
            canvass_request_id: draftPO.canvass_request_id,
            pr_id: draftPO.pr_id,
            vendor_id: draftPO.vendor_id,
            vendor_name: draftPO.vendor_name,
            vendor_address: draftPO.vendor_address,
            vendor_contact: draftPO.vendor_contact,
            vendor_email: draftPO.vendor_email,
            vendor_tin: draftPO.vendor_tin,
            vendor_bank_account: draftPO.vendor_bank_account || '',
            vendor_bank_name: draftPO.vendor_bank_name || '',
            vendor_bank_address: draftPO.vendor_bank_address || '',
            company_id: draftPO.company_id,
            department: draftPO.department,
            requested_by: draftPO.requested_by,
            prepared_by: user.id,
            po_date: draftPO.po_date,
            expected_delivery_date: draftPO.expected_delivery_date,
            delivery_address: draftPO.delivery_address,
            payment_terms: draftPO.payment_terms,
            payment_terms_custom: draftPO.payment_terms_custom || '',
            delivery_terms: draftPO.delivery_terms,
            remarks: draftPO.remarks,
            subtotal: draftPO.subtotal,
            vat_amount: draftPO.vat_amount,
            total_amount: draftPO.total_amount,
            budget_status: draftPO.budget_status,
            status: initialStatus,
            created_by: user.id,
            updated_by: user.id,
          },
        ])
        .select()
        .maybeSingle();

      if (insErr) throw insErr;
      const newPO = inserted as PurchaseOrder;

      const itemRows = draftItems.map((it) => ({
        purchase_order_id: newPO.id,
        item_description: it.item_description,
        unit_of_measure: it.unit_of_measure,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
        ewt_amount: Number(it.ewt_amount || 0),
        pr_item_id: it.pr_item_id || '',
        remarks: it.remarks || '',
      }));
      const { error: itemErr } = await supabase.from('purchase_order_items').insert(itemRows);
      if (itemErr) throw itemErr;

      await supabase.from('po_audit_logs').insert([
        {
          purchase_order_id: newPO.id,
          action: submit ? 'submitted' : 'created',
          performed_by: user.id,
          remarks: submit ? 'Submitted for approval' : 'Saved as draft',
          new_values: { status: initialStatus, total_amount: newPO.total_amount },
        },
      ]);

      if (submit) {
        await routeToFirstApprover(newPO);
      }

      showToast('success', `PO ${poNumber} ${submit ? 'submitted' : 'saved'}.`);
      setView('list');
      setDraftCanvass(null);
      setDraftItems([]);
      setDraftPO({});
      loadOrders();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save PO.');
    } finally {
      setSaving(false);
    }
  };

  const routeToFirstApprover = async (po: PurchaseOrder) => {
    if (!po.company_id || !po.department) {
      console.error('Missing company_id or department for approval routing');
      return;
    }

    const approvalFlows = await getApprovalFlow(
      po.company_id,
      po.department,
      'Purchase Order',
      false,
      po.total_amount
    );

    if (!approvalFlows || approvalFlows.length === 0) {
      throw new Error('No approval flow configured for Purchase Order. Please contact administrator.');
    }

    await createApprovalLedgerEntry(
      'Purchase Order',
      po.id,
      po.po_number,
      user!.id,
      profile?.full_name || 'Unknown',
      'Requestor',
      'Submitted',
      'Initial submission',
      0
    );

    await supabase
      .from('purchase_orders')
      .update({ current_approval_level: 0 })
      .eq('id', po.id);

    const firstApprover = approvalFlows[0];
    await sendApprovalEmailToAll(
      firstApprover,
      po.company_id,
      po.department,
      'Purchase Order',
      po.po_number,
      profile?.full_name || 'Unknown',
      po.total_amount,
      'Submitted',
      undefined,
      undefined,
      firstApprover.approver_type
    );
  };

  const openDetail = async (po: PurchaseOrder) => {
    setActiveOrder(po);
    const { data: items } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', po.id);
    setActiveItems((items || []) as POItem[]);
    setView('detail');
  };

  const handleDispatch = async () => {
    if (!activeOrder || !user) return;
    setSaving(true);
    try {
      const pdfBlob = await generatePurchaseOrderPdf(activeOrder, activeItems);
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeOrder.po_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      await supabase
        .from('purchase_orders')
        .update({ status: 'dispatched', dispatched_at: new Date().toISOString(), updated_by: user.id })
        .eq('id', activeOrder.id);

      await supabase.from('po_audit_logs').insert([
        {
          purchase_order_id: activeOrder.id,
          action: 'dispatched',
          performed_by: user.id,
          remarks: dispatchEmail ? `Dispatched to ${dispatchEmail}` : 'PDF downloaded',
        },
      ]);

      showToast('success', 'PO dispatched successfully.');
      setDispatchOpen(false);
      loadOrders();
      setActiveOrder({ ...activeOrder, status: 'dispatched' });
    } catch (err: any) {
      showToast('error', err.message || 'Dispatch failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async (po: PurchaseOrder) => {
    const { data: items } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', po.id);
    const pdfBlob = await generatePurchaseOrderPdf(po, (items || []) as POItem[]);
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${po.po_number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cancelPO = async () => {
    if (!activeOrder || !user) return;
    const reason = prompt('Cancellation reason:');
    if (!reason) return;
    await supabase
      .from('purchase_orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        updated_by: user.id,
      })
      .eq('id', activeOrder.id);
    await supabase.from('po_audit_logs').insert([
      {
        purchase_order_id: activeOrder.id,
        action: 'cancelled',
        performed_by: user.id,
        remarks: reason,
      },
    ]);
    showToast('success', 'PO cancelled.');
    loadOrders();
    setView('list');
  };

  const handlePreviewMergedPdf = async () => {
    if (!activeOrder?.merged_pdf_path) return;
    const { data } = await supabase.storage.from('attachments').createSignedUrl(activeOrder.merged_pdf_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const handleDownloadMergedPdf = async () => {
    if (!activeOrder?.merged_pdf_path) return;
    const { data } = await supabase.storage.from('attachments').download(activeOrder.merged_pdf_path);
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeOrder.po_number}_merged.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleRegeneratePdf = async () => {
    if (!activeOrder) return;
    setRegenerating(true);
    try {
      const { data: items } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('purchase_order_id', activeOrder.id);

      await generateAndUploadPOMergedPdf(
        {
          id: activeOrder.id,
          po_number: activeOrder.po_number,
          vendor_name: activeOrder.vendor_name,
          vendor_address: activeOrder.vendor_address,
          vendor_contact: activeOrder.vendor_contact,
          vendor_email: activeOrder.vendor_email,
          vendor_tin: activeOrder.vendor_tin,
          vendor_bank_name: activeOrder.vendor_bank_name,
          vendor_bank_account: activeOrder.vendor_bank_account,
          vendor_bank_address: activeOrder.vendor_bank_address,
          company_name: activeOrder.company_name,
          department: activeOrder.department,
          po_date: activeOrder.po_date,
          expected_delivery_date: activeOrder.expected_delivery_date,
          delivery_address: activeOrder.delivery_address,
          payment_terms: activeOrder.payment_terms,
          delivery_terms: activeOrder.delivery_terms,
          remarks: activeOrder.remarks,
          subtotal: Number(activeOrder.subtotal),
          vat_amount: Number(activeOrder.vat_amount),
          total_amount: Number(activeOrder.total_amount),
          canvass_request_id: activeOrder.canvass_request_id,
          company_id: activeOrder.company_id,
          prepared_by: activeOrder.prepared_by,
        },
        (items || []).map((item: any) => ({
          item_description: item.item_description,
          unit_of_measure: item.unit_of_measure,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          total_price: Number(item.total_price),
          ewt_amount: Number(item.ewt_amount || 0),
        }))
      );
      showToast('success', 'PDF regenerated successfully.');
      loadOrders();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to regenerate PDF.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleRepostToMsbc = async () => {
    if (!activeOrder) return;
    if (!confirm('Repost this PO to MSBC?')) return;
    setReposting(true);
    try {
      await supabase
        .from('purchase_orders')
        .update({ msbc_sync_status: 'syncing', msbc_sync_error: null })
        .eq('id', activeOrder.id);
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/post-po-to-msbc`;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ poId: activeOrder.id }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(errBody || `HTTP ${res.status}`);
      }
      showToast('success', 'PO reposted to MSBC successfully.');
      // Refresh order data and tracker
      const { data: updated } = await supabase.from('purchase_orders').select('*').eq('id', activeOrder.id).maybeSingle();
      if (updated) setActiveOrder(updated as PurchaseOrder);
      setTrackerKey((k) => k + 1);
    } catch (err: any) {
      showToast('error', `Repost failed: ${err.message}`);
      await supabase
        .from('purchase_orders')
        .update({ msbc_sync_status: 'failed', msbc_sync_error: err.message })
        .eq('id', activeOrder.id);
    } finally {
      setReposting(false);
    }
  };

  // Edit a draft item line (only certain fields editable)
  const updateItem = (idx: number, patch: Partial<POItem>) => {
    setDraftItems((prev) => {
      const copy = [...prev];
      const merged = { ...copy[idx], ...patch };
      const qty = Number(merged.quantity || 0);
      const price = Number(merged.unit_price || 0);
      merged.total_price = Number((qty * price).toFixed(2));
      copy[idx] = merged;
      const subtotal = Number(draftPO.subtotal || 0);
      const vat = Number(draftPO.vat_amount || 0);
      const totals = recomputeTotals(copy, subtotal, vat);
      setDraftPO((p) => ({ ...p, total_amount: totals.total }));
      return copy;
    });
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

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Purchase Orders</h1>
            <p className="text-sm text-slate-500">Create, track, and dispatch purchase orders</p>
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
              <>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                >
                  <FileSpreadsheet size={16} />
                  Export to Excel
                </button>
                <button
                  onClick={openCanvassPicker}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
                >
                  <Plus size={16} />
                  New Purchase Order
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* List View */}
      {view === 'list' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full max-w-full">
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setSearchTerm(searchInput); setCurrentPage(1); } }}
                  placeholder="Search by PO number, vendor, department, status..."
                  className="w-full pl-10 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
                {searchInput && (
                  <button
                    onClick={() => { setSearchInput(''); setSearchTerm(''); setCurrentPage(1); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={() => { setSearchTerm(searchInput); setCurrentPage(1); }}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Search</span>
              </button>
              <button
                onClick={() => setShowFilterModal(true)}
                className={`relative px-4 py-2 text-sm border rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  getActiveFilterCount(filterValues) > 0
                    ? 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Filter</span>
                {getActiveFilterCount(filterValues) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {getActiveFilterCount(filterValues)}
                  </span>
                )}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-slate-500 text-sm">
              <Loader2 className="animate-spin inline mr-2" size={16} /> Loading purchase orders...
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="lg:hidden w-full max-w-full overflow-x-hidden">
                {paginatedOrders.length === 0 ? (
                  <div className="px-6 py-12 text-center text-sm text-slate-500">
                    No purchase orders found
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 w-full">
                    {paginatedOrders.map((o) => (
                      <div key={o.id} className="p-4 hover:bg-slate-50 transition-colors w-full">
                        <div className="space-y-3 w-full overflow-hidden">
                          <div className="flex items-start justify-between gap-2 w-full min-w-0">
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">PO Number</div>
                              <div className="font-mono font-bold text-sm text-slate-900 truncate">{o.po_number}</div>
                            </div>
                            <StatusBadge status={o.status} />
                          </div>

                          <div className="w-full min-w-0">
                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Vendor</div>
                            <div className="text-sm text-slate-700 line-clamp-2 break-words">{o.vendor_name}</div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 w-full">
                            <div className="min-w-0 overflow-hidden">
                              <div className="text-xs font-medium text-slate-500 mb-1">PO Date</div>
                              <div className="text-sm text-slate-900 truncate">
                                {o.po_date ? new Date(o.po_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                              </div>
                            </div>
                            <div className="min-w-0 overflow-hidden">
                              <div className="text-xs font-medium text-slate-500 mb-1">Department</div>
                              <div className="text-sm text-slate-900 truncate">{o.department || '-'}</div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100 w-full min-w-0">
                            <div className="text-xs font-medium text-slate-500 mb-1">Total Amount</div>
                            <div className="text-lg font-bold text-slate-900 break-all">
                              ₱{fmtMoney(Number(o.total_amount))}
                            </div>
                          </div>

                          <button
                            onClick={() => openDetail(o)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm"
                          >
                            <Eye className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">View Details</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-auto flex-1">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200 z-10">
                    <tr>
                      <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                        <button onClick={() => handleSort('po_number')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                          PO No. {getSortIcon('po_number')}
                        </button>
                      </th>
                      <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                        <button onClick={() => handleSort('vendor_name')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                          Vendor {getSortIcon('vendor_name')}
                        </button>
                      </th>
                      <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                        <button onClick={() => handleSort('department')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                          Department {getSortIcon('department')}
                        </button>
                      </th>
                      <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                        <button onClick={() => handleSort('po_date')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                          PO Date {getSortIcon('po_date')}
                        </button>
                      </th>
                      <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                        <button onClick={() => handleSort('total_amount')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                          Amount {getSortIcon('total_amount')}
                        </button>
                      </th>
                      <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                        <button onClick={() => handleSort('status')} className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors w-full">
                          Status {getSortIcon('status')}
                        </button>
                      </th>
                      <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-sm text-slate-500">
                          No purchase orders found
                        </td>
                      </tr>
                    ) : (
                      paginatedOrders.map((o, index) => (
                        <tr key={o.id} className={`hover:bg-slate-50 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                          <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                            <span className="font-mono font-bold text-sm text-slate-900 truncate block min-w-[120px]" title={o.po_number}>
                              {o.po_number}
                            </span>
                          </td>
                          <td className="px-3 xl:px-4 py-3">
                            <span className="text-sm text-slate-700 truncate block max-w-[200px]" title={o.vendor_name}>
                              {o.vendor_name}
                            </span>
                          </td>
                          <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-slate-700">{o.department || '-'}</span>
                          </td>
                          <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-slate-700">
                              {o.po_date ? new Date(o.po_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                            </span>
                          </td>
                          <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                            <span className="text-sm font-bold text-slate-900">₱{fmtMoney(Number(o.total_amount))}</span>
                          </td>
                          <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                            <StatusBadge status={o.status} />
                          </td>
                          <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => openDetail(o)}
                                className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm hover:shadow group-hover:scale-105 transform"
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDownloadPdf(o); }}
                                className="inline-flex items-center justify-center p-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-all"
                                title="Download PDF"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {sortedOrders.length > 0 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  itemsPerPage={itemsPerPage}
                  totalItems={sortedOrders.length}
                  onPageChange={handlePageChange}
                  onItemsPerPageChange={handleItemsPerPageChange}
                />
              )}
            </>
          )}
        </div>
      )}

      {view === 'create' && draftCanvass && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <CreateView
            canvass={draftCanvass}
            po={draftPO}
            poNumber={draftPONumber}
            items={draftItems}
            onChange={updateDraftField}
            onItemChange={updateItem}
            onSave={() => saveDraftOrSubmit(false)}
            onSubmit={() => saveDraftOrSubmit(true)}
            saving={saving}
            paymentTerms={PAYMENT_TERMS}
          />
        </div>
      )}

      {view === 'detail' && activeOrder && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <DetailView
            po={activeOrder}
            items={activeItems}
            currentUserId={user?.id || ''}
            isProcurement={profile?.role === ('procurement' as any) || profile?.role === 'admin'}
            onDispatch={() => {
              setDispatchEmail(activeOrder.vendor_email || '');
              setDispatchOpen(true);
            }}
            onCancel={cancelPO}
            onDownload={() => handleDownloadPdf(activeOrder)}
            onPreviewMergedPdf={handlePreviewMergedPdf}
            onDownloadMergedPdf={handleDownloadMergedPdf}
            onRepostToMsbc={handleRepostToMsbc}
            onRegeneratePdf={handleRegeneratePdf}
            reposting={reposting}
            regenerating={regenerating}
            trackerKey={trackerKey}
          />
        </div>
      )}

      {showCanvassPicker && (
        <Modal title="Select Approved Canvass Summary" onClose={() => setShowCanvassPicker(false)}>
          {availableCanvasses.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No approved canvass summaries available for PO creation.
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {availableCanvasses.map((c) => {
                const winnerIdx = typeof c.recommended_quotation_index === 'number' ? c.recommended_quotation_index : 0;
                const winner = Array.isArray(c.suppliers) ? c.suppliers[winnerIdx] : null;
                return (
                  <button
                    key={c.id}
                    onClick={() => startCreateFromCanvass(c)}
                    className="w-full text-left px-4 py-3 border border-slate-200 hover:border-blue-400 hover:bg-blue-50 rounded-lg flex items-center justify-between transition"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{c.canvass_number}</div>
                      <div className="text-xs text-slate-500">
                        {c.companies?.name || 'No company'} · {winner?.vendor_name || 'No vendor'} · {c.department || 'No department'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-900 text-sm">PHP {fmtMoney(Number(c.total_amount || 0))}</div>
                      <ChevronRight size={16} className="text-slate-400 inline" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {dispatchOpen && activeOrder && (
        <Modal title="Dispatch PO to Vendor" onClose={() => setDispatchOpen(false)}>
          <div className="space-y-3">
            <Field label="Vendor Email">
              <input
                type="email"
                value={dispatchEmail}
                onChange={(e) => setDispatchEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="vendor@example.com"
              />
            </Field>
            <p className="text-xs text-slate-500">
              The PO PDF will be downloaded. Status changes to <strong>Dispatched</strong> and an audit entry is recorded.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDispatchOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDispatch}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Dispatch & Download
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showFilterModal && (
        <FilterModal
          isOpen={showFilterModal}
          onClose={() => setShowFilterModal(false)}
          columns={poFilterColumns}
          values={filterValues}
          onApply={(vals) => { setFilterValues(vals); setCurrentPage(1); }}
        />
      )}

      <ExportModal
        isOpen={showExportModal}
        onClose={() => { setShowExportModal(false); setExporting(false); }}
        columns={poExportColumns}
        onExport={handleExport}
        exporting={exporting}
      />
    </div>
  );
}


function CreateView({
  canvass,
  po,
  poNumber,
  items,
  onChange,
  onItemChange,
  onSave,
  onSubmit,
  saving,
  paymentTerms,
}: {
  canvass: CanvassRow;
  po: Partial<PurchaseOrder>;
  poNumber: string;
  items: POItem[];
  onChange: <K extends keyof PurchaseOrder>(key: K, val: PurchaseOrder[K]) => void;
  onItemChange: (idx: number, patch: Partial<POItem>) => void;
  onSave: () => void;
  onSubmit: () => void;
  saving: boolean;
  paymentTerms: string[];
}) {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">PO Number</p>
            <p className="text-sm font-bold text-blue-900 font-mono">{poNumber || 'Generating...'}</p>
          </div>
          <div>
            <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Source Canvass</p>
            <p className="text-sm font-medium text-blue-900">{canvass.canvass_number}</p>
          </div>
          <div>
            <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">Company</p>
            <p className="text-sm font-medium text-blue-900">{canvass.companies?.name || '—'}</p>
          </div>
        </div>
        <BudgetBadge status={(po.budget_status as PurchaseOrder['budget_status']) || 'no_budget'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Vendor (from winning quotation)">
          <Field label="Vendor Name">
            <input value={po.vendor_name || ''} readOnly className={READONLY_CLS} />
          </Field>
          <Field label="Vendor Address">
            <input value={po.vendor_address || ''} readOnly className={READONLY_CLS} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact">
              <input value={po.vendor_contact || ''} readOnly className={READONLY_CLS} />
            </Field>
            <Field label="TIN">
              <input value={po.vendor_tin || ''} readOnly className={READONLY_CLS} />
            </Field>
          </div>
          <Field label="Vendor Email">
            <input
              type="email"
              value={po.vendor_email || ''}
              onChange={(e) => onChange('vendor_email', e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Bank Name">
            <input
              type="text"
              value={po.vendor_bank_name || ''}
              onChange={(e) => onChange('vendor_bank_name', e.target.value)}
              className={INPUT_CLS}
              placeholder="e.g., BDO"
            />
          </Field>
          <Field label="Bank Account">
            <input
              type="text"
              value={po.vendor_bank_account || ''}
              onChange={(e) => onChange('vendor_bank_account', e.target.value)}
              className={INPUT_CLS}
              placeholder="Account number"
            />
          </Field>
          <Field label="Bank Address">
            <textarea
              rows={2}
              value={po.vendor_bank_address || ''}
              onChange={(e) => onChange('vendor_bank_address', e.target.value)}
              className={INPUT_CLS}
              placeholder="Branch / address"
            />
          </Field>
        </Section>

        <Section title="PO Details">
          <div className="grid grid-cols-2 gap-3">
            <Field label="PO Date">
              <input
                type="date"
                value={po.po_date || ''}
                onChange={(e) => onChange('po_date', e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Expected Delivery Date *">
              <input
                type="date"
                value={po.expected_delivery_date || ''}
                onChange={(e) => onChange('expected_delivery_date', e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
          </div>
          <Field label="Delivery Address *">
            <textarea
              rows={2}
              value={po.delivery_address || ''}
              onChange={(e) => onChange('delivery_address', e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company">
              <input value={po.company_name || ''} readOnly className={READONLY_CLS} />
            </Field>
            <Field label="Department">
              <input value={po.department || ''} readOnly className={READONLY_CLS} />
            </Field>
          </div>
          <Field label="Payment Terms">
            <select
              value={po.payment_terms || 'Net 30'}
              onChange={(e) => onChange('payment_terms', e.target.value)}
              className={INPUT_CLS}
            >
              {paymentTerms.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          {po.payment_terms === 'Custom' && (
            <Field label="Payment Terms (Custom) *">
              <input
                type="text"
                value={po.payment_terms_custom || ''}
                onChange={(e) => onChange('payment_terms_custom', e.target.value)}
                className={INPUT_CLS}
                placeholder="e.g., 30% downpayment, balance upon delivery"
              />
            </Field>
          )}
          <Field label="Delivery Terms">
            <textarea
              rows={2}
              value={po.delivery_terms || ''}
              onChange={(e) => onChange('delivery_terms', e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Remarks">
            <textarea
              rows={2}
              value={po.remarks || ''}
              onChange={(e) => onChange('remarks', e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
        </Section>
      </div>

      <Section title="Line Items (locked from canvass)">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">UOM</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 text-slate-900">{it.item_description}</td>
                  <td className="px-3 py-2 text-slate-700">{it.unit_of_measure}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(it.quantity).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(it.unit_price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(it.total_price)}</td>
                  <td className="px-3 py-2">
                    <input
                      value={it.remarks}
                      onChange={(e) => onItemChange(idx, { remarks: e.target.value })}
                      className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Net of VAT</span>
              <span className="tabular-nums">{fmtMoney(Number(po.subtotal || 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">VAT (12%)</span>
              <span className="tabular-nums">{fmtMoney(Number(po.vat_amount || 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">EWT</span>
              <span className="tabular-nums">{fmtMoney(items.reduce((s, it) => s + Number(it.ewt_amount || 0), 0))}</span>
            </div>
            <div className="flex justify-between font-semibold text-base border-t border-slate-200 pt-1">
              <span>Net Payable</span>
              <span className="tabular-nums">{fmtMoney(Number(po.total_amount || 0))}</span>
            </div>
          </div>
        </div>
      </Section>

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
          onClick={onSubmit}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Submit for Approval
        </button>
      </div>
    </div>
  );
}

function DetailView({
  po,
  items,
  isProcurement,
  onDispatch,
  onCancel,
  onDownload,
  onPreviewMergedPdf,
  onDownloadMergedPdf,
  onRepostToMsbc,
  onRegeneratePdf,
  reposting,
  regenerating,
  trackerKey,
}: {
  po: PurchaseOrder;
  items: POItem[];
  currentUserId: string;
  isProcurement: boolean;
  onDispatch: () => void;
  onCancel: () => void;
  onDownload: () => void;
  onPreviewMergedPdf: () => void;
  onDownloadMergedPdf: () => void;
  onRepostToMsbc: () => void;
  onRegeneratePdf: () => void;
  reposting: boolean;
  regenerating: boolean;
  trackerKey: number;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{po.po_number}</h2>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={po.status} />
            <BudgetBadge status={po.budget_status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDownload}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            <Download size={16} /> Download PDF
          </button>
          {isProcurement && po.status === 'approved' && (
            <button
              onClick={onDispatch}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              <Mail size={16} /> Dispatch to Vendor
            </button>
          )}
          {isProcurement && !['cancelled', 'closed', 'rejected'].includes(po.status) && (
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg"
            >
              <Trash2 size={16} /> Cancel
            </button>
          )}
        </div>
      </div>

      {po.status === 'approved' && (
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">Generated Documents</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {po.merged_pdf_path ? 'Merged PO document available' : 'PO Form + RFP + Canvass Summary'}
              </p>
              {po.msbc_sync_status && (
                <div className="mt-1.5">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                    po.msbc_sync_status === 'synced' ? 'bg-green-100 text-green-700' :
                    po.msbc_sync_status === 'syncing' ? 'bg-blue-100 text-blue-700' :
                    po.msbc_sync_status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {po.msbc_sync_status === 'synced' ? 'Posted to MSBC' :
                     po.msbc_sync_status === 'syncing' ? 'Syncing...' :
                     po.msbc_sync_status === 'failed' ? 'MSBC Post Failed' : 'Pending'}
                  </span>
                  {po.msbc_sync_status === 'failed' && po.msbc_sync_error && (
                    <p className="text-xs text-red-600 mt-1">{po.msbc_sync_error}</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {po.merged_pdf_path && (
                <>
                  <button
                    onClick={onPreviewMergedPdf}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                  >
                    <Eye size={16} /> Preview
                  </button>
                  <button
                    onClick={onDownloadMergedPdf}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <Download size={16} /> Download
                  </button>
                </>
              )}
              <button
                onClick={onRegeneratePdf}
                disabled={regenerating}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {regenerating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {regenerating ? 'Regenerating...' : 'Regenerate PDF'}
              </button>
              <button
                onClick={onRepostToMsbc}
                disabled={reposting}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {reposting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {reposting ? 'Reposting...' : 'Repost to MSBC'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Vendor">
          <KV label="Name" value={po.vendor_name} />
          <KV label="Address" value={po.vendor_address || '—'} />
          <KV label="Contact" value={po.vendor_contact || '—'} />
          <KV label="Email" value={po.vendor_email || '—'} />
          <KV label="TIN" value={po.vendor_tin || '—'} />
          <KV label="Bank Name" value={po.vendor_bank_name || '—'} />
          <KV label="Bank Account" value={po.vendor_bank_account || '—'} />
          <KV label="Bank Address" value={po.vendor_bank_address || '—'} />
        </Section>
        <Section title="PO Details">
          <KV label="Company" value={po.company_name || '—'} />
          <KV label="Department" value={po.department || '—'} />
          <KV label="PO Date" value={po.po_date} />
          <KV label="Expected Delivery" value={po.expected_delivery_date || '—'} />
          <KV label="Delivery Address" value={po.delivery_address || '—'} />
          <KV label="Payment Terms" value={po.payment_terms === 'Custom' ? `Custom: ${po.payment_terms_custom || '—'}` : po.payment_terms} />
          <KV label="Delivery Terms" value={po.delivery_terms || '—'} />
          <KV label="Remarks" value={po.remarks || '—'} />
        </Section>
      </div>

      <Section title="Line Items">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">UOM</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 text-slate-900">{it.item_description}</td>
                  <td className="px-3 py-2 text-slate-700">{it.unit_of_measure}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(it.quantity).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(it.unit_price))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(Number(it.total_price))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Net of VAT</span>
              <span className="tabular-nums">{fmtMoney(Number(po.subtotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">VAT (12%)</span>
              <span className="tabular-nums">{fmtMoney(Number(po.vat_amount))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">EWT</span>
              <span className="tabular-nums">{fmtMoney(items.reduce((s, it) => s + Number(it.ewt_amount || 0), 0))}</span>
            </div>
            <div className="flex justify-between font-semibold text-base border-t border-slate-200 pt-1">
              <span>Net Payable</span>
              <span className="tabular-nums">{fmtMoney(Number(po.total_amount))}</span>
            </div>
          </div>
        </div>
      </Section>

      {po.company_id && po.status !== 'draft' && (
        <ApprovalProgressTracker
          key={trackerKey}
          requestType="Purchase Order"
          requestId={po.id}
          requestNumber={po.po_number}
          companyId={po.company_id}
          department={po.department}
        />
      )}
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
      <span className="text-slate-900 text-right">{value}</span>
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
