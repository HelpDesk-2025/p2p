import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, XCircle, Clock, Search, Filter, ChevronDown, FileText, ArrowUp, ArrowDown, Eye } from 'lucide-react';
import Pagination from './Pagination';

interface ApprovalRecord {
  id: string;
  request_id: string;
  request_type: string;
  request_number: string;
  approver_id: string;
  approver_name: string;
  action: string;
  comments: string;
  approval_date: string;
  sequence: number;
  created_at: string;
  for_checking?: boolean;
}

interface RequestSummary {
  request_id: string;
  request_type: string;
  request_number: string;
  final_status: string;
  latest_action_date: string;
  requester_name?: string;
  description?: string;
  total_amount?: number;
  my_actions: string[];
  records: ApprovalRecord[];
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  pr: 'Purchase Requisition',
  canvass: 'Canvass',
  petty_cash: 'Petty Cash',
  cash_advance: 'Cash Advance',
  reimbursement: 'Reimbursement',
  sme: 'SME',
};

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  pending: 'bg-amber-100 text-amber-800',
  returned: 'bg-orange-100 text-orange-800',
};

export function ApprovedRejected() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [summaries, setSummaries] = useState<RequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [sortColumn, setSortColumn] = useState('latest_action_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) {
      loadRecords();
    }
  }, [profile?.id]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('approval_ledger')
        .select('*')
        .eq('approver_id', profile!.id)
        .neq('action', 'Submitted')
        .order('approval_date', { ascending: false });

      if (error) throw error;

      const allRecords: ApprovalRecord[] = data || [];
      setRecords(allRecords);

      const grouped: Record<string, ApprovalRecord[]> = {};
      for (const rec of allRecords) {
        const key = `${rec.request_type}__${rec.request_id}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(rec);
      }

      const built: RequestSummary[] = Object.entries(grouped).map(([, recs]) => {
        const sorted = [...recs].sort(
          (a, b) => new Date(b.approval_date || b.created_at).getTime() - new Date(a.approval_date || a.created_at).getTime()
        );
        const latest = sorted[0];
        const actions = recs.map((r) => r.action).filter(Boolean);

        let finalStatus = 'pending';
        if (actions.includes('Rejected')) finalStatus = 'rejected';
        else if (actions.includes('Approved')) finalStatus = 'approved';
        else if (actions.includes('Returned')) finalStatus = 'returned';

        return {
          request_id: latest.request_id,
          request_type: latest.request_type,
          request_number: latest.request_number,
          final_status: finalStatus,
          latest_action_date: latest.approval_date || latest.created_at,
          my_actions: [...new Set(actions)],
          records: sorted,
        };
      });

      setSummaries(built);
    } catch (err) {
      console.error('Error loading approved/rejected records:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowUp size={13} className="text-slate-400" />;
    return sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  const filtered = summaries.filter((s) => {
    const matchSearch =
      !searchTerm ||
      s.request_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = filterType === 'all' || s.request_type === filterType;
    const matchAction =
      filterAction === 'all' ||
      (filterAction === 'approved' && s.my_actions.includes('Approved')) ||
      (filterAction === 'rejected' && s.my_actions.includes('Rejected')) ||
      (filterAction === 'returned' && s.my_actions.includes('Returned'));
    return matchSearch && matchType && matchAction;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal: any = a[sortColumn as keyof RequestSummary];
    let bVal: any = b[sortColumn as keyof RequestSummary];
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

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginated = sorted.slice(startIndex, startIndex + itemsPerPage);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const approvedCount = summaries.filter((s) => s.my_actions.includes('Approved')).length;
  const rejectedCount = summaries.filter((s) => s.my_actions.includes('Rejected')).length;
  const returnedCount = summaries.filter((s) => s.my_actions.includes('Returned')).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Approved & Rejected</h1>
        <p className="text-sm text-slate-500 mt-1">All requests you have been involved in as an approver</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle size={20} className="text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{approvedCount}</p>
            <p className="text-sm text-slate-500">Approved</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <XCircle size={20} className="text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{rejectedCount}</p>
            <p className="text-sm text-slate-500">Rejected</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Clock size={20} className="text-orange-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{returnedCount}</p>
            <p className="text-sm text-slate-500">Returned</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by request number..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="relative">
            <Filter size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
              className="pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
            >
              <option value="all">All Types</option>
              {Object.entries(REQUEST_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white pr-8"
            >
              <option value="all">All Actions</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="returned">Returned</option>
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading records...
          </div>
        ) : paginated.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <FileText size={24} className="text-slate-400" />
            </div>
            <p className="text-slate-700 font-medium">No records found</p>
            <p className="text-sm text-slate-500 mt-1">You have not acted on any requests yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort('request_number')}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                    >
                      Request No. {getSortIcon('request_number')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort('request_type')}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                    >
                      Type {getSortIcon('request_type')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">My Action(s)</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort('latest_action_date')}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                    >
                      Last Action Date {getSortIcon('latest_action_date')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((summary) => {
                  const rowKey = `${summary.request_type}__${summary.request_id}`;
                  const isExpanded = expandedRow === rowKey;
                  return (
                    <>
                      <tr
                        key={rowKey}
                        className={`hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-blue-50/40' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-900">{summary.request_number || '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-600">
                            {REQUEST_TYPE_LABELS[summary.request_type] || summary.request_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {summary.my_actions.map((action) => (
                              <span
                                key={action}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                  STATUS_COLORS[action.toLowerCase()] || 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {action === 'Approved' && <CheckCircle size={11} />}
                                {action === 'Rejected' && <XCircle size={11} />}
                                {action === 'Returned' && <Clock size={11} />}
                                {action}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDate(summary.latest_action_date)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Eye size={13} />
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${rowKey}-expanded`} className="bg-slate-50">
                          <td colSpan={5} className="px-4 py-4">
                            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                  Approval History — {summary.request_number}
                                </p>
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-slate-100">
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Sequence</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Approver</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Action</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Date & Time</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Comments</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {summary.records.map((rec) => (
                                    <tr
                                      key={rec.id}
                                      className={rec.approver_id === profile?.id ? 'bg-blue-50/60' : ''}
                                    >
                                      <td className="px-4 py-2.5 text-slate-500 text-center w-20">{rec.sequence}</td>
                                      <td className="px-4 py-2.5">
                                        <span className={`font-medium ${rec.approver_id === profile?.id ? 'text-blue-700' : 'text-slate-700'}`}>
                                          {rec.approver_name}
                                          {rec.approver_id === profile?.id && (
                                            <span className="ml-1.5 text-xs font-normal text-blue-500">(you)</span>
                                          )}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <span
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                            STATUS_COLORS[rec.action?.toLowerCase()] || 'bg-slate-100 text-slate-700'
                                          }`}
                                        >
                                          {rec.action === 'Approved' && <CheckCircle size={11} />}
                                          {rec.action === 'Rejected' && <XCircle size={11} />}
                                          {rec.action}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5 text-slate-500 text-xs">
                                        {formatDateTime(rec.approval_date || rec.created_at)}
                                      </td>
                                      <td className="px-4 py-2.5 text-slate-600 text-xs max-w-xs">
                                        {rec.comments || '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sorted.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sorted.length}
          itemsPerPage={itemsPerPage}
          onPageChange={(page) => setCurrentPage(page)}
          onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
        />
      )}
    </div>
  );
}
