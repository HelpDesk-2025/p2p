import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, Eye, X, Loader2, Download, Paperclip, ArrowUpDown, ArrowUp, ArrowDown, Banknote, FileText, FileDown, Filter, FileSpreadsheet, ClipboardList, Printer } from 'lucide-react';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import Pagination from '../Pagination';
import FilterModal, { FilterColumn, FilterValues, applyFilters, getActiveFilterCount } from '../FilterModal';
import { generatePettyCashReleaseBundle } from '../../lib/pettyCashReleaseBundleExporter';
import { sendApprovalEmail } from '../../lib/approvalFlow';

interface ExpenseItem {
  date: string;
  description: string;
  amount: number;
}

interface ExpenseTypeItem {
  expense_type_id: string;
  expense_type_name: string;
  sub_item_name: string;
  status: string;
  specify_value?: string;
}

interface PettyCashReq {
  id: string;
  pc_number: string;
  requester_id: string;
  company_id?: string;
  department?: string;
  request_date: string;
  date_of_transactions?: string;
  purpose: string;
  amount: number;
  payment_mode_id?: string;
  payee?: string;
  request_type?: string;
  no_of_pax?: number;
  expense_items?: ExpenseItem[];
  expense_type_items?: ExpenseTypeItem[];
  linked_petty_cash_id?: string;
  petty_cash_advance?: number;
  status: string;
  current_approval_level: number;
  received_at?: string;
  received_by?: string;
  cash_released?: boolean;
  cash_released_at?: string;
  cash_released_by?: string;
  exported_at?: string | null;
  exported_by?: string | null;
  attachments?: Array<{
    file_name: string;
    file_path: string;
    file_type: string;
  }>;
  approved_petty_cash_pdf_path?: string;
  rfp_pdf_path?: string;
  liquidation_pdf_path?: string;
  user_profiles?: {
    full_name: string;
    email: string;
    company_id: string;
    department?: string;
    e_sig?: string;
  };
  companies?: {
    id: string;
    name: string;
  };
}

