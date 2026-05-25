import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Eye, X, ClipboardList, FileText, User, Download, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import Pagination from '../Pagination';
import { logAuditTrail } from '../../lib/auditTrail';

interface SmeRequest {
  id: string;
  pr_id: string;
  requested_by: string;
  sme_user_id: string;
  purpose: string;
  status: string;
  sme_comments: string | null;
  created_at: string;
  updated_at: string;
  purchase_requisitions: {
    document_no: string;
    pr_number: string;
    description: string;
    purpose: string;
    department: string;
    total_amount: number;
    request_date: string;
    items: any[];
    merged_pdf_path: string | null;
    ready_for_canvass: boolean;
    companies?: { name: string } | null;
    pr_requester?: { full_name: string; email: string } | null;
  };
  requester: {
    full_name: string;
    email: string;
    department: string;
    company: string;
  };
  sme_user: {
    full_name: string;
    email: string;
  };
}

export function SmeApproval() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<SmeRequest[]>([]);
  const [viewingRequest, setViewingRequest] = useState<SmeRequest | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [comments, setComments] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [sortColumn, setSortColumn] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  useEffect(() => {
    loadSmeRequests();
  }, [profile]);

  const loadSmeRequests = async () => {
    if (!profile?.id) return;
    setListLoading(true);

    let query = supabase
      .from('sme_requests')
      .select(`
        *,
        purchase_requisitions:pr_id (
          document_no,
          pr_number,
          description,
          purpose,
          department,
          total_amount,
          request_date,
          items,
          merged_pdf_path,
          ready_for_canvass,
          companies:company_id ( name ),
          pr_requester:requester_id ( full_name, email )
        ),
        requester:requested_by (
          full_name,
          email,
          department,
          company
        ),
        sme_user:sme_user_id (
          full_name,
          email
        )
      `)
      .eq('status', 'pending');

    // If not admin, filter by sme_user_id
    if (profile.role !== 'admin') {
      query = query.eq('sme_user_id', profile.id);
    }

    const { data } = await query.order('created_at', { ascending: false });

    if (data) {
      setRequests(data as any);
    }
    setListLoading(false);
  };

  const handleReadyForCanvass = async () => {
    if (!viewingRequest || !profile) return;

    if (!comments.trim()) {
      alert('Please provide comments before marking as ready for canvass');
      return;
    }

    setActionLoading(true);

    try {
      // Update the SME request status
      const { error: smeError } = await supabase
        .from('sme_requests')
        .update({
          status: 'reviewed',
          sme_comments: comments.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', viewingRequest.id);

      if (smeError) throw smeError;

      // Fire-and-forget audit trail logging for SME request update
      logAuditTrail({
        tableName: 'sme_requests',
        recordId: viewingRequest.id,
        action: 'UPDATE',
        module: 'approvals',
        description: `Approved SME request ${viewingRequest.purchase_requisitions?.document_no || viewingRequest.purchase_requisitions?.pr_number}`,
        oldValues: { status: viewingRequest.status, sme_comments: viewingRequest.sme_comments },
        newValues: { status: 'reviewed', sme_comments: comments.trim() },
        performedBy: profile.id,
        performedByName: profile.full_name || 'Unknown',
        companyId: null,
      });

      // Update the purchase requisition ready_for_canvass status
      const { error: prError } = await supabase
        .from('purchase_requisitions')
        .update({ ready_for_canvass: true })
        .eq('id', viewingRequest.pr_id);

      if (prError) throw prError;

      // Fire-and-forget audit trail logging for PR status update
      logAuditTrail({
        tableName: 'purchase_requisitions',
        recordId: viewingRequest.pr_id,
        action: 'UPDATE',
        module: 'approvals',
        description: `Approved SME request ${viewingRequest.purchase_requisitions?.document_no || viewingRequest.purchase_requisitions?.pr_number}`,
        oldValues: { ready_for_canvass: viewingRequest.purchase_requisitions?.ready_for_canvass },
        newValues: { ready_for_canvass: true },
        performedBy: profile.id,
        performedByName: profile.full_name || 'Unknown',
        companyId: null,
      });

      // Send email notification to procurement if purchase_type is "Purchase Order"
      const { data: prData } = await supabase
        .from('purchase_requisitions')
        .select('purchase_type, company_id, document_no, pr_number, requester_name, department, total_amount')
        .eq('id', viewingRequest.pr_id)
        .single();

      if (prData?.purchase_type === 'Purchase Order' && prData?.company_id) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('procurement_notification_email, name')
          .eq('id', prData.company_id)
          .single();

        if (companyData?.procurement_notification_email) {
          try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

            await fetch(`${supabaseUrl}/functions/v1/send-approval-email`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: companyData.procurement_notification_email,
                subject: `P2P - Purchase Requisition Ready for Canvass - ${prData.document_no || prData.pr_number}`,
                recipientName: 'Procurement Team',
                requestType: 'Purchase Requisition',
                documentNo: prData.document_no || prData.pr_number,
                requesterName: prData.requester_name || 'N/A',
                department: prData.department || 'N/A',
                totalAmount: prData.total_amount || 0,
                action: 'Ready for Canvass',
                actionBy: profile.full_name,
                comments: comments.trim(),
              }),
            });
          } catch (emailError) {
            console.error('Failed to send procurement notification email:', emailError);
          }
        }
      }

      alert('Purchase Requisition marked as ready for canvass successfully!');
      setShowViewModal(false);
      setViewingRequest(null);
      setComments('');
      loadSmeRequests();
    } catch (error) {
      console.error('Error marking as ready for canvass:', error);
      alert('Failed to mark as ready for canvass. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const previewMergedPDF = async (pdfPath: string) => {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(pdfPath, 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  };

  const downloadMergedPDF = async (pdfPath: string, documentNo: string) => {
    const { data } = await supabase.storage.from('attachments').download(pdfPath);
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${documentNo}_merged.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
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
      case 'document_no':
        aVal = a.purchase_requisitions?.document_no || a.purchase_requisitions?.pr_number || '';
        bVal = b.purchase_requisitions?.document_no || b.purchase_requisitions?.pr_number || '';
        break;
      case 'requester':
        aVal = a.requester?.full_name || '';
        bVal = b.requester?.full_name || '';
        break;
      case 'department':
        aVal = a.purchase_requisitions?.department || '';
        bVal = b.purchase_requisitions?.department || '';
        break;
      case 'purpose':
        aVal = a.purpose || '';
        bVal = b.purpose || '';
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

  const totalPages = Math.ceil(sortedRequests.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRequests = sortedRequests.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">SME Approvals</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Subject Matter Expert requests requiring your review
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {listLoading ? (
          <div className="overflow-auto flex-1">
            <table className="w-full hidden lg:table">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  {['DOC NO.', 'REQUESTER', 'DEPARTMENT', 'PURPOSE', 'DATE', 'STATUS', 'ACTION'].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-28 mb-1"/><div className="h-3 bg-slate-100 rounded w-20"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-36 mb-1"/><div className="h-3 bg-slate-100 rounded w-44"/></td>
                    <td className="py-3 px-4"><div className="h-6 bg-slate-200 rounded-full w-28"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-40"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-20"/></td>
                    <td className="py-3 px-4"><div className="h-6 bg-slate-200 rounded-full w-20"/></td>
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
                    <div className="h-6 bg-slate-200 rounded w-16"/>
                  </div>
                  <div className="h-3 bg-slate-100 rounded w-40"/>
                  <div className="h-3 bg-slate-100 rounded w-24"/>
                </div>
              ))}
            </div>
          </div>
        ) : (
        <>
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200 z-10">
              <tr>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button
                    onClick={() => handleSort('document_no')}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                  >
                    Doc No.
                    {getSortIcon('document_no')}
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
                {profile?.role === 'admin' && (
                  <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Assigned SME
                    </span>
                  </th>
                )}
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button
                    onClick={() => handleSort('purpose')}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                  >
                    Purpose
                    {getSortIcon('purpose')}
                  </button>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button
                    onClick={() => handleSort('created_at')}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                  >
                    Date
                    {getSortIcon('created_at')}
                  </button>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Status
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
              {paginatedRequests.length === 0 ? (
                <tr>
                  <td colSpan={profile?.role === 'admin' ? 8 : 7} className="px-3 py-8 sm:px-6 text-center text-slate-500 text-sm">
                    No SME requests found
                  </td>
                </tr>
              ) : (
                paginatedRequests.map((req, index) => (
                  <tr
                    key={req.id}
                    className={`hover:bg-slate-50 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                  >
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="font-mono font-bold text-sm text-slate-900 truncate block min-w-[120px]" title={req.purchase_requisitions?.document_no || req.purchase_requisitions?.pr_number}>
                        {req.purchase_requisitions?.document_no || req.purchase_requisitions?.pr_number}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="text-sm font-semibold text-slate-900 truncate block max-w-[180px]" title={req.requester?.full_name}>
                        {req.requester?.full_name}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium max-w-[140px] truncate" title={req.purchase_requisitions?.department}>
                        {req.purchase_requisitions?.department}
                      </span>
                    </td>
                    {profile?.role === 'admin' && (
                      <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-slate-700 truncate block max-w-[150px]" title={req.sme_user?.full_name}>
                          {req.sme_user?.full_name}
                        </span>
                      </td>
                    )}
                    <td className="px-3 xl:px-4 py-3">
                      <span className="text-sm text-slate-700 truncate block max-w-[200px]" title={req.purpose}>
                        {req.purpose}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-slate-700">
                        {new Date(req.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${getStatusColor(req.status)}`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => {
                          setViewingRequest(req);
                          setShowViewModal(true);
                          setComments(req.sme_comments || '');
                        }}
                        className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm hover:shadow group-hover:scale-105 transform"
                        title="View Request"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
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

      {showViewModal && viewingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">SME Request Details</h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 font-mono">
                  {viewingRequest.purchase_requisitions?.document_no || viewingRequest.purchase_requisitions?.pr_number}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingRequest(null);
                  setComments('');
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={18} className="sm:w-5 sm:h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <User size={18} className="sm:w-5 sm:h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs sm:text-sm font-semibold text-blue-900 mb-1">Request from Procurement</h4>
                    <p className="text-xs sm:text-sm text-blue-800">
                      <span className="font-medium">{viewingRequest.requester?.full_name}</span> is seeking {profile?.role === 'admin' ? <><span className="font-medium">{viewingRequest.sme_user?.full_name}</span>&apos;s</> : "your"} expertise for this Purchase Requisition.
                    </p>
                    <div className="mt-2 sm:mt-3 bg-white border border-blue-200 rounded-lg p-2 sm:p-3">
                      <p className="text-xs font-medium text-blue-700 mb-1">Purpose:</p>
                      <p className="text-xs sm:text-sm text-slate-900 break-words">{viewingRequest.purpose}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-slate-700">Document No.</label>
                  <p className="text-sm sm:text-base text-slate-900 font-mono break-all">
                    {viewingRequest.purchase_requisitions?.document_no || viewingRequest.purchase_requisitions?.pr_number}
                  </p>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-slate-700">Company</label>
                  <p className="text-sm sm:text-base text-slate-900">{viewingRequest.purchase_requisitions?.companies?.name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-slate-700">Requester</label>
                  <p className="text-sm sm:text-base text-slate-900">{viewingRequest.purchase_requisitions?.pr_requester?.full_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-slate-700">Department</label>
                  <p className="text-sm sm:text-base text-slate-900">{viewingRequest.purchase_requisitions?.department}</p>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-slate-700">Request Date</label>
                  <p className="text-sm sm:text-base text-slate-900">
                    {new Date(viewingRequest.purchase_requisitions?.request_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-slate-700">Total Amount</label>
                  <p className="text-sm sm:text-base text-slate-900 font-semibold">
                    ₱{viewingRequest.purchase_requisitions?.total_amount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-slate-700">Status</label>
                  <span className={`inline-block px-2 sm:px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(viewingRequest.status)}`}>
                    {viewingRequest.status}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs sm:text-sm font-semibold text-slate-700">PR Description</label>
                <p className="text-sm sm:text-base text-slate-900 break-words">{viewingRequest.purchase_requisitions?.description}</p>
              </div>

              <div>
                <label className="text-xs sm:text-sm font-semibold text-slate-700">PR Purpose</label>
                <p className="text-sm sm:text-base text-slate-900 break-words">{viewingRequest.purchase_requisitions?.purpose}</p>
              </div>

              {viewingRequest.purchase_requisitions?.merged_pdf_path && (
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3 block">Merged PDF Document</label>
                  <div className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-slate-50">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="p-2 sm:p-3 bg-blue-100 rounded-lg flex-shrink-0">
                          <FileText size={20} className="sm:w-6 sm:h-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm font-semibold text-slate-900">Merged PDF Document</p>
                          <p className="text-xs text-slate-600 mt-0.5 sm:mt-1">All attachments combined</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => previewMergedPDF(viewingRequest.purchase_requisitions!.merged_pdf_path!)}
                          className="flex items-center justify-center gap-1 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition text-xs sm:text-sm flex-1 sm:flex-initial"
                        >
                          <ExternalLink size={14} className="sm:w-4 sm:h-4" />
                          Preview
                        </button>
                        <button
                          onClick={() => downloadMergedPDF(
                            viewingRequest.purchase_requisitions!.merged_pdf_path!,
                            viewingRequest.purchase_requisitions?.document_no || viewingRequest.purchase_requisitions?.pr_number || 'document'
                          )}
                          className="flex items-center justify-center gap-1 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-xs sm:text-sm flex-1 sm:flex-initial"
                        >
                          <Download size={14} className="sm:w-4 sm:h-4" />
                          Download
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {viewingRequest.purchase_requisitions?.items && viewingRequest.purchase_requisitions.items.length > 0 && (
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3 block">Items</label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 sm:px-4 text-left text-xs font-semibold text-slate-700">Description</th>
                            <th className="px-3 py-2 sm:px-4 text-left text-xs font-semibold text-slate-700">Qty</th>
                            <th className="px-3 py-2 sm:px-4 text-left text-xs font-semibold text-slate-700">Unit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {viewingRequest.purchase_requisitions.items.map((item: any, index: number) => (
                            <tr key={index}>
                              <td className="px-3 py-2 sm:px-4 text-xs sm:text-sm text-slate-900">
                                {item.item_description || item.description || 'N/A'}
                              </td>
                              <td className="px-3 py-2 sm:px-4 text-xs sm:text-sm text-slate-700">{item.quantity}</td>
                              <td className="px-3 py-2 sm:px-4 text-xs sm:text-sm text-slate-700">{item.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {viewingRequest.status === 'pending' && (
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                    Comments *
                  </label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={4}
                    placeholder="Add your comments or recommendations..."
                    className="w-full px-3 py-2 sm:px-4 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {viewingRequest.sme_comments && viewingRequest.status !== 'pending' && (
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 block">Your Comments</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 sm:p-4">
                    <p className="text-xs sm:text-sm text-slate-900 break-words">{viewingRequest.sme_comments}</p>
                  </div>
                </div>
              )}
            </div>

            {viewingRequest.status === 'pending' && (
              <div className="border-t border-slate-200 px-4 py-3 sm:px-6 sm:py-4 bg-slate-50 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0">
                <button
                  onClick={handleReadyForCanvass}
                  disabled={actionLoading || !comments.trim()}
                  className="flex items-center justify-center gap-2 px-4 py-2 sm:px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                  title={!comments.trim() ? 'Please provide comments before marking as ready for canvass' : ''}
                >
                  <ClipboardList size={18} className="sm:w-5 sm:h-5" />
                  {actionLoading ? 'Processing...' : 'Ready for Canvass'}
                </button>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setViewingRequest(null);
                    setComments('');
                  }}
                  className="px-4 py-2 sm:px-6 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition text-sm sm:text-base"
                >
                  Close
                </button>
              </div>
            )}

            {viewingRequest.status !== 'pending' && (
              <div className="border-t border-slate-200 px-4 py-3 sm:px-6 sm:py-4 bg-slate-50 flex items-center justify-end">
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setViewingRequest(null);
                    setComments('');
                  }}
                  className="px-4 py-2 sm:px-6 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition text-sm sm:text-base"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
