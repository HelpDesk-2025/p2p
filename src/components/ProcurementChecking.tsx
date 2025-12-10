import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Eye, X, FileText, Download, UserCheck, ClipboardList, ExternalLink } from 'lucide-react';

interface PurchaseReq {
  id: string;
  document_no: string;
  pr_number: string;
  description: string;
  purpose: string;
  department: string;
  request_date: string;
  required_date: string;
  status: string;
  total_amount: number;
  purchase_type: string;
  is_budgeted: boolean;
  requester_id: string;
  current_approval_level: number;
  checklist_items?: any[];
  items?: any[];
  payee?: string;
  amount_net_vat?: number;
  payment_mode_lines?: any[];
  user_profiles?: {
    full_name: string;
    email: string;
    company_id: string;
  };
  pr_checklists?: {
    item_name: string;
  };
  merged_pdf_path?: string;
  ready_for_canvass?: boolean;
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  company: string;
  department: string;
  company_id: string;
}

export function ProcurementChecking() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<PurchaseReq[]>([]);
  const [viewingRequest, setViewingRequest] = useState<PurchaseReq | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showSmeModal, setShowSmeModal] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedSmeUser, setSelectedSmeUser] = useState<string>('');
  const [smePurpose, setSmePurpose] = useState('');
  const [submittingSme, setSubmittingSme] = useState(false);
  const [smeRequestStatus, setSmeRequestStatus] = useState<{status: string, sme_name: string} | null>(null);

  useEffect(() => {
    loadRequests();
    loadUsers();
  }, [profile]);

  const loadRequests = async () => {
    if (!profile?.company_id) return;

    const { data } = await supabase
      .from('purchase_requisitions')
      .select(`
        *,
        user_profiles:requester_id (full_name, email, company_id),
        pr_checklists:pr_checklist_id (item_name)
      `)
      .eq('status', 'approved')
      .eq('purchase_type', 'Purchase Order')
      .eq('ready_for_canvass', false)
      .order('created_at', { ascending: false });

    if (!data) {
      setRequests([]);
      return;
    }

    const companyFilteredRequests = data.filter(req =>
      req.user_profiles?.company_id === profile.company_id
    );

    setRequests(companyFilteredRequests);
  };

  const loadUsers = async () => {
    if (!profile?.company_id) return;

    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, company, department, company_id')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)
      .order('full_name');

    if (data) {
      setUsers(data);
    }
  };

  const previewMergedPDF = async (pdfPath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error previewing merged PDF:', error);
      alert('Failed to preview merged PDF');
    }
  };

  const downloadMergedPDF = async (pdfPath: string, documentNo: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${documentNo}_merged.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading merged PDF:', error);
      alert('Failed to download merged PDF');
    }
  };

  const handleReadyForCanvass = async () => {
    if (!viewingRequest) return;

    const confirmed = window.confirm(
      `Are you sure you want to mark this Purchase Requisition (${viewingRequest.document_no || viewingRequest.pr_number}) as ready for canvass?`
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('purchase_requisitions')
        .update({ ready_for_canvass: true })
        .eq('id', viewingRequest.id);

      if (error) throw error;

      alert('Purchase Requisition marked as ready for canvass successfully!');
      setShowViewModal(false);
      setViewingRequest(null);
      loadRequests();
    } catch (error) {
      console.error('Error marking PR as ready for canvass:', error);
      alert('Failed to mark PR as ready for canvass. Please try again.');
    }
  };

  const checkSmeRequestStatus = async (prId: string) => {
    const { data } = await supabase
      .from('sme_requests')
      .select(`
        status,
        sme_user:sme_user_id (
          full_name
        )
      `)
      .eq('pr_id', prId)
      .maybeSingle();

    if (data) {
      setSmeRequestStatus({
        status: data.status,
        sme_name: (data.sme_user as any)?.full_name || 'Unknown'
      });
    } else {
      setSmeRequestStatus(null);
    }
  };

  const handleOpenSmeModal = () => {
    setShowSmeModal(true);
    setSelectedSmeUser('');
    setSmePurpose('');
  };

  const handleSubmitSme = async () => {
    if (!viewingRequest || !profile) return;

    if (!selectedSmeUser) {
      alert('Please select a Subject Matter Expert');
      return;
    }

    if (!smePurpose.trim()) {
      alert('Please provide a purpose for seeking SME help');
      return;
    }

    setSubmittingSme(true);

    try {
      // Check if an SME request already exists for this PR
      const { data: existingRequest } = await supabase
        .from('sme_requests')
        .select('id, status')
        .eq('pr_id', viewingRequest.id)
        .maybeSingle();

      if (existingRequest) {
        alert(`An SME request already exists for this Purchase Requisition (Status: ${existingRequest.status}). Only one SME request is allowed per PR.`);
        return;
      }

      const { error } = await supabase
        .from('sme_requests')
        .insert({
          pr_id: viewingRequest.id,
          requested_by: profile.id,
          sme_user_id: selectedSmeUser,
          purpose: smePurpose,
          status: 'pending'
        });

      if (error) throw error;

      const selectedUser = users.find(u => u.id === selectedSmeUser);
      if (selectedUser?.email) {
        try {
          const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-approval-email`;
          await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: selectedUser.email,
              subject: `SME Approval Required - ${viewingRequest.document_no || viewingRequest.pr_number}`,
              recipientName: selectedUser.full_name,
              requestType: 'SME Request',
              documentNo: viewingRequest.document_no || viewingRequest.pr_number,
              requesterName: profile.full_name || profile.email,
              department: viewingRequest.department,
              totalAmount: viewingRequest.total_amount,
              action: 'Submitted',
            }),
          });
        } catch (emailError) {
          console.error('Error sending email notification:', emailError);
        }
      }

      alert('SME request submitted successfully!');
      setShowSmeModal(false);
      setShowViewModal(false);
      setViewingRequest(null);
      setSelectedSmeUser('');
      setSmePurpose('');
    } catch (error) {
      console.error('Error submitting SME request:', error);
      alert('Failed to submit SME request. Please try again.');
    } finally {
      setSubmittingSme(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-700',
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      in_procurement: 'bg-blue-100 text-blue-700',
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Procurement Checking</h2>
          <p className="text-sm text-slate-600 mt-1">
            Approved Purchase Order requests ready for procurement processing
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
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Date
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
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No approved purchase order requests found
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-slate-900">
                      {req.document_no || req.pr_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {req.user_profiles?.full_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {req.department}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                      {req.description || req.purpose}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {new Date(req.request_date).toLocaleDateString()}
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
                          checkSmeRequestStatus(req.id);
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
                <h3 className="text-xl font-bold text-slate-900">Purchase Requisition Details</h3>
                <p className="text-sm text-slate-600 mt-1">{viewingRequest.document_no || viewingRequest.pr_number}</p>
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingRequest(null);
                  setSmeRequestStatus(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {smeRequestStatus && (
                <div className={`border rounded-lg p-4 ${
                  smeRequestStatus.status === 'pending' ? 'bg-yellow-50 border-yellow-200' :
                  smeRequestStatus.status === 'approved' ? 'bg-green-50 border-green-200' :
                  smeRequestStatus.status === 'rejected' ? 'bg-red-50 border-red-200' :
                  'bg-blue-50 border-blue-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <UserCheck size={20} className={`${
                      smeRequestStatus.status === 'pending' ? 'text-yellow-600' :
                      smeRequestStatus.status === 'approved' ? 'text-green-600' :
                      smeRequestStatus.status === 'rejected' ? 'text-red-600' :
                      'text-blue-600'
                    } mt-0.5`} />
                    <div className="flex-1">
                      <h4 className={`text-sm font-semibold mb-1 ${
                        smeRequestStatus.status === 'pending' ? 'text-yellow-900' :
                        smeRequestStatus.status === 'approved' ? 'text-green-900' :
                        smeRequestStatus.status === 'rejected' ? 'text-red-900' :
                        'text-blue-900'
                      }`}>SME Request Status: {smeRequestStatus.status.charAt(0).toUpperCase() + smeRequestStatus.status.slice(1)}</h4>
                      <p className={`text-sm ${
                        smeRequestStatus.status === 'pending' ? 'text-yellow-800' :
                        smeRequestStatus.status === 'approved' ? 'text-green-800' :
                        smeRequestStatus.status === 'rejected' ? 'text-red-800' :
                        'text-blue-800'
                      }`}>
                        This PR has been submitted to <span className="font-medium">{smeRequestStatus.sme_name}</span> for expert review.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Document No.</label>
                  <p className="text-slate-900 font-mono">{viewingRequest.document_no || viewingRequest.pr_number}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Department</label>
                  <p className="text-slate-900">{viewingRequest.department}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Requester</label>
                  <p className="text-slate-900">{viewingRequest.user_profiles?.full_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Date</label>
                  <p className="text-slate-900">{new Date(viewingRequest.request_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Required Date</label>
                  <p className="text-slate-900">{new Date(viewingRequest.required_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Purchase Type</label>
                  <p className="text-slate-900">{viewingRequest.purchase_type}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">PR Checklist</label>
                  <p className="text-slate-900">{viewingRequest.pr_checklists?.item_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Budget Status</label>
                  <p className="text-slate-900">{viewingRequest.is_budgeted ? 'Budgeted' : 'Non-Budgeted'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Status</label>
                  <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(viewingRequest.status)}`}>
                    {viewingRequest.status}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Description</label>
                <p className="text-slate-900">{viewingRequest.description}</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Purpose</label>
                <p className="text-slate-900">{viewingRequest.purpose}</p>
              </div>

              {viewingRequest.merged_pdf_path && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Merged Attachment</label>
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
                          onClick={() => previewMergedPDF(viewingRequest.merged_pdf_path!)}
                          className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
                        >
                          <ExternalLink size={16} />
                          Preview
                        </button>
                        <button
                          onClick={() => downloadMergedPDF(viewingRequest.merged_pdf_path!, viewingRequest.document_no || viewingRequest.pr_number)}
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

              {viewingRequest.items && viewingRequest.items.length > 0 && (() => {
                // Filter items to only show those with valid total_price > 0
                const validItems = viewingRequest.items.filter((item: any) => item.total_price > 0);

                if (validItems.length === 0) return null;

                return (
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
                          {validItems.map((item: any, index: number) => (
                            <tr key={index}>
                              <td className="px-4 py-2 text-sm text-slate-900">{item.item_description || item.description || 'N/A'}</td>
                              <td className="px-4 py-2 text-sm text-slate-700">{item.quantity}</td>
                              <td className="px-4 py-2 text-sm text-slate-700">{item.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleOpenSmeModal}
                  disabled={!!smeRequestStatus}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  title={smeRequestStatus ? `SME request already exists (${smeRequestStatus.status})` : 'Request Subject Matter Expert'}
                >
                  <UserCheck size={20} />
                  Subject Matter Expert
                </button>
                <button
                  onClick={handleReadyForCanvass}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
                >
                  <ClipboardList size={20} />
                  Ready for Canvass
                </button>
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingRequest(null);
                  setSmeRequestStatus(null);
                }}
                className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showSmeModal && viewingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full">
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Subject Matter Expert Request</h3>
                <p className="text-sm text-slate-600 mt-1">Request help from an expert for PR: {viewingRequest.document_no || viewingRequest.pr_number}</p>
              </div>
              <button
                onClick={() => setShowSmeModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Select Subject Matter Expert *
                </label>
                <select
                  value={selectedSmeUser}
                  onChange={(e) => setSelectedSmeUser(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Select User --</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>

              {selectedSmeUser && users.find(u => u.id === selectedSmeUser) && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Selected User Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-600">Company</label>
                      <p className="text-sm text-slate-900">{users.find(u => u.id === selectedSmeUser)?.company || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Department</label>
                      <p className="text-sm text-slate-900">{users.find(u => u.id === selectedSmeUser)?.department || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Purpose for Seeking SME Help *
                </label>
                <textarea
                  value={smePurpose}
                  onChange={(e) => setSmePurpose(e.target.value)}
                  rows={4}
                  placeholder="Describe why you need help from a Subject Matter Expert..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-end gap-3 rounded-b-xl">
              <button
                onClick={() => setShowSmeModal(false)}
                className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitSme}
                disabled={submittingSme}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submittingSme && (
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {submittingSme ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
