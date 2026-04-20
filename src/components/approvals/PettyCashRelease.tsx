import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, Eye, X, Loader2, Download, Paperclip, ArrowUpDown, ArrowUp, ArrowDown, Banknote } from 'lucide-react';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import Pagination from '../Pagination';

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
  attachments?: Array<{
    file_name: string;
    file_path: string;
    file_type: string;
  }>;
  approved_petty_cash_pdf_path?: string;
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
      let query = supabase
        .from('petty_cash_requests')
        .select(`
          *,
          user_profiles:requester_id (full_name, email, company_id, department, e_sig),
          companies!petty_cash_requests_company_id_fkey (id, name)
        `)
        .eq('status', 'approved')
        .eq('request_type', 'For Cash Advance')
        .order('created_at', { ascending: false });

      if (profile.role !== 'admin') {
        query = query.eq('company_id', profile.company_id);
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

  const handleViewRequest = (request: PettyCashReq) => {
    setSelectedRequest(request);
    setShowModal(true);
  };

  const handleRelease = async () => {
    if (!selectedRequest || !profile) return;

    if (!confirm(`Are you sure you want to release Petty Cash ${selectedRequest.pc_number} (${'\u20B1'}${selectedRequest.amount.toLocaleString()}) to ${selectedRequest.payee || selectedRequest.user_profiles?.full_name || 'the requester'}?`)) {
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

  const sortedRequests = [...requests].sort((a, b) => {
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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Petty Cash Release</h2>
        <p className="text-slate-600 mt-1">Release approved cash advance petty cash requests to requesters</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {listLoading ? (
          <div className="overflow-auto flex-1">
            <table className="w-full hidden lg:table">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  {['PC NO.', 'REQUESTER', 'DEPARTMENT', 'AMOUNT', 'TYPE', 'CASH RELEASED', 'CASH RECEIVED', 'ACTION'].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-28 mb-1"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-36 mb-1"/><div className="h-3 bg-slate-100 rounded w-44"/></td>
                    <td className="py-3 px-4"><div className="h-6 bg-slate-200 rounded-full w-28"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-40"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-20"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-24"/></td>
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
            <p className="text-slate-600">No approved cash advance requests found</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200 z-10">
                <tr>
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
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-teal-100 text-teal-800 text-xs font-medium">
                        {request.request_type || 'For Cash Advance'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${
                        request.cash_released
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                        title={request.cash_released && request.cash_released_at ? new Date(request.cash_released_at).toLocaleString() : ''}
                      >
                        {request.cash_released ? 'Released' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${
                        request.received_at
                          ? 'bg-green-100 text-green-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                        title={request.received_at ? new Date(request.received_at).toLocaleString() : ''}
                      >
                        {request.received_at ? 'Received' : 'Pending'}
                      </span>
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
                  <label className="text-sm font-semibold text-slate-700">Date of Transactions</label>
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
                {!selectedRequest.cash_released && (
                  <button
                    onClick={handleRelease}
                    disabled={releasing}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
                  >
                    {releasing ? <Loader2 size={20} className="animate-spin" /> : <Banknote size={20} />}
                    {releasing ? 'Releasing...' : 'Release Petty Cash'}
                  </button>
                )}
                <button
                  onClick={() => setShowModal(false)}
                  disabled={releasing}
                  className={`${selectedRequest.cash_released ? 'flex-1' : ''} px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold`}
                >
                  {selectedRequest.cash_released ? 'Close' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
