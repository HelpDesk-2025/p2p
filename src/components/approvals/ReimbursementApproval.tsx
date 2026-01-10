import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, Eye, X, ArrowRight, Loader2 } from 'lucide-react';
import { getApprovalFlow, getNextApprover, createApprovalLedgerEntry, ApprovalFlow, sendApprovalEmail, getApproverEmail, createRejectedLedgerEntries } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';

interface ReimbursementReq {
  id: string;
  reimb_number: string;
  requester_id: string;
  company_id?: string;
  department?: string;
  request_date: string;
  expense_date: string;
  purpose: string;
  amount: number;
  payment_mode_id?: string;
  status: string;
  current_approval_level: number;
  receipts?: any[];
  user_profiles?: {
    full_name: string;
    email: string;
    company_id: string;
    department?: string;
  };
}

export function ReimbursementApproval() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<ReimbursementReq[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ReimbursementReq | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlow[]>([]);
  const [currentApproverStep, setCurrentApproverStep] = useState<ApprovalFlow | null>(null);

  useEffect(() => {
    loadRequests();
  }, [profile]);

  const loadRequests = async () => {
    if (!profile?.company_id && profile?.role !== 'admin') return;

    const { data } = await supabase
      .from('reimbursement_requests')
      .select(`
        *,
        user_profiles:requester_id (full_name, email, company_id, department)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false});

    if (!data) {
      setRequests([]);
      return;
    }

    // Admin users can see all requests
    if (profile.role === 'admin') {
      setRequests(data);
      return;
    }

    // For non-admin users, check each request to see if they are the current approver
    // This allows cross-company approvals
    const requestsForCurrentUser = await Promise.all(
      data.map(async (req) => {
        // Use the reimbursement request's company_id to look up the correct approval flow
        const reimbCompanyId = req.company_id || req.user_profiles?.company_id;
        if (!reimbCompanyId) return null;

        const { filterApprovalFlowsForRequester } = await import('../../lib/approvalFlow');
        const rawFlows = await getApprovalFlow(
          reimbCompanyId,
          req.department || req.user_profiles?.department || profile.department || '',
          'Reimbursement',
          false,
          req.amount
        );

        // Filter out the requester from approval flows
        const flows = await filterApprovalFlowsForRequester(
          rawFlows,
          req.requester_id,
          req.department || req.user_profiles?.department || '',
          reimbCompanyId
        );

        const currentStep = await getNextApprover(flows, req.current_approval_level);

        if (!currentStep) return null;

        let isCurrentApprover = false;
        const requestDepartment = req.department || req.user_profiles?.department;

        if (currentStep.user_id) {
          isCurrentApprover = currentStep.user_id === profile.id;
        } else {
          const approverType = currentStep.approver_type;

          if (approverType === 'Department Head' && profile.role === 'approver') {
            isCurrentApprover = requestDepartment === profile.department;
          } else if (approverType === 'Procurement' || approverType === 'Procurement Head') {
            isCurrentApprover = profile.role === 'procurement' || profile.role === 'approver' || profile.role === 'admin';
          } else if (approverType === 'President') {
            isCurrentApprover = profile.role === 'approver' || profile.role === 'admin';
          }
        }

        return isCurrentApprover ? req : null;
      })
    );

    const filteredRequests = requestsForCurrentUser.filter(req => req !== null) as ReimbursementReq[];
    setRequests(filteredRequests);
  };

  const handleViewRequest = async (request: ReimbursementReq) => {
    setSelectedRequest(request);
    setShowModal(true);
    setComments('');

    // Use the reimbursement request's company_id to look up the correct approval flow
    const reimbCompanyId = request.company_id || request.user_profiles?.company_id;
    if (reimbCompanyId) {
      const { filterApprovalFlowsForRequester } = await import('../../lib/approvalFlow');
      const rawFlows = await getApprovalFlow(
        reimbCompanyId,
        request.department || request.user_profiles?.department || profile.department || '',
        'Reimbursement',
        false,
        request.amount
      );

      // Filter out the requester from approval flows
      const flows = await filterApprovalFlowsForRequester(
        rawFlows,
        request.requester_id,
        request.department || request.user_profiles?.department || '',
        reimbCompanyId
      );

      setApprovalFlows(flows);

      const currentStep = await getNextApprover(flows, request.current_approval_level);
      setCurrentApproverStep(currentStep);
    }
  };

  const canApprove = (): boolean => {
    if (!profile || !selectedRequest) return false;

    if (profile.role === 'admin') {
      return true;
    }

    if (!currentApproverStep) return false;

    if (currentApproverStep.user_id) {
      return currentApproverStep.user_id === profile.id;
    }

    const approverType = currentApproverStep.approver_type;
    const requestDepartment = selectedRequest.department || selectedRequest.user_profiles?.department;

    if (approverType === 'Department Head' && profile.role === 'approver') {
      return requestDepartment === profile.department;
    }

    if (approverType === 'Procurement' || approverType === 'Procurement Head') {
      return profile.role === 'procurement' || profile.role === 'approver' || profile.role === 'admin';
    }

    if (approverType === 'President') {
      return profile.role === 'approver' || profile.role === 'admin';
    }

    return false;
  };

  const handleAction = async (action: 'approved' | 'rejected') => {
    if (!selectedRequest || !profile?.company_id) return;

    if (!canApprove()) {
      alert('You are not authorized to approve this request at this level.');
      return;
    }

    // Validate comments for rejection
    if (action === 'rejected' && !comments.trim()) {
      alert('Please provide a comment explaining the reason for rejection.');
      return;
    }

    // Confirmation dialog
    const actionText = action === 'approved' ? 'approve' : 'reject';
    const confirmMessage = `Are you sure you want to ${actionText} this Reimbursement (${selectedRequest.reimb_number})?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    if (action === 'approved') {
      setApproving(true);
    } else {
      setRejecting(true);
    }
    setLoading(true);

    try {
      const nextLevel = selectedRequest.current_approval_level + 1;
      const isLastApproval = nextLevel >= approvalFlows.length;
      const newStatus = action === 'rejected' ? 'rejected' : (isLastApproval ? 'approved' : 'pending');

      const { error: updateError } = await supabase
        .from('reimbursement_requests')
        .update({
          status: newStatus,
          current_approval_level: action === 'approved' ? nextLevel : selectedRequest.current_approval_level
        })
        .eq('id', selectedRequest.id);

      if (updateError) throw updateError;

      await createApprovalLedgerEntry(
        'Reimbursement',
        selectedRequest.id,
        selectedRequest.reimb_number,
        profile.id,
        profile.full_name || 'Unknown',
        currentApproverStep?.approver_type || 'Approver',
        action === 'approved' ? 'Approved' : 'Rejected',
        comments,
        selectedRequest.current_approval_level + 1
      );

      const requestDepartment = selectedRequest.department || selectedRequest.user_profiles?.department || 'N/A';

      if (action === 'rejected') {
        await createRejectedLedgerEntries(
          'Reimbursement',
          selectedRequest.id,
          selectedRequest.reimb_number,
          approvalFlows,
          selectedRequest.current_approval_level,
          profile.company_id,
          requestDepartment
        );
      }

      if (action === 'approved' && !isLastApproval) {
        const nextApprover = approvalFlows[nextLevel];
        const nextApproverInfo = await getApproverEmail(
          nextApprover,
          profile.company_id,
          requestDepartment
        );

        if (nextApproverInfo) {
          await sendApprovalEmail(
            nextApproverInfo.email,
            nextApproverInfo.name,
            'Reimbursement',
            selectedRequest.reimb_number,
            selectedRequest.user_profiles?.full_name || 'Unknown',
            requestDepartment,
            selectedRequest.amount,
            'Approved',
            profile.full_name || 'Unknown',
            comments,
            nextApproverInfo.name
          );
        }
      } else if (action === 'approved' && isLastApproval) {
        await sendApprovalEmail(
          selectedRequest.user_profiles?.email || '',
          selectedRequest.user_profiles?.full_name || 'User',
          'Reimbursement',
          selectedRequest.reimb_number,
          selectedRequest.user_profiles?.full_name || 'Unknown',
          requestDepartment,
          selectedRequest.amount,
          'Fully Approved',
          profile.full_name || 'Unknown',
          comments
        );
      } else if (action === 'rejected') {
        await sendApprovalEmail(
          selectedRequest.user_profiles?.email || '',
          selectedRequest.user_profiles?.full_name || 'User',
          'Reimbursement',
          selectedRequest.reimb_number,
          selectedRequest.user_profiles?.full_name || 'Unknown',
          requestDepartment,
          selectedRequest.amount,
          'Rejected',
          profile.full_name || 'Unknown',
          comments
        );
      }

      setShowModal(false);
      setSelectedRequest(null);
      setComments('');
      loadRequests();
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
      setApproving(false);
      setRejecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-slate-900">Reimbursement Approvals</h2>
        <p className="text-slate-600 mt-1">Review and approve reimbursement requests</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {requests.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600">No pending approvals</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Reimbursement Number
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Requester
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Approval Level
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((request) => (
                <tr key={request.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono font-semibold text-slate-900">{request.reimb_number}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900">
                      {request.user_profiles?.full_name}
                    </div>
                    <div className="text-xs text-slate-500">{request.user_profiles?.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-slate-700">
                      {request.department || request.user_profiles?.department || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-semibold text-slate-900">
                      ₱{request.amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-semibold">
                      Level {request.current_approval_level + 1}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleViewRequest(request)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      <Eye size={16} />
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Review Reimbursement Request</h3>
                <p className="text-sm text-slate-600 mt-1">{selectedRequest.reimb_number}</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Reimbursement Number</label>
                  <p className="text-slate-900 font-mono">{selectedRequest.reimb_number}</p>
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
                  <label className="text-sm font-semibold text-slate-700">Amount</label>
                  <p className="text-slate-900 font-bold">₱{selectedRequest.amount.toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Date</label>
                  <p className="text-slate-900">{new Date(selectedRequest.request_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Expense Date</label>
                  <p className="text-slate-900">{new Date(selectedRequest.expense_date).toLocaleDateString()}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Purpose</label>
                <p className="text-slate-900">{selectedRequest.purpose}</p>
              </div>

              <ApprovalProgressTracker
                requestType="Reimbursement"
                requestId={selectedRequest.id}
              />

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Comments</label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Add your comments here..."
                />
              </div>

              {!canApprove() && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-amber-800">
                    You are not authorized to approve this request at the current approval level.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={() => handleAction('approved')}
                  disabled={loading || !canApprove()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
                >
                  {approving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                  {approving ? 'Approving...' : 'Approve'}
                </button>
                <button
                  onClick={() => handleAction('rejected')}
                  disabled={loading || !canApprove()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
                >
                  {rejecting ? <Loader2 size={20} className="animate-spin" /> : <XCircle size={20} />}
                  {rejecting ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