export function PettyCashRelease() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<PettyCashReq[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PettyCashReq | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('request_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [linkedPettyCashDetails, setLinkedPettyCashDetails] = useState<PettyCashReq | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const [showPreviewSetupModal, setShowPreviewSetupModal] = useState(false);
  const [previewSetup, setPreviewSetup] = useState<FilterValues>({});
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<PettyCashReq[]>([]);

  const requesterOptions = Array.from(
    new Set(
      requests
        .map((r) => r.user_profiles?.full_name)
        .filter((v): v is string => !!v && v.trim() !== '')
    )
  )
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ value: name, label: name }));

  const departmentOptions = Array.from(
    new Set(
      requests
        .map((r) => r.department || r.user_profiles?.department)
        .filter((v): v is string => !!v && v.trim() !== '')
    )
  )
    .sort((a, b) => a.localeCompare(b))
    .map((dept) => ({ value: dept, label: dept }));

  const filterColumns: FilterColumn[] = [
    {
      key: 'exported',
      label: 'Exported',
      type: 'select',
      options: [
        { value: 'exported', label: 'Exported' },
        { value: 'not_exported', label: 'Not Exported' },
      ],
    },
    { key: 'pc_number', label: 'PC No.', type: 'text' },
    { key: 'requester', label: 'Requester', type: 'select', options: requesterOptions },
    { key: 'department', label: 'Department', type: 'select', options: departmentOptions },
    { key: 'amount', label: 'Amount', type: 'number' },
    {
      key: 'request_type',
      label: 'Type',
      type: 'multiSelect',
      options: [
        { value: 'For Cash Advance', label: 'For Cash Advance' },
        { value: 'For Reimbursement', label: 'For Reimbursement' },
        { value: 'For Liquidation', label: 'For Liquidation' },
      ],
    },
    {
      key: 'hide_linked_ca',
      label: 'Hide Linked CA in Liquidation',
      type: 'checkbox',
      description: 'Hide the original Cash Advance row when its Liquidation is shown.',
      showWhen: (v) => (v.request_type || '').split(',').includes('For Liquidation'),
    },
    { key: 'linked_ca', label: 'Linked CA', type: 'text' },
    {
      key: 'cash_released',
      label: 'Cash Released',
      type: 'multiSelect',
      options: [
        { value: 'released', label: 'Released' },
        { value: 'pending', label: 'Pending' },
        { value: 'n/a', label: 'N/A' },
      ],
    },
    {
      key: 'cash_received',
      label: 'Cash Received',
      type: 'multiSelect',
      options: [
        { value: 'received', label: 'Received' },
        { value: 'pending', label: 'Pending' },
        { value: 'n/a', label: 'N/A' },
      ],
    },
  ];

  const getFilterFieldValue = (r: PettyCashReq, key: string): any => {
    switch (key) {
      case 'exported':
        return r.exported_at ? 'exported' : 'not_exported';
      case 'pc_number':
        return r.pc_number;
      case 'requester':
        return r.user_profiles?.full_name || '';
      case 'department':
        return r.department || r.user_profiles?.department || '';
      case 'amount':
        return Number(r.amount) || 0;
      case 'request_type':
        return r.request_type || 'For Cash Advance';
      case 'linked_ca':
        return getLinkedCashAdvancePcNumber(r) || '';
      case 'cash_released':
        if (!isReleaseEligible(r)) return 'n/a';
        return r.cash_released ? 'released' : 'pending';
      case 'cash_received':
        if (!isReleaseEligible(r)) return 'n/a';
        return r.received_at ? 'received' : 'pending';
      default:
        return '';
    }
  };

  useEffect(() => {
    loadRequests();
  }, [profile]);

  useEffect(() => {
    const fetchLinkedPettyCash = async () => {
      if (selectedRequest?.request_type === 'For Liquidation' && selectedRequest?.linked_petty_cash_id) {
        try {
          const { data, error } = await supabase
            .from('petty_cash_requests')
            .select('*')
            .eq('id', selectedRequest.linked_petty_cash_id)
            .maybeSingle();

          if (error) throw error;
          setLinkedPettyCashDetails(data);
        } catch (error) {
          console.error('Error fetching linked petty cash:', error);
          setLinkedPettyCashDetails(null);
        }
      } else {
        setLinkedPettyCashDetails(null);
      }
    };

    fetchLinkedPettyCash();
  }, [selectedRequest]);

  const loadRequests = async () => {
    if (!profile) return;
    setListLoading(true);

    try {
      let allowedCompanyIds: string[] | null = null;
      if (profile.role !== 'admin') {
        const { data: roleRow } = await supabase
          .from('roles')
          .select('id')
          .eq('name', profile.role)
          .maybeSingle();

        if (roleRow?.id) {
          const { data: scopedCompanies } = await supabase
            .from('role_petty_cash_release_companies')
            .select('company_id')
            .eq('role_id', roleRow.id);
          if (scopedCompanies && scopedCompanies.length > 0) {
            allowedCompanyIds = scopedCompanies.map((r: any) => r.company_id);
          }
        }

        if (!allowedCompanyIds) {
          allowedCompanyIds = profile.company_id ? [profile.company_id] : [];
        }
      }

      let query = supabase
        .from('petty_cash_requests')
        .select(`
          *,
          user_profiles:requester_id (full_name, email, company_id, department, e_sig),
          companies!petty_cash_requests_company_id_fkey (id, name)
        `)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (allowedCompanyIds !== null) {
        if (allowedCompanyIds.length === 0) {
          setRequests([]);
          setListLoading(false);
          return;
        }
        query = query.in('company_id', allowedCompanyIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading petty cash for release:', error);
      setRequests([]);
    }
    setListLoading(false);
  };

  const computeExpensesTotal = (request: PettyCashReq): number => {
    if (request.expense_items && request.expense_items.length > 0) {
      return request.expense_items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    }
    return Number(request.amount) || 0;
  };

  const computeOverForReimbursement = (request: PettyCashReq): number => {
    if (request.request_type !== 'For Liquidation') return 0;
    const total = computeExpensesTotal(request);
    const advance = Number(request.petty_cash_advance) || 0;
    const diff = total - advance;
    return diff > 0 ? diff : 0;
  };

  const isReleaseEligible = (request: PettyCashReq): boolean => {
    if (request.request_type === 'For Liquidation') {
      return computeOverForReimbursement(request) > 0;
    }
    return true;
  };

  const computeStatus = (r: PettyCashReq): 'Released' | 'Pending' | 'N/A' | 'Received' => {
    if (!isReleaseEligible(r)) return 'N/A';
    if (r.received_at) return 'Received';
    if (r.cash_released) return 'Released';
    return 'Pending';
  };

  const isExportable = (r: PettyCashReq): boolean => {
    return computeStatus(r) !== 'Pending';
  };

  const getReleaseAmount = (request: PettyCashReq): number => {
    if (request.request_type === 'For Liquidation') {
      return computeOverForReimbursement(request);
    }
    return Number(request.amount) || 0;
  };

  const handleViewRequest = (request: PettyCashReq) => {
    setSelectedRequest(request);
    setShowModal(true);
  };

  const handleRelease = async () => {
    if (!selectedRequest || !profile) return;

    const releaseAmt = getReleaseAmount(selectedRequest);
    const isOverLiq = selectedRequest.request_type === 'For Liquidation';
    const confirmMsg = isOverLiq
      ? `Release Over for Reimbursement amount of ${'\u20B1'}${releaseAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for Petty Cash ${selectedRequest.pc_number} to ${selectedRequest.payee || selectedRequest.user_profiles?.full_name || 'the requester'}?`
      : `Are you sure you want to release Petty Cash ${selectedRequest.pc_number} (${'\u20B1'}${releaseAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) to ${selectedRequest.payee || selectedRequest.user_profiles?.full_name || 'the requester'}?`;

    if (!confirm(confirmMsg)) {
      return;
    }

    setReleasing(true);
    try {
      const { error } = await supabase
        .from('petty_cash_requests')
        .update({
          cash_released: true,
          cash_released_at: new Date().toISOString(),
          cash_released_by: profile.id,
        })
        .eq('id', selectedRequest.id);

      if (error) throw error;

      const requesterEmail = selectedRequest.user_profiles?.email;
      const requesterName = selectedRequest.user_profiles?.full_name || 'Requester';
      const requesterDept = selectedRequest.department || selectedRequest.user_profiles?.department || '';
      if (requesterEmail) {
        await sendApprovalEmail(
          requesterEmail,
          requesterName,
          'Petty Cash',
          selectedRequest.pc_number,
          requesterName,
          requesterDept,
          releaseAmt,
          'Cash Released',
          profile.full_name || 'Disbursing Officer',
          undefined,
          undefined
        );
      }

      setShowModal(false);
      setSelectedRequest(null);
      loadRequests();
    } catch (error: any) {
      console.error('Error releasing petty cash:', error);
      alert('Failed to release petty cash: ' + error.message);
    } finally {
      setReleasing(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown size={14} className="opacity-40" />;
    }
    return sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  const requestsById = new Map(requests.map((r) => [r.id, r]));

  const getLinkedCashAdvancePcNumber = (r: PettyCashReq): string | null => {
    if (r.request_type !== 'For Liquidation' || !r.linked_petty_cash_id) return null;
    return requestsById.get(r.linked_petty_cash_id)?.pc_number ?? null;
  };

  let filteredRequests = applyFilters(requests, filterValues, filterColumns, getFilterFieldValue);

  if (
    filterValues.hide_linked_ca === 'true' &&
    (filterValues.request_type || '').split(',').includes('For Liquidation')
  ) {
    const linkedCaIds = new Set(
      filteredRequests
        .filter((r) => r.request_type === 'For Liquidation' && r.linked_petty_cash_id)
        .map((r) => r.linked_petty_cash_id as string)
    );
    filteredRequests = filteredRequests.filter((r) => !linkedCaIds.has(r.id));
  }

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    let aVal: any;
    let bVal: any;

    switch (sortColumn) {
      case 'pc_number':
        aVal = a.pc_number;
        bVal = b.pc_number;
        break;
      case 'requester':
        aVal = a.user_profiles?.full_name || '';
        bVal = b.user_profiles?.full_name || '';
        break;
      case 'department':
        aVal = a.department || a.user_profiles?.department || '';
        bVal = b.department || b.user_profiles?.department || '';
        break;
      case 'amount':
        aVal = a.amount;
        bVal = b.amount;
        break;
      case 'request_date':
        aVal = new Date(a.request_date).getTime();
        bVal = new Date(b.request_date).getTime();
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRequests.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRequests = sortedRequests.slice(startIndex, endIndex);

  const downloadAttachment = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      alert('Failed to download attachment');
    }
  };

  const orderRequestsWithLinkedLiquidations = (list: PettyCashReq[]): PettyCashReq[] => {
    const liquidationsByLink = new Map<string, PettyCashReq[]>();
    const standalone: PettyCashReq[] = [];

    for (const r of list) {
      if (r.request_type === 'For Liquidation' && r.linked_petty_cash_id) {
        const arr = liquidationsByLink.get(r.linked_petty_cash_id) || [];
        arr.push(r);
        liquidationsByLink.set(r.linked_petty_cash_id, arr);
      } else {
        standalone.push(r);
      }
    }

    const result: PettyCashReq[] = [];
    const placedLiquidationIds = new Set<string>();
    for (const r of standalone) {
      result.push(r);
      const linked = liquidationsByLink.get(r.id);
      if (linked) {
        for (const liq of linked) {
          result.push(liq);
          placedLiquidationIds.add(liq.id);
        }
      }
    }

    for (const [, liqs] of liquidationsByLink) {
      for (const liq of liqs) {
        if (!placedLiquidationIds.has(liq.id)) {
          result.push(liq);
        }
      }
    }

    return result;
  };

  const handleExportBundle = async () => {
    if (sortedRequests.length === 0 || exporting) return;
    const exportable = sortedRequests.filter((r) => isExportable(r) && selectedIds.has(r.id));
    if (exportable.length === 0) {
      alert('Please select at least one request to export. Requests awaiting cash release or receipt cannot be exported.');
      return;
    }
    setExporting(true);
    try {
      const ordered = orderRequestsWithLinkedLiquidations(exportable).map((r) => ({
        ...r,
        release_status: computeStatus(r),
      }));
      const { blob, failures } = await generatePettyCashReleaseBundle(ordered);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      a.href = url;
      a.download = `Petty_Cash_Release_Bundle_${stamp}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const exportedAt = new Date().toISOString();
      const idsToMark = exportable.map((r) => r.id);
      const { error: updateError } = await supabase
        .from('petty_cash_requests')
        .update({ exported_at: exportedAt, exported_by: profile?.id ?? null })
        .in('id', idsToMark);
      if (updateError) {
        console.error('Failed to mark requests as exported:', updateError);
      } else {
        setRequests((prev) =>
          prev.map((r) =>
            idsToMark.includes(r.id)
              ? { ...r, exported_at: exportedAt, exported_by: profile?.id ?? null }
              : r,
          ),
        );
        setSelectedIds(new Set());
      }

      if (failures.length > 0) {
        alert(
          `Bundle generated, but the following ${failures.length} item(s) could not be included:\n\n${failures
            .slice(0, 10)
            .join('\n')}${failures.length > 10 ? `\n...and ${failures.length - 10} more` : ''}`,
        );
      }
    } catch (error: any) {
      console.error('Error exporting bundle:', error);
      alert('Failed to export bundle: ' + (error?.message || 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  const handleExportSummary = () => {
    const selected = sortedRequests.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) {
      alert('Please select at least one request to export.');
      return;
    }

    const headers = [
      'PC No.',
      'Requester',
      'Email',
      'Department',
      'Amount',
      'Type',
      'Linked CA',
      'Cash Released',
      'Cash Released At',
      'Cash Received',
      'Cash Received At',
      'Request Date',
      'Purpose',
      'Payee',
      'Company',
    ];

    const escapeHtml = (val: any): string => {
      if (val === null || val === undefined) return '';
      return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    const statusBadgeStyle = (status: string): string => {
      switch (status) {
        case 'Released':
          return 'background-color:#d1fae5;color:#065f46;font-weight:bold;';
        case 'Received':
          return 'background-color:#dbeafe;color:#1e40af;font-weight:bold;';
        case 'Pending':
          return 'background-color:#fef3c7;color:#92400e;font-weight:bold;';
        case 'N/A':
          return 'background-color:#f1f5f9;color:#64748b;';
        default:
          return '';
      }
    };

    const typeBadgeStyle = (t: string): string => {
      switch (t) {
        case 'For Liquidation':
          return 'background-color:#dbeafe;color:#1e40af;font-weight:bold;';
        case 'For Reimbursement':
          return 'background-color:#fef3c7;color:#92400e;font-weight:bold;';
        default:
          return 'background-color:#ccfbf1;color:#115e59;font-weight:bold;';
      }
    };

    let totalAmount = 0;

    const rowsHtml = selected
      .map((r, idx) => {
        const releasedStatus = !isReleaseEligible(r)
          ? 'N/A'
          : r.cash_released
          ? 'Released'
          : 'Pending';
        const receivedStatus = !isReleaseEligible(r)
          ? 'N/A'
          : r.received_at
          ? 'Received'
          : 'Pending';
        const amt = Number(r.amount || 0);
        totalAmount += amt;

        const baseTd = 'border:1px solid #cbd5e1;padding:8px 10px;font-family:Calibri,Arial,sans-serif;font-size:11pt;';
        const altBg = idx % 2 === 0 ? 'background-color:#ffffff;' : 'background-color:#f8fafc;';
        const cellStyle = `${baseTd}${altBg}`;
        const numStyle = `${cellStyle}text-align:right;mso-number-format:'\\#\\,\\#\\#0\\.00';`;
        const monoStyle = `${cellStyle}font-family:Consolas,monospace;font-weight:bold;color:#0f172a;`;
        const badge = (style: string) =>
          `${cellStyle}text-align:center;${style}border-radius:4px;`;

        return `<tr>
          <td style="${monoStyle}">${escapeHtml(r.pc_number)}</td>
          <td style="${cellStyle}">${escapeHtml(r.user_profiles?.full_name || '')}</td>
          <td style="${cellStyle}color:#475569;">${escapeHtml(r.user_profiles?.email || '')}</td>
          <td style="${cellStyle}">${escapeHtml(r.department || r.user_profiles?.department || '')}</td>
          <td style="${numStyle}">${amt.toFixed(2)}</td>
          <td style="${badge(typeBadgeStyle(r.request_type || 'For Cash Advance'))}">${escapeHtml(r.request_type || 'For Cash Advance')}</td>
          <td style="${cellStyle}text-align:center;font-family:Consolas,monospace;color:#1d4ed8;">${escapeHtml(getLinkedCashAdvancePcNumber(r) || '')}</td>
          <td style="${badge(statusBadgeStyle(releasedStatus))}">${escapeHtml(releasedStatus)}</td>
          <td style="${cellStyle}color:#475569;">${escapeHtml(r.cash_released_at ? new Date(r.cash_released_at).toLocaleString() : '')}</td>
          <td style="${badge(statusBadgeStyle(receivedStatus))}">${escapeHtml(receivedStatus)}</td>
          <td style="${cellStyle}color:#475569;">${escapeHtml(r.received_at ? new Date(r.received_at).toLocaleString() : '')}</td>
          <td style="${cellStyle}">${escapeHtml(r.request_date ? new Date(r.request_date).toLocaleDateString() : '')}</td>
          <td style="${cellStyle}">${escapeHtml(r.purpose || '')}</td>
          <td style="${cellStyle}">${escapeHtml(r.payee || '')}</td>
          <td style="${cellStyle}">${escapeHtml(r.companies?.name || '')}</td>
        </tr>`;
      })
      .join('');

    const headerCellStyle =
      'background-color:#1e3a8a;color:#ffffff;font-weight:bold;font-family:Calibri,Arial,sans-serif;font-size:11pt;padding:10px;border:1px solid #1e3a8a;text-align:center;';
    const headerHtml = headers
      .map((h) => `<th style="${headerCellStyle}">${escapeHtml(h)}</th>`)
      .join('');

    const titleStyle =
      'font-family:Calibri,Arial,sans-serif;font-size:18pt;font-weight:bold;color:#0f172a;padding:8px 0;';
    const subtitleStyle =
      'font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#64748b;padding:2px 0;';
    const totalLabelStyle =
      'border:1px solid #cbd5e1;padding:10px;background-color:#e2e8f0;font-weight:bold;text-align:right;font-family:Calibri,Arial,sans-serif;font-size:11pt;';
    const totalValueStyle =
      "border:1px solid #cbd5e1;padding:10px;background-color:#e2e8f0;font-weight:bold;text-align:right;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#065f46;mso-number-format:'\\#\\,\\#\\#0\\.00';";

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8" />
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Petty Cash Summary</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
</xml><![endif]-->
</head>
<body>
<div style="${titleStyle}">Petty Cash Release Summary</div>
<div style="${subtitleStyle}">Generated on ${escapeHtml(new Date().toLocaleString())}</div>
<div style="${subtitleStyle}">Total Records: ${selected.length}</div>
<br />
<table style="border-collapse:collapse;border:1px solid #cbd5e1;">
  <thead><tr>${headerHtml}</tr></thead>
  <tbody>
    ${rowsHtml}
    <tr>
      <td colspan="4" style="${totalLabelStyle}">TOTAL</td>
      <td style="${totalValueStyle}">${totalAmount.toFixed(2)}</td>
      <td colspan="10" style="${totalLabelStyle}background-color:#e2e8f0;"></td>
    </tr>
  </tbody>
</table>
</body>
</html>`;

    const blob = new Blob(['\uFEFF', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    a.href = url;
    a.download = `Petty_Cash_Release_Summary_${stamp}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadGeneratedPdf = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(filePath);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF');
    }
  };

  const previewGeneratedPdf = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(filePath);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error previewing PDF:', error);
      alert('Failed to preview PDF');
    }
  };

  const previewAttachment = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error previewing attachment:', error);
      alert('Failed to preview attachment');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Petty Cash Release</h2>
          <p className="text-slate-600 mt-1">Release approved petty cash requests to requesters</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilterModal(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition font-semibold shadow-sm relative"
            title="Filter requests"
          >
            <Filter size={18} />
            Filters
            {getActiveFilterCount(filterValues) > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-bold rounded-full bg-blue-600 text-white">
                {getActiveFilterCount(filterValues)}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setPreviewSetup({ ...filterValues });
              setShowPreviewSetupModal(true);
            }}
            disabled={listLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold shadow-sm"
            title="Set up filters and preview a styled summary"
          >
            <ClipboardList size={18} />
            Preview Summary
          </button>
          <button
            onClick={handleExportSummary}
            disabled={listLoading || selectedIds.size === 0}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold shadow-sm"
            title="Export the summary of the selected requests to an Excel-compatible (CSV) file"
          >
            <FileSpreadsheet size={18} />
            {selectedIds.size > 0 ? `Export Summary (${selectedIds.size})` : 'Export Summary'}
          </button>
          <button
            onClick={handleExportBundle}
            disabled={exporting || listLoading || selectedIds.size === 0}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold shadow-sm"
            title="Export all listed requests and their generated forms into a single PDF"
          >
            {exporting ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
            {exporting
              ? 'Generating...'
              : selectedIds.size > 0
              ? `Export Selected (${selectedIds.size})`
              : 'Export Selected'}
          </button>
        </div>
      </div>

      <FilterModal
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        columns={filterColumns}
        values={filterValues}
        onApply={(v) => { setFilterValues(v); setCurrentPage(1); }}
      />

      <FilterModal
        isOpen={showPreviewSetupModal}
        onClose={() => setShowPreviewSetupModal(false)}
        columns={filterColumns}
        values={previewSetup}
        onApply={(v) => {
          setPreviewSetup(v);
          const filtered = applyFilters(requests, v, filterColumns, getFilterFieldValue);
          setPreviewData(filtered);
          setShowPreviewModal(true);
        }}
      />

      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-800 to-slate-900">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ClipboardList size={20} />
                  Petty Cash Release Summary Preview
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  {previewData.length} record{previewData.length !== 1 ? 's' : ''} matching the configured filters
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition text-sm font-semibold"
                >
                  <Printer size={16} />
                  Print
                </button>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="p-2 text-white hover:bg-white/10 rounded-lg transition"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-slate-50 print:bg-white print:p-0">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 print:shadow-none print:border-0">
                <div className="px-6 py-5 border-b border-slate-200">
                  <h2 className="text-2xl font-bold text-slate-900">Petty Cash Release Summary</h2>
                  <p className="text-sm text-slate-500 mt-1">Generated on {new Date().toLocaleString()}</p>
                </div>

                {previewData.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    No records match the configured filters.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-800 text-white">
                            <th className="px-3 py-2.5 text-left font-semibold">PC No.</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Requester</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Department</th>
                            <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                            <th className="px-3 py-2.5 text-center font-semibold">Type</th>
                            <th className="px-3 py-2.5 text-center font-semibold">Linked CA</th>
                            <th className="px-3 py-2.5 text-center font-semibold">Cash Released</th>
                            <th className="px-3 py-2.5 text-center font-semibold">Cash Received</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Request Date</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Purpose</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Payee</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Company</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.map((r, idx) => {
                            const status = computeStatus(r);
                            const released = !isReleaseEligible(r) ? 'N/A' : r.cash_released ? 'Released' : 'Pending';
                            const received = !isReleaseEligible(r) ? 'N/A' : r.received_at ? 'Received' : 'Pending';
                            const typeBadge =
                              r.request_type === 'For Liquidation' ? 'bg-blue-100 text-blue-800'
                              : r.request_type === 'For Reimbursement' ? 'bg-amber-100 text-amber-800'
                              : 'bg-teal-100 text-teal-800';
                            const statusBadge = (s: string) =>
                              s === 'Released' ? 'bg-emerald-100 text-emerald-800'
                              : s === 'Received' ? 'bg-blue-100 text-blue-800'
                              : s === 'Pending' ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600';
                            return (
                              <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <td className="px-3 py-2 font-mono font-semibold text-slate-900">{r.pc_number}</td>
                                <td className="px-3 py-2 text-slate-800">{r.user_profiles?.full_name || ''}</td>
                                <td className="px-3 py-2 text-slate-700">{r.department || r.user_profiles?.department || ''}</td>
                                <td className="px-3 py-2 text-right font-mono text-slate-900">
                                  {Number(r.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${typeBadge}`}>
                                    {r.request_type || 'For Cash Advance'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center font-mono text-blue-700">{getLinkedCashAdvancePcNumber(r) || ''}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusBadge(released)}`}>
                                    {released}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusBadge(received)}`}>
                                    {received}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-slate-700">
                                  {r.request_date ? new Date(r.request_date).toLocaleDateString() : ''}
                                </td>
                                <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate" title={r.purpose}>{r.purpose || ''}</td>
                                <td className="px-3 py-2 text-slate-700">{r.payee || ''}</td>
                                <td className="px-3 py-2 text-slate-700">{r.companies?.name || ''}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 border-t-2 border-slate-300">
                            <td colSpan={3} className="px-3 py-3 text-right font-bold text-slate-900">TOTAL</td>
                            <td className="px-3 py-3 text-right font-mono font-bold text-emerald-700">
                              {previewData.reduce((s, r) => s + Number(r.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td colSpan={8}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-6 bg-slate-50 border-t border-slate-200">
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Records</div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{previewData.length}</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Amount</div>
                        <div className="text-2xl font-bold text-emerald-700 mt-1">
                          {previewData.reduce((s, r) => s + Number(r.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Released</div>
                        <div className="text-2xl font-bold text-blue-700 mt-1">
                          {previewData.filter((r) => isReleaseEligible(r) && r.cash_released).length}
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Pending Release</div>
                        <div className="text-2xl font-bold text-amber-700 mt-1">
                          {previewData.filter((r) => isReleaseEligible(r) && !r.cash_released).length}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-white">
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setShowPreviewSetupModal(true);
                }}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition font-semibold"
              >
                Edit Setup
              </button>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {listLoading ? (
          <div className="overflow-auto flex-1">
            <table className="w-full hidden lg:table">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  {['', 'EXPORTED', 'PC NO.', 'REQUESTER', 'DEPARTMENT', 'AMOUNT', 'TYPE', 'LINKED CA', 'CASH RELEASED', 'CASH RECEIVED', 'ACTION'].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-4"><div className="h-4 w-4 bg-slate-200 rounded"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-28 mb-1"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-36 mb-1"/><div className="h-3 bg-slate-100 rounded w-44"/></td>
                    <td className="py-3 px-4"><div className="h-6 bg-slate-200 rounded-full w-28"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-40"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-20"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-24"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-24"/></td>
                    <td className="py-3 px-4"><div className="h-6 bg-slate-200 rounded w-20"/></td>
                    <td className="py-3 px-4"><div className="h-6 bg-slate-200 rounded w-20"/></td>
                    <td className="py-3 px-4"><div className="h-6 bg-slate-200 rounded w-20"/></td>
                    <td className="py-3 px-4"><div className="h-8 bg-slate-200 rounded w-8"/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600">No approved petty cash requests found</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200 z-10">
                <tr>
                  <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Select all exportable rows on this page"
                      disabled={paginatedRequests.filter(isExportable).length === 0}
                      checked={
                        paginatedRequests.filter(isExportable).length > 0 &&
                        paginatedRequests
                          .filter(isExportable)
                          .every((r) => selectedIds.has(r.id))
                      }
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          paginatedRequests.filter(isExportable).forEach((r) => {
                            if (checked) next.add(r.id);
                            else next.delete(r.id);
                          });
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Exported
                    </span>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                    <button
                      onClick={() => handleSort('pc_number')}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                    >
                      PC No.
                      {getSortIcon('pc_number')}
                    </button>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                    <button
                      onClick={() => handleSort('requester')}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                    >
                      Requester
                      {getSortIcon('requester')}
                    </button>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                    <button
                      onClick={() => handleSort('department')}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                    >
                      Department
                      {getSortIcon('department')}
                    </button>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleSort('amount')}
                      className="flex items-center gap-1.5 justify-end text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors ml-auto"
                    >
                      Amount
                      {getSortIcon('amount')}
                    </button>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Type
                    </span>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Linked CA
                    </span>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Cash Released
                    </span>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Cash Received
                    </span>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Action
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedRequests.map((request, index) => (
                  <tr
                    key={request.id}
                    className={`hover:bg-slate-50 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                  >
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Select ${request.pc_number}`}
                        disabled={!isExportable(request)}
                        checked={selectedIds.has(request.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(request.id);
                            else next.delete(request.id);
                            return next;
                          });
                        }}
                        title={isExportable(request) ? 'Select for export' : 'Cannot export while cash release or receipt is pending'}
                      />
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      {request.exported_at ? (
                        <span
                          className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800"
                          title={`Exported on ${new Date(request.exported_at).toLocaleString()}`}
                        >
                          Exported
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-500">
                          Not yet
                        </span>
                      )}
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="font-mono font-bold text-sm text-slate-900 truncate block min-w-[120px]" title={request.pc_number}>
                        {request.pc_number}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3">
                      <div className="flex flex-col min-w-[180px] max-w-[250px]">
                        <span className="text-sm font-semibold text-slate-900 truncate" title={request.user_profiles?.full_name}>
                          {request.user_profiles?.full_name}
                        </span>
                        <span className="text-xs text-slate-500 truncate" title={request.user_profiles?.email}>
                          {request.user_profiles?.email}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium max-w-[140px] truncate" title={request.department || request.user_profiles?.department || 'N/A'}>
                        {request.department || request.user_profiles?.department || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-right whitespace-nowrap">
                      <span className="text-sm font-bold text-slate-900">
                        {'\u20B1'}{request.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                        request.request_type === 'For Liquidation'
                          ? 'bg-blue-100 text-blue-800'
                          : request.request_type === 'For Reimbursement'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-teal-100 text-teal-800'
                      }`}>
                        {request.request_type || 'For Cash Advance'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      {request.request_type === 'For Liquidation' ? (
                        getLinkedCashAdvancePcNumber(request) ? (
                          <span
                            className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded"
                            title="Linked cash advance request"
                          >
                            {getLinkedCashAdvancePcNumber(request)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Unlinked</span>
                        )
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      {isReleaseEligible(request) ? (
                        <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${
                          request.cash_released
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                          title={request.cash_released && request.cash_released_at ? new Date(request.cash_released_at).toLocaleString() : ''}
                        >
                          {request.cash_released ? 'Released' : 'Pending'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-500">
                          N/A
                        </span>
                      )}
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      {isReleaseEligible(request) ? (
                        <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${
                          request.received_at
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                          title={request.received_at ? new Date(request.received_at).toLocaleString() : ''}
                        >
                          {request.received_at ? 'Received' : 'Pending'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-500">
                          N/A
                        </span>
                      )}
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleViewRequest(request)}
                        className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm hover:shadow group-hover:scale-105 transform"
                        title={request.cash_released ? 'View Request' : 'Review Request'}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sortedRequests.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={itemsPerPage}
            totalItems={sortedRequests.length}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
          />
        )}
      </div>

      {showModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Release Petty Cash</h3>
                <p className="text-sm text-slate-600 mt-1">{selectedRequest.pc_number}</p>
              </div>
              <button
                onClick={() => { if (!releasing) setShowModal(false); }}
                disabled={releasing}
                className="p-2 hover:bg-slate-100 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">PC Number</label>
                  <p className="text-slate-900 font-mono">{selectedRequest.pc_number}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Company</label>
                  <p className="text-slate-900">{selectedRequest.companies?.name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Department</label>
                  <p className="text-slate-900">
                    {selectedRequest.department || selectedRequest.user_profiles?.department || 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Requester</label>
                  <p className="text-slate-900">{selectedRequest.user_profiles?.full_name}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Date</label>
                  <p className="text-slate-900">{new Date(selectedRequest.request_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">
                    {selectedRequest.request_type === 'For Cash Advance' ? 'Date Needed' : 'Transaction Date'}
                  </label>
                  <p className="text-slate-900">
                    {selectedRequest.date_of_transactions
                      ? new Date(selectedRequest.date_of_transactions).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">To / Recipient</label>
                  <p className="text-slate-900">{selectedRequest.payee || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Type</label>
                  <p className="text-slate-900">{selectedRequest.request_type || 'For Cash Advance'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Amount</label>
                  <p className="text-2xl font-bold text-green-700">{'\u20B1'}{selectedRequest.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Status</label>
                  <span className="inline-block px-3 py-1 text-xs font-bold rounded-full bg-green-100 text-green-700">
                    Approved
                  </span>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Purpose</label>
                {selectedRequest.expense_type_items && selectedRequest.expense_type_items.length > 0 ? (
                  <div className="space-y-1 mt-1">
                    {selectedRequest.expense_type_items.map((item, index) => (
                      <p key={index} className="text-slate-900">
                        {item.expense_type_name} : {item.sub_item_name}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-900">{selectedRequest.purpose}</p>
                )}
              </div>

              {selectedRequest.request_type === 'For Liquidation' && computeOverForReimbursement(selectedRequest) > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-amber-900 mb-2">Over for Reimbursement</label>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs font-medium text-amber-700">Total Expenditures</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {'\u20B1'}{computeExpensesTotal(selectedRequest).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-700">Less: Cash Advance</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {'\u20B1'}{(Number(selectedRequest.petty_cash_advance) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-700">Amount to Release</p>
                      <p className="text-lg font-bold text-amber-900">
                        {'\u20B1'}{computeOverForReimbursement(selectedRequest).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {selectedRequest.request_type === 'For Liquidation' && linkedPettyCashDetails && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Linked Petty Cash Advance Request</label>
                  <div className="bg-white rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-slate-600">PC Number</label>
                        <p className="text-sm text-slate-900 font-semibold">{linkedPettyCashDetails.pc_number}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Request Date</label>
                        <p className="text-sm text-slate-900">
                          {new Date(linkedPettyCashDetails.request_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Advance Amount</label>
                        <p className="text-sm text-slate-900 font-bold text-green-700">
                          {'\u20B1'}{linkedPettyCashDetails.amount.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Status</label>
                        <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          {linkedPettyCashDetails.status}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Purpose</label>
                      <p className="text-sm text-slate-900">{linkedPettyCashDetails.purpose}</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedRequest.no_of_pax && (
                <div>
                  <label className="text-sm font-semibold text-slate-700">No. of Pax</label>
                  <p className="text-slate-900">{selectedRequest.no_of_pax}</p>
                </div>
              )}

              {selectedRequest.expense_items && selectedRequest.expense_items.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-3">
                    Expense Itemization
                  </label>
                  <div className="overflow-x-auto border border-slate-300 rounded-lg">
                    <table className="min-w-full bg-white">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700 border-b">Date</th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700 border-b">Supplier Name & Particulars</th>
                          <th className="px-4 py-2 text-right text-sm font-semibold text-slate-700 border-b">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRequest.expense_items.map((item, index) => (
                          <tr key={index} className="border-b hover:bg-slate-50">
                            <td className="px-4 py-2 text-sm text-slate-700">
                              {item.date ? new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                            </td>
                            <td className="px-4 py-2 text-sm text-slate-700">{item.description}</td>
                            <td className="px-4 py-2 text-sm text-slate-900 text-right font-medium">{'\u20B1'}{item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-semibold border-t-2 border-slate-300">
                          <td colSpan={2} className="px-4 py-3 text-sm text-slate-700 text-right">Total Expenditures:</td>
                          <td className="px-4 py-3 text-sm text-slate-900 text-right">
                            {'\u20B1'}{selectedRequest.expense_items.reduce((sum, item) => sum + item.amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedRequest.attachments && selectedRequest.attachments.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Attachments</label>
                  <div className="space-y-2">
                    {selectedRequest.attachments.map((attachment: any, index: number) => (
                      <div key={index} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-300">
                        <div className="flex items-center gap-2">
                          <Paperclip size={18} className="text-blue-600" />
                          <span className="text-sm text-slate-700">{attachment.file_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => previewAttachment(attachment.file_path)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition"
                          >
                            <Eye size={16} />
                            Preview
                          </button>
                          <button
                            onClick={() => downloadAttachment(attachment.file_path, attachment.file_name)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                          >
                            <Download size={16} />
                            Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(selectedRequest.approved_petty_cash_pdf_path || selectedRequest.rfp_pdf_path || selectedRequest.liquidation_pdf_path) && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <label className="block text-sm font-semibold text-slate-700">Generated Forms</label>

                  {selectedRequest.approved_petty_cash_pdf_path && (
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-300">
                      <div className="flex items-center gap-2">
                        <FileText size={18} className="text-blue-600" />
                        <span className="text-sm text-slate-700">Petty Cash Form - {selectedRequest.pc_number}.pdf</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => previewGeneratedPdf(selectedRequest.approved_petty_cash_pdf_path!)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition"
                        >
                          <Eye size={16} />
                          Preview
                        </button>
                        <button
                          onClick={() => downloadGeneratedPdf(selectedRequest.approved_petty_cash_pdf_path!, `Petty_Cash_${selectedRequest.pc_number}.pdf`)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                        >
                          <Download size={16} />
                          Download
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedRequest.rfp_pdf_path && (
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-300">
                      <div className="flex items-center gap-2">
                        <FileText size={18} className="text-amber-600" />
                        <span className="text-sm text-slate-700">RFP - {selectedRequest.pc_number}.pdf</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => previewGeneratedPdf(selectedRequest.rfp_pdf_path!)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition"
                        >
                          <Eye size={16} />
                          Preview
                        </button>
                        <button
                          onClick={() => downloadGeneratedPdf(selectedRequest.rfp_pdf_path!, `RFP_${selectedRequest.pc_number}.pdf`)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition"
                        >
                          <Download size={16} />
                          Download
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedRequest.liquidation_pdf_path && (
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-300">
                      <div className="flex items-center gap-2">
                        <FileText size={18} className="text-teal-600" />
                        <span className="text-sm text-slate-700">Liquidation Report - {selectedRequest.pc_number}.pdf</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => previewGeneratedPdf(selectedRequest.liquidation_pdf_path!)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition"
                        >
                          <Eye size={16} />
                          Preview
                        </button>
                        <button
                          onClick={() => downloadGeneratedPdf(selectedRequest.liquidation_pdf_path!, `Liquidation_${selectedRequest.pc_number}.pdf`)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 transition"
                        >
                          <Download size={16} />
                          Download
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <ApprovalProgressTracker
                requestType="Petty Cash"
                requestId={selectedRequest.id}
              />

              {selectedRequest.cash_released && selectedRequest.cash_released_at && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
                  <CheckCircle size={20} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-emerald-900">Cash Released</h4>
                    <p className="text-sm text-emerald-700 mt-1">
                      Released on {new Date(selectedRequest.cash_released_at).toLocaleDateString()} at {new Date(selectedRequest.cash_released_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              )}

              {selectedRequest.received_at && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                  <CheckCircle size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-blue-900">Cash Received</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      Received on {new Date(selectedRequest.received_at).toLocaleDateString()} at {new Date(selectedRequest.received_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                {isReleaseEligible(selectedRequest) && !selectedRequest.cash_released && (
                  <button
                    onClick={handleRelease}
                    disabled={releasing}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
                  >
                    {releasing ? <Loader2 size={20} className="animate-spin" /> : <Banknote size={20} />}
                    {releasing
                      ? 'Releasing...'
                      : selectedRequest.request_type === 'For Liquidation'
                      ? 'Release Petty Cash - Over for Reimbursement'
                      : selectedRequest.request_type === 'For Reimbursement'
                      ? 'Release Petty Cash - Reimbursement'
                      : 'Release Petty Cash - Cash Advance'}
                  </button>
                )}
                <button
                  onClick={() => setShowModal(false)}
                  disabled={releasing}
                  className={`${!isReleaseEligible(selectedRequest) || selectedRequest.cash_released ? 'flex-1' : ''} px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold`}
                >
                  {!isReleaseEligible(selectedRequest) || selectedRequest.cash_released ? 'Close' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
