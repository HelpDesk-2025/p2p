import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, Eye, X, Loader2, ArrowUpDown, ArrowUp, ArrowDown, CornerDownLeft } from 'lucide-react';
import { getApprovalFlow, createApprovalLedgerEntry, sendApprovalEmail, sendApprovalEmailToAll, createRejectedLedgerEntries, ApprovalFlow } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
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

interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_name: string;
  vendor_address: string;
  vendor_contact: string;
  vendor_email: string;
  vendor_tin: string;
  vendor_bank_name: string;
  vendor_bank_account: string;
  vendor_bank_address: string;
  department: string;
  total_amount: number;
  budget_status: 'within_budget' | 'over_budget' | 'no_budget';
  status: POStatus;
  current_approver_id: string | null;
  current_approval_level: number;
  po_date: string;
  expected_delivery_date: string | null;
  delivery_address: string;
  payment_terms: string;
  delivery_terms: string;
  remarks: string;
  subtotal: number;
  vat_amount: number;
  pr_id: string | null;
  canvass_request_id: string | null;
  company_id: string | null;
  prepared_by: string | null;
  created_at: string;
  user_profiles?: { full_name: string; email: string } | null;
  companies?: { id: string; name: string } | null;
}

interface POItem {
  id: string;
  item_description: string;
  unit_of_measure: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  ewt_amount: number;
  remarks: string;
}

