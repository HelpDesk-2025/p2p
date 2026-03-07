import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckCircle, XCircle, Search, Filter, ChevronDown,
  FileText, ArrowUp, ArrowDown, Eye, X, Download
} from 'lucide-react';
import Pagination from './Pagination';
import { ApprovalProgressTracker } from './ApprovalProgressTracker';
import { downloadAttachment } from '../lib/storageHelper';

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
}

interface RequestSummary {
  request_id: string;
  request_type: string;
  request_number: string;
  latest_action_date: string;
  my_actions: string[];
  records: ApprovalRecord[];
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  pr: 'Purchase Requisition',
  'Purchase Requisition': 'Purchase Requisition',
  canvass: 'Canvass',
  Canvass: 'Canvass',
  petty_cash: 'Petty Cash',
  'Petty Cash': 'Petty Cash',
  cash_advance: 'Cash Advance',
  'Cash Advance': 'Cash Advance',
  reimbursement: 'Reimbursement',
  Reimbursement: 'Reimbursement',
  sme: 'SME',
  SME: 'SME',
};

const REQUEST_TYPE_TABLE: Record<string, string> = {
  'Purchase Requisition': 'purchase_requisitions',
  'Canvass': 'canvass_requests',
  'Petty Cash': 'petty_cash_requests',
  'Cash Advance': 'cash_advance_requests',
  'Reimbursement': 'reimbursement_requests',
};

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  returned: 'bg-orange-100 text-orange-800',
  checked: 'bg-blue-100 text-blue-800',
};

