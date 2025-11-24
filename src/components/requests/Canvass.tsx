import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Save, Send, Eye, FileText, X } from 'lucide-react';
import { getApprovalFlow, createApprovalLedgerEntry, sendApprovalEmail, getApproverEmail } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { ConfirmationModal } from '../ConfirmationModal';

interface CanvassReq {
  id: string;
  canvass_number: string;
  request_date: string;
  required_date: string;
  status: string;
  total_amount: number;
}

export function Canvass() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<CanvassReq[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<CanvassReq | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [pendingSubmitStatus, setPendingSubmitStatus] = useState<'draft' | 'pending' | null>(null);
  const [formData, setFormData] = useState({
    document_no: '',
    required_date: '',
    items: [{ description: '', quantity: 1, unit: 'pcs' }],
  });

  useEffect(() => {
    loadRequests();
  }, []);

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

  const handleConfirmSubmit = async () => {
    if (!pendingSubmitStatus) return;
    setShowSubmitConfirm(false);
    await handleSubmit(pendingSubmitStatus);
    setPendingSubmitStatus(null);
  };

  const handleSubmit = async (status: 'draft' | 'pending') => {
    setLoading(true);
    try {
      const totalAmount = 0;

      const { data: insertedRequest, error } = await supabase
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
          current_approval_level: status === 'pending' ? 0 : 0,
          total_amount: totalAmount,
        })
        .select()
        .single();

      if (error) throw error;

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
      loadRequests();
      generateDocumentNo();
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
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

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">New Canvass Request</h2>
          <button onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600">Cancel</button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Document No.</label>
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Items to Canvass</label>
            {formData.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => {
                    const newItems = [...formData.items];
                    newItems[idx].description = e.target.value;
                    setFormData({ ...formData, items: newItems });
                  }}
                  className="col-span-6 px-3 py-2 border border-slate-300 rounded-lg"
                />
                <input
                  type="number"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) => {
                    const newItems = [...formData.items];
                    newItems[idx].quantity = Number(e.target.value);
                    setFormData({ ...formData, items: newItems });
                  }}
                  className="col-span-3 px-3 py-2 border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Unit"
                  value={item.unit}
                  onChange={(e) => {
                    const newItems = [...formData.items];
                    newItems[idx].unit = e.target.value;
                    setFormData({ ...formData, items: newItems });
                  }}
                  className="col-span-3 px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            ))}
            <button
              onClick={() => setFormData({ ...formData, items: [...formData.items, { description: '', quantity: 1, unit: 'pcs' }] })}
              className="mt-2 flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
            >
              <Plus size={16} />
              Add Item
            </button>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button onClick={() => { setPendingSubmitStatus('draft'); setShowSubmitConfirm(true); }} disabled={loading} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
              <Save size={18} />
              Save as Draft
            </button>
            <button onClick={() => { setPendingSubmitStatus('pending'); setShowSubmitConfirm(true); }} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Send size={18} />
              Submit
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Canvass Requests</h2>
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

            <div className="border-t border-slate-200 px-6 py-4 bg-slate-50">
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

      <ConfirmationModal
        isOpen={showSubmitConfirm}
        onClose={() => {
          setShowSubmitConfirm(false);
          setPendingSubmitStatus(null);
        }}
        onConfirm={handleConfirmSubmit}
        title={pendingSubmitStatus === 'pending' ? 'Submit for Approval?' : 'Save as Draft?'}
        message={
          pendingSubmitStatus === 'pending'
            ? 'Are you sure you want to submit this canvass request for approval? Once submitted, you cannot edit it.'
            : 'Do you want to save this canvass request as a draft? You can edit and submit it later.'
        }
        confirmText={pendingSubmitStatus === 'pending' ? 'Submit' : 'Save'}
        type={pendingSubmitStatus === 'pending' ? 'success' : 'warning'}
        loading={loading}
      />
    </div>
  );
}
