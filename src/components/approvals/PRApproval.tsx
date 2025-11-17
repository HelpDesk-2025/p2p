import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, Eye, X, ArrowRight, FileText, Download } from 'lucide-react';
import { getApprovalFlow, getNextApprover, createApprovalLedgerEntry, ApprovalFlow, sendApprovalEmail, getApproverEmail } from '../../lib/approvalFlow';
import { createSignedUrl, downloadAttachment } from '../../lib/storageHelper';

interface PurchaseReq {
  id: string;
  document_no: string;
  pr_number: string;
  requester_id: string;
  department: string;
  request_date: string;
  required_date: string;
  purpose: string;
  description: string;
  is_budgeted: boolean;
  total_amount: number;
  status: string;
  current_approval_level: number;
  items: any[];
  attachments?: any[];
  merged_pdf?: string;
  attachment_paths?: Array<{
    path: string;
    name: string;
    type: string;
    size: number;
  }>;
  checklist_items?: any[];
  payment_mode_id?: string;
  payment_mode_lines?: any[];
  pr_checklist_id?: string;
  purchase_type?: string;
  payee?: string;
  amount_net_vat?: number;
  user_profiles?: {
    full_name: string;
    email: string;
    company_id: string;
  };
  payment_modes?: {
    mode_name: string;
  };
  pr_checklists?: {
    pr_type: string;
  };
}

