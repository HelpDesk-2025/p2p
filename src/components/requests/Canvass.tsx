import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Save, Send, Eye, FileText, X, Edit, Loader2 } from 'lucide-react';
import { getApprovalFlow, createApprovalLedgerEntry, sendApprovalEmail, getApproverEmail } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';

interface CanvassReq {
  id: string;
  canvass_number: string;
  request_date: string;
  required_date: string;
  status: string;
  total_amount: number;
}

interface PurchaseRequisition {
  id: string;
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
}

interface QuotationForm {
  vendor_name: string;
  vendor_contact: string;
  quoted_amount: number;
  quotation_file?: File | null;
}

export function Canvass() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<CanvassReq[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showPRSelection, setShowPRSelection] = useState(false);
  const [availablePRs, setAvailablePRs] = useState<PurchaseRequisition[]>([]);
  const [selectedPR, setSelectedPR] = useState<PurchaseRequisition | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<CanvassReq | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<CanvassReq | null>(null);
  const [formData, setFormData] = useState({
    document_no: '',
    required_date: '',
    items: [{ description: '', quantity: 1, unit: 'pcs' }],
  });
  const [quotations, setQuotations] = useState<QuotationForm[]>([
    { vendor_name: '', vendor_contact: '', quoted_amount: 0, quotation_file: null },
    { vendor_name: '', vendor_contact: '', quoted_amount: 0, quotation_file: null },
    { vendor_name: '', vendor_contact: '', quoted_amount: 0, quotation_file: null },
  ]);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadAvailablePRs = async () => {
    if (!profile?.company_id) return;

    const { data } = await supabase
      .from('purchase_requisitions')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('ready_for_canvass', true)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    setAvailablePRs(data || []);
  };

  const generateDocumentNo = async () => {
    try {
      const { data, error } = await supabase.rpc('get_next_number', {
        p_series_name: 'Canvass'
      });
      if (error) throw error;
      setFormData(prev => ({ ...prev, document_no: data }));
    } catch (error) {
      console.error('Error generating document number:', error);
    }
  };

  const loadRequests = async () => {
    const { data } = await supabase
      .from('canvass_requests')
      .select('*')
      .eq('requester_id', profile?.id)
      .order('created_at', { ascending: false });
    setRequests(data || []);
  };

  const generateNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `CV-${year}${month}-${random}`;
  };

  const handleEditDraft = (request: CanvassReq) => {
    setEditingRequest(request);
    setFormData({
      document_no: request.canvass_number,
      required_date: request.required_date,
      items: (request as any).items || [{ description: '', quantity: 1, unit: 'pcs' }],
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
      const totalAmount = 0;

      let insertedRequest;

      if (editingRequest) {
        const { data, error } = await supabase
          .from('canvass_requests')
          .update({
            required_date: formData.required_date,
            items: formData.items,
            status,
            total_amount: totalAmount,
          })
          .eq('id', editingRequest.id)
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;
      } else {
        const { data, error } = await supabase
          .from('canvass_requests')
          .insert({
            canvass_number: formData.document_no,
            requester_id: profile?.id,
            company_id: profile?.company_id,
            department: profile?.department || '',
            request_date: new Date().toISOString().split('T')[0],
            required_date: formData.required_date,
            items: formData.items,
            status,
            current_approval_level: 0,
            total_amount: totalAmount,
          })
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;
      }

      if (status === 'pending' && insertedRequest && profile?.company_id) {
        const approvalFlows = await getApprovalFlow(
          profile.company_id,
          profile.department || '',
          'Canvass',
          false,
          totalAmount
        );

        if (approvalFlows.length > 0) {
          await createApprovalLedgerEntry(
            'Canvass',
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
              'Canvass',
              formData.document_no,
              profile.full_name || 'Unknown',
              profile.department || '',
              totalAmount,
              'Submitted',
              undefined,
              undefined,
              firstApprover.approver_type
            );
          }
        }
      }

      setShowForm(false);
      setFormData({ document_no: '', required_date: '', items: [{ description: '', quantity: 1, unit: 'pcs' }] });
      setEditingRequest(null);
      loadRequests();
      if (!editingRequest) {
        generateDocumentNo();
      }
      generateDocumentNo();
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
      setSavingDraft(false);
      setSubmitting(false);
    }
  };

  const handleSubmitDraft = async (request: CanvassReq) => {
    if (!confirm('Are you sure you want to submit this draft for approval?')) {
      return;
    }

    setSubmitting(true);
    setLoading(true);
    try {
      if (!profile?.company_id) {
        throw new Error('Company information not found');
      }

      const approvalFlows = await getApprovalFlow(
        profile.company_id,
        profile.department || '',
        'Canvass',
        false,
        request.total_amount
      );

      if (!approvalFlows || approvalFlows.length === 0) {
        throw new Error('No approval flow configured for this request. Please contact administrator.');
      }

      const { error: updateError } = await supabase
        .from('canvass_requests')
        .update({ status: 'pending', current_approval_level: 0 })
        .eq('id', request.id);

      if (updateError) throw updateError;

      await createApprovalLedgerEntry(
        'Canvass',
        request.id,
        request.canvass_number,
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
          'Canvass',
          request.canvass_number,
          profile.full_name || 'Unknown',
          profile.department || '',
          request.total_amount,
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
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  const previewMergedPDF = async (pdfPath: string) => {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(pdfPath, 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  };

  const handlePRSelection = (pr: PurchaseRequisition) => {
    setSelectedPR(pr);
    setShowPRSelection(false);
    setShowForm(true);
    generateDocumentNo();
    setQuotations([
      { vendor_name: '', vendor_contact: '', quoted_amount: 0, quotation_file: null },
      { vendor_name: '', vendor_contact: '', quoted_amount: 0, quotation_file: null },
      { vendor_name: '', vendor_contact: '', quoted_amount: 0, quotation_file: null },
    ]);
  };

  if (showPRSelection) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Select Purchase Requisition</h2>
            <p className="text-sm text-slate-600 mt-1">Choose a PR that is ready for canvass</p>
          </div>
          <button
            onClick={() => setShowPRSelection(false)}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            Cancel
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Document No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Total Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Request Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {availablePRs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No purchase requisitions ready for canvass
                  </td>
                </tr>
              ) : (
                availablePRs.map((pr) => (
                  <tr key={pr.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-mono font-medium text-slate-900">
                      {pr.document_no || pr.pr_number}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{pr.description}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{pr.department}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                      ₱{pr.total_amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(pr.request_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => handlePRSelection(pr)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">New Canvass Request</h2>
          <button
            onClick={() => {
              setShowForm(false);
              setSelectedPR(null);
              setQuotations([
                { vendor_name: '', vendor_contact: '', quoted_amount: 0, quotation_file: null },
                { vendor_name: '', vendor_contact: '', quoted_amount: 0, quotation_file: null },
                { vendor_name: '', vendor_contact: '', quoted_amount: 0, quotation_file: null },
              ]);
            }}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            Cancel
          </button>
        </div>

        {selectedPR && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="text-lg font-bold text-blue-900 mb-4">Selected Purchase Requisition</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="font-semibold text-blue-700">Document No.</label>
                  <p className="text-blue-900 font-mono">{selectedPR.document_no || selectedPR.pr_number}</p>
                </div>
                <div>
                  <label className="font-semibold text-blue-700">Department</label>
                  <p className="text-blue-900">{selectedPR.department}</p>
                </div>
                <div>
                  <label className="font-semibold text-blue-700">Total Amount</label>
                  <p className="text-blue-900 font-semibold">₱{selectedPR.total_amount.toLocaleString()}</p>
                </div>
                <div>
                  <label className="font-semibold text-blue-700">Request Date</label>
                  <p className="text-blue-900">{new Date(selectedPR.request_date).toLocaleDateString()}</p>
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-blue-700">Description</label>
                  <p className="text-blue-900">{selectedPR.description}</p>
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-blue-700">Purpose</label>
                  <p className="text-blue-900">{selectedPR.purpose}</p>
                </div>
              </div>

              {selectedPR.merged_pdf_path && (
                <div className="mt-4">
                  <label className="font-semibold text-blue-700 block mb-2">Merged PDF Document</label>
                  <button
                    onClick={() => previewMergedPDF(selectedPR.merged_pdf_path!)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    <FileText size={16} />
                    View Merged PDF
                  </button>
                </div>
              )}

              {selectedPR.items && selectedPR.items.length > 0 && (
                <div className="mt-4">
                  <label className="font-semibold text-blue-700 block mb-2">Items</label>
                  <div className="bg-white border border-blue-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-blue-900">Description</th>
                          <th className="px-3 py-2 text-left text-blue-900">Quantity</th>
                          <th className="px-3 py-2 text-left text-blue-900">Unit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-100">
                        {selectedPR.items.map((item: any, index: number) => (
                          <tr key={index}>
                            <td className="px-3 py-2 text-slate-900">{item.item_description || item.description}</td>
                            <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                            <td className="px-3 py-2 text-slate-700">{item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Canvass Document No.</label>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg">
                  <FileText size={18} className="text-slate-400" />
                  <span className="font-mono font-semibold text-slate-900">{formData.document_no}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Required Date</label>
                <input
                  type="date"
                  value={formData.required_date}
                  onChange={(e) => setFormData({ ...formData, required_date: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Quotations (3 Required)</h3>
                <div className="space-y-6">
                  {quotations.map((quotation, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                      <h4 className="font-semibold text-slate-900">Quotation {idx + 1}</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Vendor Name</label>
                          <input
                            type="text"
                            placeholder="Enter vendor name"
                            value={quotation.vendor_name}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].vendor_name = e.target.value;
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Vendor Contact</label>
                          <input
                            type="text"
                            placeholder="Email or phone"
                            value={quotation.vendor_contact}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].vendor_contact = e.target.value;
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Quoted Amount</label>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={quotation.quoted_amount || ''}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].quoted_amount = Number(e.target.value);
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Quotation File</label>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].quotation_file = e.target.files?.[0] || null;
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t">
                <button
                  onClick={() => handleSubmit('draft')}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingDraft ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {savingDraft ? 'Saving...' : 'Save as Draft'}
                </button>
                <button
                  onClick={() => handleSubmit('pending')}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  {submitting ? 'Submitting...' : 'Submit for Approval'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Canvass Requests</h2>
        <button
          onClick={() => {
            loadAvailablePRs();
            setShowPRSelection(true);
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
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Canvass Number</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Required Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {requests.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">No canvass requests found</td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{req.canvass_number}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{new Date(req.request_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{new Date(req.required_date).toLocaleDateString()}</td>
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
                <h3 className="text-xl font-bold text-slate-900">Canvass Request Details</h3>
                <p className="text-sm text-slate-600 mt-1">{viewingRequest.canvass_number}</p>
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
                  requestType="Canvass"
                  requestId={viewingRequest.id}
                />
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Canvass Number</label>
                  <p className="text-slate-900 font-mono">{viewingRequest.canvass_number}</p>
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
                  <label className="text-sm font-semibold text-slate-700">Status</label>
                  <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(viewingRequest.status)}`}>
                    {viewingRequest.status}
                  </span>
                </div>
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
