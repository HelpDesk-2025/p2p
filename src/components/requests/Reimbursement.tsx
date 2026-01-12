import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Save, Send, Eye, FileText, X, Download, Edit, Loader2, RefreshCw } from 'lucide-react';
import { getApprovalFlow, filterApprovalFlowsForRequester, createApprovalLedgerEntry, sendApprovalEmail, getApproverEmail } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';

interface PaymentMode {
  id: string;
  mode_name: string;
}

interface ReimbursementReq {
  id: string;
  reimb_number: string;
  request_date: string;
  expense_date: string;
  purpose: string;
  amount: number;
  status: string;
  company_id?: string;
  department?: string;
  budgeted?: boolean;
  rfp_pdf_path?: string;
}

export function Reimbursement() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<ReimbursementReq[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<ReimbursementReq | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<ReimbursementReq | null>(null);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [formData, setFormData] = useState({
    document_no: '',
    payee: '',
    expense_date: '',
    purpose: '',
    amount: 0,
    date_needed: '',
    budgeted: true,
    payment_mode_id: '',
  });

  useEffect(() => {
    loadRequests();
    loadPaymentModes();
    loadCompanies();
  }, []);

  useEffect(() => {
    if (selectedCompanyId && !formData.document_no) {
      generateDocumentNo();
    }
  }, [selectedCompanyId]);

  const generateDocumentNo = async () => {
    const companyId = profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id;
    if (!companyId) {
      console.error('Company ID not available');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_next_number', {
        p_series_name: 'Reimbursement',
        p_company_id: companyId
      });
      if (error) throw error;
      setFormData(prev => ({ ...prev, document_no: data }));
    } catch (error) {
      console.error('Error generating document number:', error);
    }
  };

  const loadCompanies = async () => {
    try {
      if (!profile) return;

      // If user has multi-company access enabled
      if (profile.enable_multi_company_requests && profile.allowed_companies && profile.allowed_companies.length > 0) {
        const { data, error } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', profile.allowed_companies)
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (error) throw error;
        setCompanies(data || []);

        if (data && data.length > 0) {
          const defaultCompany = data.find(c => c.id === profile.company_id) || data[0];
          setSelectedCompanyId(defaultCompany.id);
        }
      } else {
        setSelectedCompanyId(profile.company_id || '');
      }
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setFormData(prev => ({
      ...prev,
      document_no: '',
    }));
  };

  const loadRequests = async () => {
    if (!profile?.company_id && profile?.role !== 'admin') return;

    let query = supabase
      .from('reimbursement_requests')
      .select('*, user_profiles!reimbursement_requests_requester_id_fkey(company_id), companies!reimbursement_requests_company_id_fkey(id, name)')
      .order('created_at', { ascending: false });

    // Only filter by requester_id if user is not an admin
    if (profile?.role !== 'admin') {
      query = query.eq('requester_id', profile?.id);
    }

    const { data } = await query;

    // For admin users, filter in-memory to show all requests
    const filteredRequests = profile.role === 'admin'
      ? data
      : data?.filter(req => req.company_id === profile.company_id || req.user_profiles?.company_id === profile.company_id);

    setRequests(filteredRequests || []);
  };

  const loadPaymentModes = async () => {
    const { data } = await supabase.from('payment_modes').select('*').eq('is_active', true);
    setPaymentModes(data || []);
  };

  const generateNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `RB-${year}${month}-${random}`;
  };

  const handleEditDraft = (request: ReimbursementReq) => {
    setEditingRequest(request);
    setFormData({
      document_no: request.reimb_number,
      payee: request.payee,
      expense_date: (request as any).expense_date || '',
      purpose: request.purpose,
      amount: request.amount,
      date_needed: (request as any).date_needed || '',
      budgeted: (request as any).budgeted !== undefined ? (request as any).budgeted : true,
      payment_mode_id: (request as any).payment_mode_id || '',
    });
    setShowViewModal(false);
    setViewingRequest(null);
    setShowForm(true);
  };

  const handleSubmit = async (status: 'draft' | 'pending') => {
    if (status === 'draft') {
      setSavingDraft(true);
    } else {
      setSubmitting(true);
    }
    setLoading(true);
    try {
      let insertedRequest;

      if (editingRequest) {
        const { data, error } = await supabase
          .from('reimbursement_requests')
          .update({
            payee: formData.payee,
            expense_date: formData.expense_date,
            purpose: formData.purpose,
            amount: formData.amount,
            date_needed: formData.date_needed || null,
            budgeted: formData.budgeted,
            payment_mode_id: formData.payment_mode_id || null,
            status,
          })
          .eq('id', editingRequest.id)
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;
      } else {
        const companyId = profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id;
        const { data, error } = await supabase
          .from('reimbursement_requests')
          .insert({
            reimb_number: formData.document_no,
            requester_id: profile?.id,
            company_id: companyId,
            department: profile?.department || '',
            request_date: new Date().toISOString().split('T')[0],
            payee: formData.payee,
            expense_date: formData.expense_date,
            purpose: formData.purpose,
            amount: formData.amount,
            date_needed: formData.date_needed || null,
            budgeted: formData.budgeted,
            payment_mode_id: formData.payment_mode_id || null,
            status,
            current_approval_level: 0,
          })
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;
      }

      if (status === 'pending' && insertedRequest) {
        const requestCompanyId = insertedRequest.company_id;
        const requestDepartment = insertedRequest.department || '';

        const rawApprovalFlows = await getApprovalFlow(
          requestCompanyId,
          requestDepartment,
          'Reimbursement',
          false,
          formData.amount
        );

        // Filter out requester from approval flows
        const approvalFlows = await filterApprovalFlowsForRequester(
          rawApprovalFlows,
          profile.id,
          requestDepartment,
          requestCompanyId
        );

        if (approvalFlows.length > 0) {
          await createApprovalLedgerEntry(
            'Reimbursement',
            insertedRequest.id,
            formData.document_no,
            profile.id,
            profile.full_name || 'Unknown',
            'Requestor',
            'Submitted',
            'Initial submission',
            0
          );

          const firstApprover = approvalFlows[0];
          const approverInfo = await getApproverEmail(
            firstApprover,
            profile.company_id,
            profile.department || ''
          );

          if (approverInfo) {
            await sendApprovalEmail(
              approverInfo.email,
              approverInfo.name,
              'Reimbursement',
              formData.document_no,
              profile.full_name || 'Unknown',
              profile.department || '',
              formData.amount,
              'Submitted',
              undefined,
              undefined,
              firstApprover.approver_type
            );
          }
        }
      }

      setShowForm(false);
      setFormData({ document_no: '', payee: '', expense_date: '', purpose: '', amount: 0, date_needed: '', budgeted: true, payment_mode_id: '' });
      setEditingRequest(null);
      loadRequests();
      if (!editingRequest) {
        generateDocumentNo();
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
      setSavingDraft(false);
      setSubmitting(false);
    }
  };

  const handleSubmitDraft = async (request: ReimbursementReq) => {
    if (!confirm('Are you sure you want to submit this draft for approval?')) {
      return;
    }

    setSubmitting(true);
    setLoading(true);
    try {
      if (!request.company_id) {
        throw new Error('Company information not found');
      }

      const department = request.department || profile?.department || '';
      const rawApprovalFlows = await getApprovalFlow(
        request.company_id,
        department,
        'Reimbursement',
        request.budgeted || false,
        request.amount
      );

      if (!rawApprovalFlows || rawApprovalFlows.length === 0) {
        throw new Error('No approval flow configured for this request. Please contact administrator.');
      }

      // Filter out requester from approval flows
      const approvalFlows = await filterApprovalFlowsForRequester(
        rawApprovalFlows,
        profile.id,
        department,
        request.company_id
      );

      if (!approvalFlows || approvalFlows.length === 0) {
        throw new Error('No additional approvers required for this request.');
      }

      const { error: updateError } = await supabase
        .from('reimbursement_requests')
        .update({ status: 'pending', current_approval_level: 0 })
        .eq('id', request.id);

      if (updateError) throw updateError;

      await createApprovalLedgerEntry(
        'Reimbursement',
        request.id,
        request.reimb_number,
        profile.id,
        profile.full_name || 'Unknown',
        'Requestor',
        'Submitted',
        'Initial submission',
        0
      );

      const firstApprover = approvalFlows[0];
      const approverInfo = await getApproverEmail(
        firstApprover,
        profile.company_id,
        profile.department || ''
      );

      if (approverInfo) {
        await sendApprovalEmail(
          approverInfo.email,
          approverInfo.name,
          'Reimbursement',
          request.reimb_number,
          profile.full_name || 'Unknown',
          profile.department || '',
          request.amount,
          'Submitted',
          undefined,
          undefined,
          firstApprover.approver_type
        );
      }

      setShowViewModal(false);
      setViewingRequest(null);
      alert('Draft submitted for approval successfully!');
      await loadRequests();
    } catch (error: any) {
      console.error('Error submitting draft:', error);
      alert('Failed to submit draft: ' + error.message);
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-700',
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      reimbursed: 'bg-blue-100 text-blue-700',
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  const downloadRFP = async (rfpPath: string, reimbNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(rfpPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RFP_${reimbNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading RFP:', error);
      alert('Failed to download RFP');
    }
  };

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">{editingRequest ? 'Edit Reimbursement Request' : 'New Reimbursement Request'}</h2>
          <button onClick={() => { setShowForm(false); setEditingRequest(null); }} className="px-4 py-2 text-slate-600">Cancel</button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Document No.</label>
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg">
              <FileText size={18} className="text-slate-400" />
              <span className="font-mono font-semibold text-slate-900">{formData.document_no}</span>
            </div>
          </div>

          {profile?.enable_multi_company_requests ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Company
              </label>
              <select
                value={selectedCompanyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                required
              >
                <option value="">Select Company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payee</label>
            <input
              type="text"
              value={formData.payee}
              onChange={(e) => setFormData({ ...formData, payee: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Expense Date</label>
            <input
              type="date"
              value={formData.expense_date}
              onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Purpose</label>
            <textarea
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date Needed</label>
            <input
              type="date"
              value={formData.date_needed}
              onChange={(e) => setFormData({ ...formData, date_needed: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.budgeted}
                onChange={(e) => setFormData({ ...formData, budgeted: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">Budgeted</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Mode</label>
            <select
              value={formData.payment_mode_id}
              onChange={(e) => setFormData({ ...formData, payment_mode_id: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select payment mode</option>
              {paymentModes.map((mode) => (
                <option key={mode.id} value={mode.id}>{mode.mode_name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              onClick={() => {
                if (confirm('Are you sure you want to submit this reimbursement request for approval?')) {
                  handleSubmit('pending');
                }
              }}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Reimbursement Requests</h2>
        <button
          onClick={() => {
            setShowForm(true);
            generateDocumentNo();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          New Request
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Reimb Number</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Request Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Purpose</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {requests.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">No reimbursement requests found</td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{req.reimb_number}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{new Date(req.request_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{req.purpose}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">${req.amount.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(req.status)}`}>{req.status}</span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => {
                        setViewingRequest(req);
                        setShowViewModal(true);
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

      {showViewModal && viewingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Reimbursement Request Details</h3>
                <p className="text-sm text-slate-600 mt-1">{viewingRequest.reimb_number}</p>
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingRequest(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {(viewingRequest.status === 'pending' || viewingRequest.status === 'approved' || viewingRequest.status === 'rejected') && (
                <ApprovalProgressTracker
                  requestType="Reimbursement"
                  requestId={viewingRequest.id}
                />
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Reimb Number</label>
                  <p className="text-slate-900 font-mono">{viewingRequest.reimb_number}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Date</label>
                  <p className="text-slate-900">{new Date(viewingRequest.request_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Expense Date</label>
                  <p className="text-slate-900">{new Date(viewingRequest.expense_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Amount</label>
                  <p className="text-slate-900 font-bold">₱{viewingRequest.amount.toFixed(2)}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Status</label>
                  <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(viewingRequest.status)}`}>
                    {viewingRequest.status}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Purpose</label>
                <p className="text-slate-900">{viewingRequest.purpose}</p>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {viewingRequest.status === 'draft' && (
                  <>
                    <button
                      onClick={() => handleEditDraft(viewingRequest)}
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Edit size={18} />
                      Edit Draft
                    </button>
                    <button
                      onClick={() => handleSubmitDraft(viewingRequest)}
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                      {submitting ? 'Submitting...' : 'Submit for Approval'}
                    </button>
                  </>
                )}
                {viewingRequest.status === 'approved' && viewingRequest.rfp_pdf_path && (
                  <button
                    onClick={() => downloadRFP(viewingRequest.rfp_pdf_path!, viewingRequest.reimb_number)}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    <Download size={18} />
                    Download RFP
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingRequest(null);
                }}
                className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