export function PRApproval() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<PurchaseReq[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PurchaseReq | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlow[]>([]);
  const [currentApproverStep, setCurrentApproverStep] = useState<ApprovalFlow | null>(null);

  useEffect(() => {
    loadRequests();
  }, [profile]);

  const loadRequests = async () => {
    if (!profile?.company_id) return;

    const { data } = await supabase
      .from('purchase_requisitions')
      .select(`
        *,
        user_profiles:requester_id (full_name, email, company_id),
        payment_modes:payment_mode_id (mode_name),
        pr_checklists:pr_checklist_id (pr_type)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!data) {
      setRequests([]);
      return;
    }

    const companyFilteredRequests = data.filter(req =>
      req.user_profiles?.company_id === profile.company_id
    );

    if (profile.role === 'admin') {
      setRequests(companyFilteredRequests);
      return;
    }

    const requestsForCurrentUser = await Promise.all(
      companyFilteredRequests.map(async (req) => {
        const flows = await getApprovalFlow(
          profile.company_id,
          req.department,
          'Purchase Requisition',
          req.is_budgeted,
          req.total_amount
        );

        const currentStep = await getNextApprover(flows, req.current_approval_level);

        if (!currentStep) return null;

        let isCurrentApprover = false;

        if (currentStep.user_id) {
          isCurrentApprover = currentStep.user_id === profile.id;
        } else {
          const approverType = currentStep.approver_type;

          if (approverType === 'Department Head' && profile.role === 'approver') {
            isCurrentApprover = req.department === profile.department;
          } else if (approverType === 'Procurement' || approverType === 'Procurement Head') {
            isCurrentApprover = profile.role === 'approver';
          } else if (approverType === 'President') {
            isCurrentApprover = profile.role === 'approver';
          }
        }

        return isCurrentApprover ? req : null;
      })
    );

    const filteredRequests = requestsForCurrentUser.filter(req => req !== null) as PurchaseReq[];
    setRequests(filteredRequests);
  };

  const handleViewRequest = async (request: PurchaseReq) => {
    setSelectedRequest(request);
    setShowModal(true);
    setComments('');

    if (profile?.company_id) {
      const flows = await getApprovalFlow(
        profile.company_id,
        request.department,
        'Purchase Requisition',
        request.is_budgeted,
        request.total_amount
      );
      setApprovalFlows(flows);

      const currentStep = await getNextApprover(flows, request.current_approval_level);
      setCurrentApproverStep(currentStep);
    }
  };

  const canApprove = (): boolean => {
    if (!profile) return false;

    if (profile.role === 'admin') {
      return true;
    }

    if (!currentApproverStep) return false;

    if (currentApproverStep.user_id) {
      return currentApproverStep.user_id === profile.id;
    }

    const approverType = currentApproverStep.approver_type;

    if (approverType === 'Department Head' && profile.role === 'approver') {
      return selectedRequest?.department === profile.department;
    }

    if (approverType === 'Procurement' || approverType === 'Procurement Head') {
      return profile.role === 'approver';
    }

    if (approverType === 'President') {
      return profile.role === 'approver';
    }

    return false;
  };

  const handleAction = async (action: 'approved' | 'rejected') => {
    if (!selectedRequest || !profile?.company_id) return;

    if (!canApprove()) {
      alert('You are not authorized to approve this request at this level.');
      return;
    }

    setLoading(true);

    try {
      const nextLevel = selectedRequest.current_approval_level + 1;
      const isLastApproval = nextLevel >= approvalFlows.length;
      const newStatus = action === 'rejected' ? 'rejected' : (isLastApproval ? 'approved' : 'pending');

      const { error: updateError } = await supabase
        .from('purchase_requisitions')
        .update({
          status: newStatus,
          current_approval_level: action === 'approved' ? nextLevel : selectedRequest.current_approval_level
        })
        .eq('id', selectedRequest.id);

      if (updateError) throw updateError;

      await createApprovalLedgerEntry(
        'Purchase Requisition',
        selectedRequest.id,
        selectedRequest.document_no,
        profile.id,
        profile.full_name || 'Unknown',
        currentApproverStep?.approver_type || 'Approver',
        action === 'approved' ? 'Approved' : 'Rejected',
        comments,
        selectedRequest.current_approval_level + 1
      );

      if (action === 'approved' && !isLastApproval) {
        const nextApprover = approvalFlows[nextLevel];
        const nextApproverInfo = await getApproverEmail(
          nextApprover,
          profile.company_id,
          selectedRequest.department
        );

        if (nextApproverInfo) {
          await sendApprovalEmail(
            nextApproverInfo.email,
            nextApproverInfo.name,
            'Purchase Requisition',
            selectedRequest.document_no,
            selectedRequest.user_profiles?.full_name || 'Unknown',
            selectedRequest.department,
            selectedRequest.total_amount,
            'Approved',
            profile.full_name || 'Unknown',
            comments,
            nextApprover.approver_type
          );
        }
      } else if (action === 'approved' && isLastApproval) {
        await sendApprovalEmail(
          selectedRequest.user_profiles?.email || '',
          selectedRequest.user_profiles?.full_name || 'User',
          'Purchase Requisition',
          selectedRequest.document_no,
          selectedRequest.user_profiles?.full_name || 'Unknown',
          selectedRequest.department,
          selectedRequest.total_amount,
          'Fully Approved',
          profile.full_name || 'Unknown',
          comments
        );
      } else if (action === 'rejected') {
        await sendApprovalEmail(
          selectedRequest.user_profiles?.email || '',
          selectedRequest.user_profiles?.full_name || 'User',
          'Purchase Requisition',
          selectedRequest.document_no,
          selectedRequest.user_profiles?.full_name || 'Unknown',
          selectedRequest.department,
          selectedRequest.total_amount,
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
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-slate-900">Purchase Requisition Approvals</h2>
        <p className="text-slate-600 mt-1">Review and approve purchase requisitions</p>
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
                  Document No.
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  PR Number
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Requester
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Total Amount
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
                    <span className="font-mono font-semibold text-slate-900">{request.document_no}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono text-slate-700">{request.pr_number}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900">
                      {request.user_profiles?.full_name}
                    </div>
                    <div className="text-xs text-slate-500">{request.user_profiles?.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-slate-700">{request.department}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-semibold text-slate-900">
                      ₱{request.total_amount.toLocaleString()}
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
                <h3 className="text-xl font-bold text-slate-900">Review Purchase Requisition</h3>
                <p className="text-sm text-slate-600 mt-1">{selectedRequest.document_no}</p>
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
                  <label className="text-sm font-semibold text-slate-700">PR Number</label>
                  <p className="text-slate-900 font-mono">{selectedRequest.pr_number}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Department</label>
                  <p className="text-slate-900">{selectedRequest.department}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Requester</label>
                  <p className="text-slate-900">{selectedRequest.user_profiles?.full_name}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Total Amount</label>
                  <p className="text-slate-900 font-bold">₱{selectedRequest.total_amount.toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Budget Status</label>
                  <p className="text-slate-900">{selectedRequest.is_budgeted ? 'Budgeted' : 'Non-Budgeted'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Required Date</label>
                  <p className="text-slate-900">{new Date(selectedRequest.required_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Purchase Type</label>
                  <p className="text-slate-900">{selectedRequest.purchase_type || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">PR Checklist</label>
                  <p className="text-slate-900">{selectedRequest.pr_checklists?.pr_type || 'N/A'}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Description</label>
                <p className="text-slate-900">{selectedRequest.description}</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Purpose</label>
                <p className="text-slate-900">{selectedRequest.purpose}</p>
              </div>

              {selectedRequest.payee && (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-semibold text-slate-700">Payee</label>
                    <p className="text-slate-900">{selectedRequest.payee}</p>
                  </div>
                  {selectedRequest.amount_net_vat !== undefined && (
                    <div>
                      <label className="text-sm font-semibold text-slate-700">Amount (Net of VAT)</label>
                      <p className="text-slate-900 font-bold">₱{selectedRequest.amount_net_vat.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              )}

              {selectedRequest.items && selectedRequest.items.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Items</label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Description</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Quantity</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Unit</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Unit Price</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedRequest.items.map((item: any, index: number) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-slate-900">{item.description}</td>
                            <td className="px-4 py-2 text-sm text-slate-700">{item.quantity}</td>
                            <td className="px-4 py-2 text-sm text-slate-700">{item.unit}</td>
                            <td className="px-4 py-2 text-sm text-slate-700">₱{item.unit_price.toFixed(2)}</td>
                            <td className="px-4 py-2 text-sm font-semibold text-slate-900">
                              ₱{item.total_price.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedRequest.payment_modes && (
                <div>
                  <label className="text-sm font-semibold text-slate-700">Payment Mode</label>
                  <p className="text-slate-900">{selectedRequest.payment_modes.mode_name}</p>
                </div>
              )}

              {selectedRequest.payment_mode_lines && selectedRequest.payment_mode_lines.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Payment Mode Details</label>
                  <div className="space-y-3">
                    {selectedRequest.payment_mode_lines.map((line: any, index: number) => (
                      <div key={index} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-700">{line.name}</span>
                          <span className="text-sm text-slate-900 font-semibold">{line.value || 'N/A'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRequest.attachment_paths && selectedRequest.attachment_paths.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Attachments</label>
                  <div className="space-y-2">
                    {selectedRequest.attachment_paths.map((attachment, index) => (
                      <div key={index} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                        <div className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                              <FileText className="text-blue-600" size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{attachment.name}</p>
                              <p className="text-xs text-slate-600">{(attachment.size / 1024).toFixed(2)} KB</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  const signedUrl = await createSignedUrl(attachment.path, 300);
                                  window.open(signedUrl, '_blank');
                                } catch (error) {
                                  alert('Error viewing file');
                                }
                              }}
                              className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition font-semibold flex items-center gap-2"
                            >
                              <Eye size={16} />
                              View
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const blob = await downloadAttachment(attachment.path);
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = attachment.name;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                } catch (error) {
                                  alert('Error downloading file');
                                }
                              }}
                              className="px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition font-semibold flex items-center gap-2"
                            >
                              <Download size={16} />
                              Download
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRequest.merged_pdf && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Legacy Attachments</label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-lg">
                          <FileText className="text-red-600" size={24} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Merged Attachments</p>
                          <p className="text-xs text-slate-600">All checklist attachments in one PDF</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const blob = fetch(selectedRequest.merged_pdf!)
                              .then(res => res.blob())
                              .then(blob => {
                                const url = URL.createObjectURL(blob);
                                window.open(url, '_blank');
                              });
                          }}
                          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition font-semibold flex items-center gap-2"
                        >
                          <Eye size={16} />
                          View PDF
                        </button>
                        <a
                          href={selectedRequest.merged_pdf}
                          download={`PR_${selectedRequest.pr_number}_Attachments.pdf`}
                          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition font-semibold"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {approvalFlows.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                    <ArrowRight size={16} />
                    Approval Flow Progress
                  </h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    {approvalFlows.map((flow, index) => (
                      <div key={flow.id} className="flex items-center gap-2">
                        <div className={`px-3 py-2 rounded-lg text-xs font-semibold ${
                          index < selectedRequest.current_approval_level
                            ? 'bg-green-600 text-white'
                            : index === selectedRequest.current_approval_level
                            ? 'bg-yellow-500 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}>
                          {flow.approver_type}
                        </div>
                        {index < approvalFlows.length - 1 && (
                          <ArrowRight size={16} className="text-slate-400" />
                        )}
                      </div>
                    ))}
                  </div>
                  {currentApproverStep && (
                    <p className="text-xs text-blue-700 mt-3">
                      Current step: <span className="font-bold">{currentApproverStep.approver_type}</span>
                    </p>
                  )}
                </div>
              )}

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
                  <CheckCircle size={20} />
                  Approve
                </button>
                <button
                  onClick={() => handleAction('rejected')}
                  disabled={loading || !canApprove()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
                >
                  <XCircle size={20} />
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