export function POApproval() {
  const { user, profile, actualProfile, permissions } = useAuth();
  const [requests, setRequests] = useState<PurchaseOrder[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PurchaseOrder | null>(null);
  const [items, setItems] = useState<POItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [returning, setReturning] = useState(false);
  const [flowsLoading, setFlowsLoading] = useState(false);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlow[]>([]);
  const [currentApproverStep, setCurrentApproverStep] = useState<ApprovalFlow | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  useEffect(() => {
    loadRequests();
  }, [user, profile?.id, actualProfile?.role, permissions?.hasFullAccess]);

  const loadRequests = async () => {
    if (!profile?.id || !user) return;
    setListLoading(true);

    try {
      let ids: string[] = [];
      const isAdmin = actualProfile?.role === 'admin' || profile.role === 'admin' || permissions?.hasFullAccess;

      if (isAdmin) {
        const { data: poRows } = await supabase
          .from('purchase_orders')
          .select('id')
          .eq('status', 'pending_approval')
          .is('deleted_at', null);
        ids = (poRows || []).map((r) => r.id);
      } else {
        const { data: idRows, error: rpcError } = await supabase.rpc('get_my_pending_approval_ids', {
          p_request_type: 'Purchase Order',
          p_user_id: profile.id,
        });

        if (rpcError) {
          console.error('RPC error loading PO approval IDs:', rpcError);
          setRequests([]);
          setListLoading(false);
          return;
        }

        ids = (idRows || []).map((r: { request_id: string }) => r.request_id);
      }

      if (ids.length === 0) {
        setRequests([]);
        setListLoading(false);
        return;
      }

      const { data } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          companies:company_id (id, name)
        `)
        .in('id', ids)
        .order('created_at', { ascending: false });

      const poList = (data || []) as PurchaseOrder[];

      const preparerIds = [...new Set(poList.map(p => p.prepared_by).filter(Boolean))] as string[];
      if (preparerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, full_name, email')
          .in('id', preparerIds);
        if (profiles) {
          const profileMap = new Map(profiles.map(p => [p.id, p]));
          poList.forEach(po => {
            if (po.prepared_by && profileMap.has(po.prepared_by)) {
              const prof = profileMap.get(po.prepared_by)!;
              po.user_profiles = { full_name: prof.full_name, email: prof.email };
            }
          });
        }
      }

      setRequests(poList);
    } catch (error) {
      console.error('Error loading PO approvals:', error);
      setRequests([]);
    }
    setListLoading(false);
  };

  const handleViewRequest = async (po: PurchaseOrder) => {
    setSelectedRequest(po);
    setShowModal(true);
    setComments('');
    setFlowsLoading(true);

    const { data: itemRows } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', po.id);
    setItems((itemRows || []) as POItem[]);

    if (po.company_id && po.department) {
      try {
        const flows = await getApprovalFlow(
          po.company_id,
          po.department,
          'Purchase Order',
          false,
          Number(po.total_amount)
        );
        setApprovalFlows(flows);

        const level = po.current_approval_level;
        setCurrentApproverStep(flows[level] || null);
      } catch (error) {
        console.error('Error loading approval flow:', error);
        setApprovalFlows([]);
        setCurrentApproverStep(null);
      }
    }
    setFlowsLoading(false);
  };

  const canApprove = (): boolean => {
    if (!profile) return false;
    if (actualProfile?.role === 'admin' || profile.role === 'admin' || permissions?.hasFullAccess) return true;
    if (!currentApproverStep) return false;
    if (currentApproverStep.user_id === profile.id) return true;
    if (currentApproverStep.alternate_approver_id === profile.id) return true;
    return true;
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

  const sortedRequests = useMemo(() => {
    return [...requests].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case 'po_number':
          aVal = a.po_number;
          bVal = b.po_number;
          break;
        case 'vendor_name':
          aVal = a.vendor_name;
          bVal = b.vendor_name;
          break;
        case 'department':
          aVal = a.department;
          bVal = b.department;
          break;
        case 'total_amount':
          aVal = Number(a.total_amount);
          bVal = Number(b.total_amount);
          break;
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [requests, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sortedRequests.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedRequests = sortedRequests.slice(startIndex, startIndex + itemsPerPage);

  const handlePageChange = (page: number) => setCurrentPage(page);
  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const handleAction = async (action: 'approved' | 'rejected') => {
    if (!selectedRequest || !profile || !user) return;

    if (!canApprove()) {
      alert('You are not authorized to approve this request at this level.');
      return;
    }

    if (action === 'rejected' && !comments.trim()) {
      alert('Please provide a comment explaining the reason for rejection.');
      return;
    }

    const actionText = action === 'approved' ? 'approve' : 'reject';
    if (!confirm(`Are you sure you want to ${actionText} this Purchase Order (${selectedRequest.po_number})?`)) return;

    if (action === 'approved') setApproving(true);
    else setRejecting(true);
    setLoading(true);

    try {
      const currentLevel = selectedRequest.current_approval_level;
      const nextLevel = currentLevel + 1;
      const isLastApproval = nextLevel >= approvalFlows.length;

      if (action === 'rejected') {
        await supabase
          .from('purchase_orders')
          .update({
            status: 'rejected',
            current_approver_id: null,
            rejected_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq('id', selectedRequest.id);

        await createApprovalLedgerEntry(
          'Purchase Order',
          selectedRequest.id,
          selectedRequest.po_number,
          profile.id,
          profile.full_name || 'Unknown',
          currentApproverStep?.approver_type || 'Approver',
          'Rejected',
          comments,
          currentLevel + 1,
          currentApproverStep?.for_checking || false
        );

        await createRejectedLedgerEntries(
          'Purchase Order',
          selectedRequest.id,
          selectedRequest.po_number,
          approvalFlows,
          currentLevel,
          selectedRequest.company_id || '',
          selectedRequest.department
        );

        if (selectedRequest.user_profiles?.email) {
          await sendApprovalEmail(
            selectedRequest.user_profiles.email,
            selectedRequest.user_profiles.full_name || 'User',
            'Purchase Order',
            selectedRequest.po_number,
            selectedRequest.user_profiles.full_name || 'Unknown',
            selectedRequest.department,
            Number(selectedRequest.total_amount),
            'Rejected',
            profile.full_name || 'Unknown',
            comments
          );
        }
      } else if (action === 'approved') {
        const newStatus = isLastApproval ? 'approved' : 'pending_approval';
        const updatePayload: any = {
          status: newStatus,
          current_approval_level: nextLevel,
          updated_by: user.id,
        };
        if (isLastApproval) {
          updatePayload.approved_at = new Date().toISOString();
          updatePayload.current_approver_id = null;
        }

        await supabase
          .from('purchase_orders')
          .update(updatePayload)
          .eq('id', selectedRequest.id);

        await createApprovalLedgerEntry(
          'Purchase Order',
          selectedRequest.id,
          selectedRequest.po_number,
          profile.id,
          profile.full_name || 'Unknown',
          currentApproverStep?.approver_type || 'Approver',
          'Approved',
          comments,
          currentLevel + 1,
          currentApproverStep?.for_checking || false
        );

        if (!isLastApproval) {
          const nextApprover = approvalFlows[nextLevel];
          if (nextApprover && selectedRequest.company_id) {
            await sendApprovalEmailToAll(
              nextApprover,
              selectedRequest.company_id,
              selectedRequest.department,
              'Purchase Order',
              selectedRequest.po_number,
              selectedRequest.user_profiles?.full_name || 'Unknown',
              Number(selectedRequest.total_amount),
              'Approved',
              profile.full_name || 'Unknown',
              comments,
              nextApprover.approver_type
            );
          }
        } else {
          if (selectedRequest.user_profiles?.email) {
            await sendApprovalEmail(
              selectedRequest.user_profiles.email,
              selectedRequest.user_profiles.full_name || 'User',
              'Purchase Order',
              selectedRequest.po_number,
              selectedRequest.user_profiles.full_name || 'Unknown',
              selectedRequest.department,
              Number(selectedRequest.total_amount),
              'Fully Approved',
              profile.full_name || 'Unknown',
              comments
            );
          }
        }
      }

      setShowModal(false);
      setSelectedRequest(null);
      setComments('');
      loadRequests();
    } catch (error: any) {
      console.error('Error processing approval:', error);
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
      setApproving(false);
      setRejecting(false);
    }
  };

  const handleReturnToMaker = async () => {
    if (!selectedRequest || !profile || !user) return;

    if (!canApprove()) {
      alert('You are not authorized to perform this action at this level.');
      return;
    }

    if (!comments.trim()) {
      alert('Please provide a comment explaining the reason for returning this request.');
      return;
    }

    if (!confirm(`Are you sure you want to return this Purchase Order (${selectedRequest.po_number}) to the maker for revision?`)) return;

    setReturning(true);
    setLoading(true);

    try {
      const currentLevel = selectedRequest.current_approval_level;

      await supabase
        .from('purchase_orders')
        .update({
          status: 'returned',
          current_approver_id: null,
          updated_by: user.id,
        })
        .eq('id', selectedRequest.id);

      await createApprovalLedgerEntry(
        'Purchase Order',
        selectedRequest.id,
        selectedRequest.po_number,
        profile.id,
        profile.full_name || 'Unknown',
        currentApproverStep?.approver_type || 'Checker',
        'Returned',
        comments,
        currentLevel + 1,
        currentApproverStep?.for_checking || false
      );

      if (selectedRequest.user_profiles?.email) {
        await sendApprovalEmail(
          selectedRequest.user_profiles.email,
          selectedRequest.user_profiles.full_name || 'User',
          'Purchase Order',
          selectedRequest.po_number,
          selectedRequest.user_profiles.full_name || 'Unknown',
          selectedRequest.department,
          Number(selectedRequest.total_amount),
          'Returned to Maker',
          profile.full_name || 'Unknown',
          comments
        );
      }

      setShowModal(false);
      setSelectedRequest(null);
      setComments('');
      loadRequests();
    } catch (error: any) {
      console.error('Error returning request to maker:', error);
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
      setReturning(false);
    }
  };

  return (
    <div className="space-y-4 lg:space-y-6 h-full">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl lg:text-2xl font-bold text-slate-900">Purchase Order Approvals</h2>
            <p className="text-slate-600 mt-1 text-sm lg:text-base">Review and approve purchase orders</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg">
            <span className="text-sm font-medium text-slate-600">Pending:</span>
            <span className="text-lg font-bold text-blue-600">{requests.length}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {listLoading ? (
          <div className="overflow-auto flex-1">
            <table className="w-full hidden lg:table">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  {['PO NUMBER', 'VENDOR', 'COMPANY', 'DEPARTMENT', 'DATE', 'AMOUNT', 'LEVEL', 'ACTION'].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-28 mb-1"/><div className="h-3 bg-slate-100 rounded w-20"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-36 mb-1"/><div className="h-3 bg-slate-100 rounded w-44"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-28"/></td>
                    <td className="py-3 px-4"><div className="h-6 bg-slate-200 rounded-full w-28"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-20"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-24"/></td>
                    <td className="py-3 px-4"><div className="h-6 bg-slate-200 rounded w-10"/></td>
                    <td className="py-3 px-4"><div className="h-8 bg-slate-200 rounded w-8"/></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="lg:hidden divide-y divide-slate-200">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 animate-pulse space-y-3">
                  <div className="flex justify-between">
                    <div className="h-4 bg-slate-200 rounded w-28"/>
                    <div className="h-6 bg-slate-200 rounded w-10"/>
                  </div>
                  <div className="h-3 bg-slate-100 rounded w-40"/>
                  <div className="h-3 bg-slate-100 rounded w-24"/>
                </div>
              ))}
            </div>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600">No pending approvals</p>
          </div>
        ) : (
          <>
            {/* Mobile Card Layout */}
            <div className="lg:hidden overflow-auto flex-1">
              <div className="divide-y divide-slate-200">
                {paginatedRequests.map((po) => (
                  <div key={po.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">PO Number</div>
                          <div className="font-mono font-bold text-base text-slate-900 truncate">{po.po_number}</div>
                        </div>
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-semibold whitespace-nowrap">
                          Level {po.current_approval_level + 1}
                        </span>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Vendor</div>
                        <div className="text-sm font-semibold text-slate-900">{po.vendor_name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{po.companies?.name || '—'}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                        <div>
                          <div className="text-xs font-medium text-slate-500 mb-1">Department</div>
                          <div className="text-sm text-slate-900 truncate">{po.department || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500 mb-1">Amount</div>
                          <div className="text-sm font-bold text-slate-900">
                            ₱{Number(po.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleViewRequest(po)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                      >
                        <Eye className="w-4 h-4" />
                        Review Request
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Desktop Table Layout */}
            <div className="hidden lg:block overflow-auto flex-1">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200 z-10">
                  <tr>
                    <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                      <button onClick={() => handleSort('po_number')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                        PO Number {getSortIcon('po_number')}
                      </button>
                    </th>
                    <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                      <button onClick={() => handleSort('vendor_name')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                        Vendor {getSortIcon('vendor_name')}
                      </button>
                    </th>
                    <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Company</span>
                    </th>
                    <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                      <button onClick={() => handleSort('department')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                        Department {getSortIcon('department')}
                      </button>
                    </th>
                    <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                      <button onClick={() => handleSort('created_at')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                        Date {getSortIcon('created_at')}
                      </button>
                    </th>
                    <th className="px-3 xl:px-4 py-3.5 text-right whitespace-nowrap">
                      <button onClick={() => handleSort('total_amount')} className="flex items-center gap-1.5 justify-end text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors ml-auto">
                        Amount {getSortIcon('total_amount')}
                      </button>
                    </th>
                    <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Level</span>
                    </th>
                    <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRequests.map((po, index) => (
                    <tr
                      key={po.id}
                      className={`hover:bg-slate-50 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                    >
                      <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-sm text-slate-900">{po.po_number}</span>
                      </td>
                      <td className="px-3 xl:px-4 py-3">
                        <div className="flex flex-col min-w-[150px] max-w-[220px]">
                          <span className="text-sm font-semibold text-slate-900 truncate" title={po.vendor_name}>{po.vendor_name}</span>
                          <span className="text-xs text-slate-500 truncate" title={po.vendor_email}>{po.vendor_email || '—'}</span>
                        </div>
                      </td>
                      <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-slate-700">{po.companies?.name || '—'}</span>
                      </td>
                      <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium max-w-[140px] truncate" title={po.department}>
                          {po.department || '—'}
                        </span>
                      </td>
                      <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-slate-700">
                          {new Date(po.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </td>
                      <td className="px-3 xl:px-4 py-3 text-right whitespace-nowrap">
                        <span className="text-sm font-bold text-slate-900">
                          ₱{Number(po.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center justify-center px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-bold">
                          L{po.current_approval_level + 1}
                        </span>
                      </td>
                      <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleViewRequest(po)}
                          className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm hover:shadow group-hover:scale-105 transform"
                          title="Review Request"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sortedRequests.length > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                itemsPerPage={itemsPerPage}
                totalItems={sortedRequests.length}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            )}
          </>
        )}
      </div>

      {showModal && selectedRequest && (() => {
        const fmtMoney = (n: number) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const ewtTotal = items.reduce((sum, it) => sum + Number(it.ewt_amount || 0), 0);
        const netOfVat = Number(selectedRequest.subtotal);
        const vat12 = Number(selectedRequest.vat_amount);
        const netPayable = Number(selectedRequest.total_amount);

        const budgetLabel = selectedRequest.budget_status === 'within_budget' ? 'Within Budget'
          : selectedRequest.budget_status === 'over_budget' ? 'Over Budget' : 'No Budget Allocated';
        const budgetColor = selectedRequest.budget_status === 'within_budget' ? 'text-green-700 bg-green-50 border-green-200'
          : selectedRequest.budget_status === 'over_budget' ? 'text-red-700 bg-red-50 border-red-200' : 'text-amber-700 bg-amber-50 border-amber-200';
        const statusLabel = selectedRequest.status === 'pending_approval' ? 'Pending Approval'
          : selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1).replace(/_/g, ' ');
        const statusColor = selectedRequest.status === 'pending_approval' ? 'text-amber-700 bg-amber-50 border-amber-200'
          : selectedRequest.status === 'approved' ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200';

        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Review Purchase Order</h3>
                  <p className="text-sm text-slate-600 mt-1">{selectedRequest.po_number}</p>
                </div>
                <button
                  onClick={() => { if (!loading) setShowModal(false); }}
                  disabled={loading}
                  className="p-2 hover:bg-slate-100 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-5">
                {/* Header: PO Number + Status Badges */}
                <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 font-mono">{selectedRequest.po_number}</h4>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusColor}`}>
                          {statusLabel}
                        </span>
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${budgetColor}`}>
                          {budgetLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Two-column: Vendor + PO Details */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Vendor Card */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                      <h5 className="text-sm font-bold text-blue-700">Vendor</h5>
                    </div>
                    <div className="divide-y divide-slate-100">
                      <DetailRow label="Name" value={selectedRequest.vendor_name} />
                      <DetailRow label="Address" value={selectedRequest.vendor_address || '—'} />
                      <DetailRow label="Contact" value={selectedRequest.vendor_contact || '—'} />
                      <DetailRow label="Email" value={selectedRequest.vendor_email || '—'} />
                      <DetailRow label="TIN" value={selectedRequest.vendor_tin || '—'} />
                      <DetailRow label="Bank Name" value={selectedRequest.vendor_bank_name || '—'} />
                      <DetailRow label="Bank Account" value={selectedRequest.vendor_bank_account || '—'} />
                      <DetailRow label="Bank Address" value={selectedRequest.vendor_bank_address || '—'} />
                    </div>
                  </div>

                  {/* PO Details Card */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                      <h5 className="text-sm font-bold text-blue-700">PO Details</h5>
                    </div>
                    <div className="divide-y divide-slate-100">
                      <DetailRow label="Company" value={selectedRequest.companies?.name || '—'} />
                      <DetailRow label="Department" value={selectedRequest.department || '—'} />
                      <DetailRow label="Prepared By" value={selectedRequest.user_profiles?.full_name || '—'} />
                      <DetailRow label="PO Date" value={selectedRequest.po_date || '—'} />
                      <DetailRow label="Expected Delivery" value={selectedRequest.expected_delivery_date || '—'} />
                      <DetailRow label="Delivery Address" value={selectedRequest.delivery_address || '—'} />
                      <DetailRow label="Payment Terms" value={selectedRequest.payment_terms || '—'} />
                      <DetailRow label="Delivery Terms" value={selectedRequest.delivery_terms || '—'} />
                      {selectedRequest.remarks && <DetailRow label="Remarks" value={selectedRequest.remarks} />}
                    </div>
                  </div>
                </div>

                {/* Line Items */}
                {items.length > 0 && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                      <h5 className="text-sm font-bold text-blue-700">Line Items</h5>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Description</th>
                            <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">UOM</th>
                            <th className="px-4 py-2.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Qty</th>
                            <th className="px-4 py-2.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Unit Price</th>
                            <th className="px-4 py-2.5 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-2.5 text-sm text-slate-900">{item.item_description}</td>
                              <td className="px-4 py-2.5 text-sm text-slate-600">{item.unit_of_measure}</td>
                              <td className="px-4 py-2.5 text-sm text-slate-700 text-right tabular-nums">{Number(item.quantity).toFixed(2)}</td>
                              <td className="px-4 py-2.5 text-sm text-slate-700 text-right tabular-nums">{fmtMoney(Number(item.unit_price))}</td>
                              <td className="px-4 py-2.5 text-sm text-slate-900 font-medium text-right tabular-nums">{fmtMoney(Number(item.total_price))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Totals Summary */}
                    <div className="border-t border-slate-200 px-4 py-3">
                      <div className="flex flex-col items-end space-y-1">
                        <div className="flex items-center gap-8 text-sm">
                          <span className="text-blue-600 font-medium">Net of VAT</span>
                          <span className="text-slate-900 tabular-nums font-medium">{fmtMoney(netOfVat)}</span>
                        </div>
                        <div className="flex items-center gap-8 text-sm">
                          <span className="text-blue-600 font-medium">VAT (12%)</span>
                          <span className="text-slate-900 tabular-nums font-medium">{fmtMoney(vat12)}</span>
                        </div>
                        {ewtTotal > 0 && (
                          <div className="flex items-center gap-8 text-sm">
                            <span className="text-blue-600 font-medium">EWT</span>
                            <span className="text-slate-900 tabular-nums font-medium">{fmtMoney(ewtTotal)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-8 text-sm pt-1 border-t border-slate-200 mt-1">
                          <span className="text-slate-900 font-bold">Net Payable</span>
                          <span className="text-slate-900 tabular-nums font-bold">{fmtMoney(netPayable)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedRequest.company_id && (
                  <ApprovalProgressTracker
                    requestType="Purchase Order"
                    requestId={selectedRequest.id}
                    requestNumber={selectedRequest.po_number}
                    companyId={selectedRequest.company_id}
                    department={selectedRequest.department}
                  />
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Comments</label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Add your comments here..."
                  />
                </div>

                {!canApprove() && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm text-amber-800">
                      You are not authorized to approve this request at the current approval level.
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-200">
                  <button
                    onClick={() => handleAction('approved')}
                    disabled={loading || flowsLoading || !canApprove()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold text-sm sm:text-base"
                  >
                    {approving ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : flowsLoading ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
                    {approving ? 'Approving...' : flowsLoading ? 'Loading...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleAction('rejected')}
                    disabled={loading || flowsLoading || !canApprove()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold text-sm sm:text-base"
                  >
                    {rejecting ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : flowsLoading ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
                    {rejecting ? 'Rejecting...' : flowsLoading ? 'Loading...' : 'Reject'}
                  </button>
                  <button
                    onClick={handleReturnToMaker}
                    disabled={loading || flowsLoading || !canApprove()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold text-sm sm:text-base"
                  >
                    {returning ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <CornerDownLeft className="w-4 h-4 sm:w-5 sm:h-5" />}
                    {returning ? 'Returning...' : 'Return to Maker'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm text-slate-900 font-medium text-right max-w-[60%] truncate" title={value}>{value}</span>
    </div>
  );
}
