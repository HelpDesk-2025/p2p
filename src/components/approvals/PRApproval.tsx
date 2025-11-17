import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, Eye, X } from 'lucide-react';

interface PurchaseReq {
  id: string;
  pr_number: string;
  requester_id: string;
  department: string;
  request_date: string;
  required_date: string;
  purpose: string;
  total_amount: number;
  status: string;
  items: any[];
  user_profiles?: {
    full_name: string;
    email: string;
  };
}

export function PRApproval() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<PurchaseReq[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PurchaseReq | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    const { data } = await supabase
      .from('purchase_requisitions')
      .select(`
        *,
        user_profiles:requester_id (full_name, email)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setRequests(data || []);
  };

  const handleAction = async (action: 'approved' | 'rejected') => {
    if (!selectedRequest) return;
    setLoading(true);

    try {
      const newStatus = action === 'approved' ? 'approved' : 'rejected';

      const { error: updateError } = await supabase
        .from('purchase_requisitions')
        .update({ status: newStatus })
        .eq('id', selectedRequest.id);

      if (updateError) throw updateError;

      const { error: historyError } = await supabase.from('approval_history').insert({
        request_type: 'purchase_requisition',
        request_id: selectedRequest.id,
        approver_id: profile?.id,
        approval_level: 1,
        action,
        comments,
      });

      if (historyError) throw historyError;

      setShowModal(false);
      setSelectedRequest(null);
      setComments('');
      loadRequests();
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Purchase Requisition Approvals</h2>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                PR Number
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                Requester
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                Department
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {requests.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                  No pending approvals
                </td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{req.pr_number}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {req.user_profiles?.full_name}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{req.department}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {new Date(req.request_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    ${req.total_amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => {
                        setSelectedRequest(req);
                        setShowModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <Eye size={16} />
                      Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Review Request</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-500">PR Number</label>
                  <p className="text-slate-900 font-medium">{selectedRequest.pr_number}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Requester</label>
                  <p className="text-slate-900">{selectedRequest.user_profiles?.full_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Department</label>
                  <p className="text-slate-900">{selectedRequest.department}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Required Date</label>
                  <p className="text-slate-900">
                    {new Date(selectedRequest.required_date).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-500">Purpose</label>
                <p className="text-slate-900 mt-1">{selectedRequest.purpose}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-500 mb-2 block">Items</label>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">
                          Description
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">
                          Qty
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">
                          Unit
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">
                          Unit Price
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedRequest.items.map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm text-slate-900">{item.description}</td>
                          <td className="px-4 py-2 text-sm text-slate-900">{item.quantity}</td>
                          <td className="px-4 py-2 text-sm text-slate-900">{item.unit}</td>
                          <td className="px-4 py-2 text-sm text-slate-900 text-right">
                            ${item.unit_price.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-sm font-medium text-slate-900 text-right">
                            ${item.total_price.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50">
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-sm font-medium text-slate-900 text-right">
                          Total Amount:
                        </td>
                        <td className="px-4 py-2 text-sm font-bold text-slate-900 text-right">
                          ${selectedRequest.total_amount.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Comments</label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Add your comments..."
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t">
                <button
                  onClick={() => handleAction('rejected')}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <XCircle size={18} />
                  Reject
                </button>
                <button
                  onClick={() => handleAction('approved')}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle size={18} />
                  Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