export function ApprovedRejected() {
  const { profile } = useAuth();
  const [summaries, setSummaries] = useState<RequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [sortColumn, setSortColumn] = useState('latest_action_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<RequestSummary | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('');

  useEffect(() => {
    if (profile?.id) loadRecords();
  }, [profile?.id]);

  const isAdmin = profile?.role === 'admin';

  const loadRecords = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('approval_ledger')
        .select('*')
        .neq('action', 'Submitted')
        .order('approval_date', { ascending: false });

      if (!isAdmin) {
        query = query.eq('approver_id', profile!.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const allRecords: ApprovalRecord[] = data || [];
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
        return {
          request_id: latest.request_id,
          request_type: latest.request_type,
          request_number: latest.request_number,
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

  const handleViewDetails = async (summary: RequestSummary) => {
    setSelectedSummary(summary);
    setShowDetailModal(true);
    setDetailData(null);
    setDetailLoading(true);

    const table = REQUEST_TYPE_TABLE[summary.request_type];
    if (!table) {
      setDetailLoading(false);
      return;
    }

    try {
      let query = supabase.from(table).select(`
        *,
        user_profiles:requester_id (full_name, email, department),
        companies (name)
      `).eq('id', summary.request_id).maybeSingle();

      const { data, error } = await query;
      if (error) throw error;
      setDetailData(data);
    } catch (err) {
      console.error('Error loading request details:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedSummary(null);
    setDetailData(null);
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    setPdfPreviewUrl(null);
    setShowPdfPreview(false);
  };

  const handlePreviewPdf = async (pdfPath: string, title: string) => {
    try {
      const { data, error } = await supabase.storage.from('attachments').download(pdfPath);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      setPdfPreviewUrl(url);
      setPdfPreviewTitle(title);
      setShowPdfPreview(true);
    } catch {
      alert('Failed to load PDF preview');
    }
  };

  const handleDownloadPdf = async (pdfPath: string, fileName: string) => {
    try {
      const blob = await downloadAttachment(pdfPath);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download PDF');
    }
  };

  const closePdfPreview = () => {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    setPdfPreviewUrl(null);
    setShowPdfPreview(false);
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
      s.request_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = filterType === 'all' || s.request_type === filterType;
    const matchAction =
      filterAction === 'all' ||
      (filterAction === 'approved' && s.my_actions.includes('Approved')) ||
      (filterAction === 'rejected' && s.my_actions.includes('Rejected'));
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
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const approvedCount = summaries.filter((s) => s.my_actions.includes('Approved')).length;
  const rejectedCount = summaries.filter((s) => s.my_actions.includes('Rejected')).length;

  const uniqueTypes = [...new Set(summaries.map((s) => s.request_type))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Approved & Rejected</h1>
        <p className="text-sm text-slate-500 mt-1">{isAdmin ? 'All approved and rejected requests across the system' : 'All requests you have been involved in as an approver'}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>{REQUEST_TYPE_LABELS[t] || t}</option>
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
            <p className="text-sm text-slate-500 mt-1">{isAdmin ? 'No approved or rejected requests in the system yet' : 'You have not acted on any requests yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleSort('request_number')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                      Request No. {getSortIcon('request_number')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleSort('request_type')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                      Type {getSortIcon('request_type')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{isAdmin ? 'Action(s)' : 'My Action(s)'}</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleSort('latest_action_date')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
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
                  return (
                    <tr key={rowKey} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900">{summary.request_number || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {REQUEST_TYPE_LABELS[summary.request_type] || summary.request_type}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {summary.my_actions.map((action) => (
                            <span
                              key={action}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[action.toLowerCase()] || 'bg-slate-100 text-slate-700'}`}
                            >
                              {action === 'Approved' && <CheckCircle size={11} />}
                              {action === 'Rejected' && <XCircle size={11} />}
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
                          onClick={() => handleViewDetails(summary)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                        >
                          <Eye size={13} />
                          View
                        </button>
                      </td>
                    </tr>
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

      {showDetailModal && selectedSummary && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {REQUEST_TYPE_LABELS[selectedSummary.request_type] || selectedSummary.request_type} Details
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">{selectedSummary.request_number}</p>
              </div>
              <button onClick={closeDetailModal} className="p-2 hover:bg-slate-100 rounded-lg transition">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {detailLoading ? (
                <div className="py-12 text-center">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-slate-500">Loading request details...</p>
                </div>
              ) : detailData ? (
                <>
                  <RequestDetailView
                    requestType={selectedSummary.request_type}
                    data={detailData}
                    onPreviewPdf={handlePreviewPdf}
                    onDownloadPdf={handleDownloadPdf}
                  />

                  <ApprovalProgressTracker
                    requestType={selectedSummary.request_type}
                    requestId={selectedSummary.request_id}
                  />

                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3">{isAdmin ? 'Approval Actions' : 'My Approval Actions'}</h4>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            {isAdmin && <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Approver</th>}
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Action</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Date & Time</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Comments</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {selectedSummary.records.map((rec) => (
                            <tr key={rec.id}>
                              {isAdmin && <td className="px-4 py-2.5 text-slate-700 text-xs">{rec.approver_name || '-'}</td>}
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[rec.action?.toLowerCase()] || 'bg-slate-100 text-slate-700'}`}>
                                  {rec.action === 'Approved' && <CheckCircle size={11} />}
                                  {rec.action === 'Rejected' && <XCircle size={11} />}
                                  {rec.action}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-slate-500 text-xs">{formatDateTime(rec.approval_date || rec.created_at)}</td>
                              <td className="px-4 py-2.5 text-slate-600 text-xs max-w-xs">{rec.comments || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-slate-500">
                  <p>Could not load request details.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPdfPreview && pdfPreviewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">{pdfPreviewTitle}</h3>
              <button onClick={closePdfPreview} className="p-2 hover:bg-slate-100 rounded-lg transition">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe src={pdfPreviewUrl} className="w-full h-full" title="PDF Preview" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface RequestDetailViewProps {
  requestType: string;
  data: any;
  onPreviewPdf: (path: string, title: string) => void;
  onDownloadPdf: (path: string, fileName: string) => void;
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-slate-900">{value || '-'}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-bold text-slate-700 border-b border-slate-100 pb-2">{children}</h4>;
}

function RequestDetailView({ requestType, data, onPreviewPdf, onDownloadPdf }: RequestDetailViewProps) {
  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
  const fmtMoney = (n: number | undefined | null) =>
    n != null ? `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';

  const AttachmentCard = ({ path, label, fileName }: { path: string; label: string; fileName: string }) => (
    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-red-100 rounded-lg flex-shrink-0">
          <FileText className="text-red-600" size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onPreviewPdf(path, label)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition"
        >
          <Eye size={13} /> View
        </button>
        <button
          onClick={() => onDownloadPdf(path, fileName)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white text-xs font-medium rounded-lg hover:bg-slate-700 transition"
        >
          <Download size={13} /> Download
        </button>
      </div>
    </div>
  );

  if (requestType === 'Purchase Requisition') {
    const validItems = (data.items || []).filter((i: any) => (i.total_price || 0) > 0);
    return (
      <div className="space-y-5">
        <SectionTitle>Purchase Requisition Information</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <FieldRow label="PR Number" value={<span className="font-mono">{data.pr_number}</span>} />
          <FieldRow label="Company" value={data.companies?.name} />
          <FieldRow label="Department" value={data.department} />
          <FieldRow label="Requester" value={data.user_profiles?.full_name} />
          <FieldRow label="Purchase Type" value={data.purchase_type} />
          <FieldRow label="Budget Status" value={data.is_budgeted ? 'Budgeted' : 'Non-Budgeted'} />
          <FieldRow label="Required Date" value={fmt(data.required_date)} />
          {data.purchase_type === 'Non-Purchase Order' && (
            <FieldRow label="Total Amount" value={<span className="font-semibold">{fmtMoney(data.total_amount)}</span>} />
          )}
          <FieldRow label="Status" value={
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
              data.status === 'approved' ? 'bg-green-100 text-green-800' :
              data.status === 'rejected' ? 'bg-red-100 text-red-800' :
              'bg-amber-100 text-amber-800'
            }`}>{data.status}</span>
          } />
        </div>
        <FieldRow label="Description" value={data.description} />
        <FieldRow label="Purpose" value={data.purpose} />
        {data.payee && (
          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Payee" value={data.payee} />
            {data.amount_net_vat != null && <FieldRow label="Amount to be Paid" value={<span className="font-semibold">{fmtMoney(data.amount_net_vat)}</span>} />}
          </div>
        )}
        {validItems.length > 0 && (
          <div>
            <SectionTitle>Items</SectionTitle>
            <div className="border border-slate-200 rounded-lg overflow-hidden mt-3">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {['Item Name', 'Description', 'Qty', 'Unit', 'Unit Price', 'Total'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {validItems.map((item: any, i: number) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-900">{item.item_description || item.description || '-'}</td>
                      <td className="px-3 py-2 text-slate-600">{item.item_notes || '-'}</td>
                      <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                      <td className="px-3 py-2 text-slate-700">{item.unit}</td>
                      <td className="px-3 py-2 text-slate-700">{fmtMoney(item.unit_price)}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{fmtMoney(item.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {data.merged_pdf_path && (
          <div className="space-y-2">
            <SectionTitle>Attachments</SectionTitle>
            <AttachmentCard path={data.merged_pdf_path} label="Merged Attachments" fileName={`PR_${data.pr_number}_Attachments.pdf`} />
          </div>
        )}
      </div>
    );
  }

  if (requestType === 'Cash Advance') {
    return (
      <div className="space-y-5">
        <SectionTitle>Cash Advance Information</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <FieldRow label="CA Number" value={<span className="font-mono">{data.ca_number}</span>} />
          <FieldRow label="Company" value={data.companies?.name} />
          <FieldRow label="Department" value={data.department || data.user_profiles?.department} />
          <FieldRow label="Requester" value={data.user_profiles?.full_name} />
          <FieldRow label="Amount" value={<span className="font-semibold">{fmtMoney(data.amount)}</span>} />
          <FieldRow label="Request Date" value={fmt(data.request_date)} />
          <FieldRow label="Date Needed" value={fmt(data.date_needed)} />
          <FieldRow label="Payee" value={data.payee} />
          <FieldRow label="Status" value={
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
              data.status === 'approved' ? 'bg-green-100 text-green-800' :
              data.status === 'rejected' ? 'bg-red-100 text-red-800' :
              'bg-amber-100 text-amber-800'
            }`}>{data.status}</span>
          } />
        </div>
        <FieldRow label="Purpose" value={data.purpose} />
        {data.attachments_pdf_path && (
          <div className="space-y-2">
            <SectionTitle>Attachments</SectionTitle>
            <AttachmentCard path={data.attachments_pdf_path} label="Supporting Documents" fileName={`CA_${data.ca_number}_Attachments.pdf`} />
          </div>
        )}
        {data.approved_ca_pdf_path && (
          <div className="space-y-2">
            <SectionTitle>Approved Form</SectionTitle>
            <AttachmentCard path={data.approved_ca_pdf_path} label="Approved Cash Advance Form" fileName={`CA_${data.ca_number}_Approved.pdf`} />
          </div>
        )}
      </div>
    );
  }

  if (requestType === 'Petty Cash') {
    return (
      <div className="space-y-5">
        <SectionTitle>Petty Cash Information</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <FieldRow label="PC Number" value={<span className="font-mono">{data.pc_number}</span>} />
          <FieldRow label="Company" value={data.companies?.name} />
          <FieldRow label="Department" value={data.department || data.user_profiles?.department} />
          <FieldRow label="Requester" value={data.user_profiles?.full_name} />
          <FieldRow label="Amount" value={<span className="font-semibold">{fmtMoney(data.amount)}</span>} />
          <FieldRow label="Request Date" value={fmt(data.request_date)} />
          {data.date_of_transactions && <FieldRow label="Date of Transactions" value={fmt(data.date_of_transactions)} />}
          {data.request_type && <FieldRow label="Request Type" value={data.request_type} />}
          <FieldRow label="Status" value={
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
              data.status === 'approved' ? 'bg-green-100 text-green-800' :
              data.status === 'rejected' ? 'bg-red-100 text-red-800' :
              'bg-amber-100 text-amber-800'
            }`}>{data.status}</span>
          } />
        </div>
        <FieldRow label="Purpose" value={data.purpose} />
        {data.expense_items && data.expense_items.length > 0 && (
          <div>
            <SectionTitle>Expense Items</SectionTitle>
            <div className="border border-slate-200 rounded-lg overflow-hidden mt-3">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {['Date', 'Description', 'Amount'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.expense_items.map((item: any, i: number) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-700">{fmt(item.date)}</td>
                      <td className="px-3 py-2 text-slate-900">{item.description}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{fmtMoney(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (requestType === 'Reimbursement') {
    const totalExpenses = data.amount || 0;
    const cashAdvance = data.cash_advance || 0;
    const net = totalExpenses - cashAdvance;
    return (
      <div className="space-y-5">
        <SectionTitle>Reimbursement Information</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <FieldRow label="Reimbursement No." value={<span className="font-mono">{data.reimb_number}</span>} />
          <FieldRow label="Company" value={data.companies?.name} />
          <FieldRow label="Department" value={data.department || data.user_profiles?.department} />
          <FieldRow label="Requester" value={data.user_profiles?.full_name} />
          <FieldRow label="Request Date" value={fmt(data.request_date)} />
          <FieldRow label="Status" value={
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
              data.status === 'approved' ? 'bg-green-100 text-green-800' :
              data.status === 'rejected' ? 'bg-red-100 text-red-800' :
              'bg-amber-100 text-amber-800'
            }`}>{data.status}</span>
          } />
        </div>
        <FieldRow label="Purpose" value={data.purpose} />
        {data.expense_items && data.expense_items.length > 0 && (
          <div>
            <SectionTitle>Expense Itemization</SectionTitle>
            <div className="border border-slate-200 rounded-lg overflow-hidden mt-3">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {['Date', 'Supplier & Particulars', 'Amount'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.expense_items.map((item: any, i: number) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-700">{fmt(item.date)}</td>
                      <td className="px-3 py-2 text-slate-900">{item.description}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{fmtMoney(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-right font-semibold text-slate-700">Total Expenditures:</td>
                    <td className="px-3 py-2 font-bold text-slate-900">{fmtMoney(totalExpenses)}</td>
                  </tr>
                  {cashAdvance > 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-right font-semibold text-slate-700">Less: Cash Advance:</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{fmtMoney(cashAdvance)}</td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-slate-300">
                    <td colSpan={2} className="px-3 py-2 text-right font-bold text-slate-900">
                      {net >= 0 ? 'Over for Reimbursement:' : 'Excess for Deposit:'}
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-900">{fmtMoney(Math.abs(net))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
        {data.merged_pdf_path && (
          <div className="space-y-2">
            <SectionTitle>Attachments (Receipts)</SectionTitle>
            <AttachmentCard path={data.merged_pdf_path} label="Receipts & Attachments" fileName={`Reimb_${data.reimb_number}_Attachments.pdf`} />
          </div>
        )}
      </div>
    );
  }

  if (requestType === 'Canvass') {
    return (
      <div className="space-y-5">
        <SectionTitle>Canvass Information</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <FieldRow label="Canvass No." value={<span className="font-mono">{data.canvass_number || data.document_no}</span>} />
          <FieldRow label="Company" value={data.companies?.name} />
          <FieldRow label="Department" value={data.department || data.user_profiles?.department} />
          <FieldRow label="Requester" value={data.user_profiles?.full_name} />
          <FieldRow label="Request Date" value={fmt(data.request_date)} />
          <FieldRow label="Status" value={
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
              data.status === 'approved' ? 'bg-green-100 text-green-800' :
              data.status === 'rejected' ? 'bg-red-100 text-red-800' :
              'bg-amber-100 text-amber-800'
            }`}>{data.status}</span>
          } />
        </div>
        {data.purpose && <FieldRow label="Purpose" value={data.purpose} />}
        {data.rfp_pdf_path && (
          <div className="space-y-2">
            <SectionTitle>Request for Payment Form</SectionTitle>
            <AttachmentCard path={data.rfp_pdf_path} label="RFP Document" fileName={`Canvass_${data.canvass_number || data.document_no}_RFP.pdf`} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionTitle>Request Information</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="Request Type" value={REQUEST_TYPE_LABELS[requestType] || requestType} />
        <FieldRow label="Status" value={data.status} />
        <FieldRow label="Requester" value={data.user_profiles?.full_name} />
        <FieldRow label="Request Date" value={fmt(data.request_date)} />
      </div>
    </div>
  );
}
