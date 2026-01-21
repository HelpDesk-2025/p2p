import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Eye, X, ClipboardList, FileText, User, Download, ExternalLink } from 'lucide-react';

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

  useEffect(() => {
    loadSmeRequests();
  }, [profile]);

  const loadSmeRequests = async () => {
    if (!profile?.id) return;

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
          ready_for_canvass
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

      // Update the purchase requisition ready_for_canvass status
      const { error: prError } = await supabase
        .from('purchase_requisitions')
        .update({ ready_for_canvass: true })
        .eq('id', viewingRequest.pr_id);

      if (prError) throw prError;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">SME Approvals</h2>
          <p className="text-sm text-slate-600 mt-1">
            Subject Matter Expert requests requiring your review
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Document No.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Requester
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Department
                </th>
                {profile?.role === 'admin' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Assigned SME
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Purpose
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Request Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={profile?.role === 'admin' ? 8 : 7} className="px-6 py-8 text-center text-slate-500">
                    No SME requests found
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-slate-900">
                      {req.purchase_requisitions?.document_no || req.purchase_requisitions?.pr_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {req.requester?.full_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {req.purchase_requisitions?.department}
                    </td>
                    {profile?.role === 'admin' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {req.sme_user?.full_name}
                      </td>
                    )}
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                      {req.purpose}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {new Date(req.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(req.status)}`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => {
                          setViewingRequest(req);
                          setShowViewModal(true);
                          setComments(req.sme_comments || '');
                        }}
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <Eye size={16} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showViewModal && viewingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">SME Request Details</h3>
                <p className="text-sm text-slate-600 mt-1">
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
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <User size={20} className="text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-blue-900 mb-1">Request from Procurement</h4>
                    <p className="text-sm text-blue-800">
                      <span className="font-medium">{viewingRequest.requester?.full_name}</span> is seeking {profile?.role === 'admin' ? <><span className="font-medium">{viewingRequest.sme_user?.full_name}</span>'s</> : 'your'} expertise for this Purchase Requisition.
                    </p>
                    <div className="mt-3 bg-white border border-blue-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-blue-700 mb-1">Purpose:</p>
                      <p className="text-sm text-slate-900">{viewingRequest.purpose}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Document No.</label>
                  <p className="text-slate-900 font-mono">
                    {viewingRequest.purchase_requisitions?.document_no || viewingRequest.purchase_requisitions?.pr_number}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Company</label>
                  <p className="text-slate-900">{viewingRequest.purchase_requisitions?.companies?.name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Department</label>
                  <p className="text-slate-900">{viewingRequest.purchase_requisitions?.department}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Date</label>
                  <p className="text-slate-900">
                    {new Date(viewingRequest.purchase_requisitions?.request_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Total Amount</label>
                  <p className="text-slate-900 font-semibold">
                    ₱{viewingRequest.purchase_requisitions?.total_amount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Status</label>
                  <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(viewingRequest.status)}`}>
                    {viewingRequest.status}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">PR Description</label>
                <p className="text-slate-900">{viewingRequest.purchase_requisitions?.description}</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">PR Purpose</label>
                <p className="text-slate-900">{viewingRequest.purchase_requisitions?.purpose}</p>
              </div>

              {viewingRequest.purchase_requisitions?.merged_pdf_path && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Merged PDF Document</label>
                  <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-100 rounded-lg">
                          <FileText size={24} className="text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Merged PDF Document</p>
                          <p className="text-xs text-slate-600 mt-1">All attachments combined</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => previewMergedPDF(viewingRequest.purchase_requisitions!.merged_pdf_path!)}
                          className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
                        >
                          <ExternalLink size={16} />
                          Preview
                        </button>
                        <button
                          onClick={() => downloadMergedPDF(
                            viewingRequest.purchase_requisitions!.merged_pdf_path!,
                            viewingRequest.purchase_requisitions?.document_no || viewingRequest.purchase_requisitions?.pr_number || 'document'
                          )}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                          <Download size={16} />
                          Download
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {viewingRequest.purchase_requisitions?.items && viewingRequest.purchase_requisitions.items.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Items</label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Description</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Quantity</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Unit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewingRequest.purchase_requisitions.items.map((item: any, index: number) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-slate-900">
                              {item.item_description || item.description || 'N/A'}
                            </td>
                            <td className="px-4 py-2 text-sm text-slate-700">{item.quantity}</td>
                            <td className="px-4 py-2 text-sm text-slate-700">{item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {viewingRequest.status === 'pending' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Comments *
                  </label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={4}
                    placeholder="Add your comments or recommendations..."
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {viewingRequest.sme_comments && viewingRequest.status !== 'pending' && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 block">Your Comments</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <p className="text-sm text-slate-900">{viewingRequest.sme_comments}</p>
                  </div>
                </div>
              )}
            </div>

            {viewingRequest.status === 'pending' && (
              <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between">
                <button
                  onClick={handleReadyForCanvass}
                  disabled={actionLoading || !comments.trim()}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!comments.trim() ? 'Please provide comments before marking as ready for canvass' : ''}
                >
                  <ClipboardList size={20} />
                  {actionLoading ? 'Processing...' : 'Ready for Canvass'}
                </button>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setViewingRequest(null);
                    setComments('');
                  }}
                  className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
                >
                  Close
                </button>
              </div>
            )}

            {viewingRequest.status !== 'pending' && (
              <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-end">
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setViewingRequest(null);
                    setComments('');
                  }}
                  className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
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
