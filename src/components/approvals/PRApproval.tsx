import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, Eye, X, ArrowRight, FileText, Download, RefreshCw, Send, Loader2 } from 'lucide-react';
import { getApprovalFlow, getNextApprover, createApprovalLedgerEntry, ApprovalFlow, sendApprovalEmail, getApproverEmail, createRejectedLedgerEntries, filterApprovalFlowsForRequester } from '../../lib/approvalFlow';
import { createSignedUrl, downloadAttachment } from '../../lib/storageHelper';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { generateAndUploadRFP } from '../../lib/rfpGenerator';

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
  merged_pdf_path?: string;
  msbc_posting_status?: string;
  msbc_posting_date?: string;
  msbc_journal_batch_id?: string;
  msbc_error_message?: string;
  merged_rfp_attachment_path?: string;
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
      .from('purchase_requisitions')
      .select(`
        *,
        user_profiles:requester_id (full_name, email, company_id),
        payment_modes:payment_mode_id (mode_name),
        pr_checklists:pr_checklist_id (pr_type, item_name)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!data) {
      setRequests([]);
      return;
    }

    // Admin users can see all requests, others only see their company's requests
    const companyFilteredRequests = profile.role === 'admin'
      ? data
      : data.filter(req => req.user_profiles?.company_id === profile.company_id);

    if (profile.role === 'admin') {
      setRequests(companyFilteredRequests);
      return;
    }

    const requestsForCurrentUser = await Promise.all(
      companyFilteredRequests.map(async (req) => {
        const rawFlows = await getApprovalFlow(
          profile.company_id,
          req.department,
          'Purchase Requisition',
          req.is_budgeted,
          req.total_amount
        );

        // Filter out the requester from approval flows
        const flows = await filterApprovalFlowsForRequester(
          rawFlows,
          req.requester_id,
          req.department,
          profile.company_id
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
            isCurrentApprover = profile.role === 'procurement' || profile.role === 'approver' || profile.role === 'admin';
          } else if (approverType === 'President') {
            isCurrentApprover = profile.role === 'approver' || profile.role === 'admin';
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
      const rawFlows = await getApprovalFlow(
        profile.company_id,
        request.department,
        'Purchase Requisition',
        request.is_budgeted,
        request.total_amount
      );

      // Filter out the requester from approval flows
      const flows = await filterApprovalFlowsForRequester(
        rawFlows,
        request.requester_id,
        request.department,
        profile.company_id
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
    const confirmMessage = `Are you sure you want to ${actionText} this Purchase Requisition (${selectedRequest.document_no})?`;

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
      console.log('🎯 Processing approval action:', action);
      console.log('📊 Current approval level:', selectedRequest.current_approval_level);
      console.log('📋 Total approval steps:', approvalFlows.length);

      const currentLevel = selectedRequest.current_approval_level;
      const nextLevel = currentLevel + 1;
      const isLastApproval = nextLevel >= approvalFlows.length;

      // STRICT: If rejected, entire request is rejected
      if (action === 'rejected') {
        console.log('❌ REJECTION: Cascading rejection to all remaining steps');

        // Update request status to rejected
        const { error: updateError } = await supabase
          .from('purchase_requisitions')
          .update({
            status: 'rejected',
            current_approval_level: currentLevel
          })
          .eq('id', selectedRequest.id);

        if (updateError) throw updateError;

        // Create ledger entry for this rejection
        await createApprovalLedgerEntry(
          'Purchase Requisition',
          selectedRequest.id,
          selectedRequest.document_no,
          profile.id,
          profile.full_name || 'Unknown',
          currentApproverStep?.approver_type || 'Approver',
          'Rejected',
          comments,
          currentLevel + 1
        );

        // Create auto-rejected entries for all remaining approvers
        await createRejectedLedgerEntries(
          'Purchase Requisition',
          selectedRequest.id,
          selectedRequest.document_no,
          approvalFlows,
          currentLevel,
          profile.company_id,
          selectedRequest.department
        );

        // Notify requester of rejection
        console.log('📧 Notifying requester of rejection');
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

        console.log('✅ Rejection process completed');
      }
      // STRICT: If approved, move to next step or mark as fully approved
      else if (action === 'approved') {
        const newStatus = isLastApproval ? 'approved' : 'pending';

        console.log(`✅ APPROVAL: Moving from step ${currentLevel + 1} to ${isLastApproval ? 'COMPLETED' : `step ${nextLevel + 1}`}`);

        // Update request with new level (and MSBC status if final approval for Non-PO)
        const updatePayload: any = {
          status: newStatus,
          current_approval_level: nextLevel
        };

        // For final approval of Non-PO requests, set MSBC posting status optimistically
        if (isLastApproval && selectedRequest.purchase_type !== 'Purchase Order') {
          updatePayload.msbc_posting_status = 'Success';
          updatePayload.msbc_posting_date = new Date().toISOString();
          // Also update msbc_sync_status for backward compatibility with UI
          updatePayload.msbc_sync_status = 'synced';
          updatePayload.msbc_sync_date = new Date().toISOString();
        }

        const { error: updateError } = await supabase
          .from('purchase_requisitions')
          .update(updatePayload)
          .eq('id', selectedRequest.id);

        if (updateError) throw updateError;

        // Create ledger entry for this approval FIRST (before RFP generation)
        await createApprovalLedgerEntry(
          'Purchase Requisition',
          selectedRequest.id,
          selectedRequest.document_no,
          profile.id,
          profile.full_name || 'Unknown',
          currentApproverStep?.approver_type || 'Approver',
          'Approved',
          comments,
          currentLevel + 1
        );

        // Generate RFP PDF if this is the final approval (AFTER ledger entry)
        // Only generate RFP for Non-Purchase Order requests
        if (isLastApproval && selectedRequest.purchase_type !== 'Purchase Order') {
          try {
            console.log('🎯 Final approval - generating RFP for Non-PO request with all approval records');
            // Delay to ensure database transaction is fully committed including foreign key joins
            await new Promise(resolve => setTimeout(resolve, 3000));
            await generateAndUploadRFP('purchase_requisition', selectedRequest.id, selectedRequest.document_no);
            console.log('✅ RFP generated successfully for', selectedRequest.document_no);

            // MSBC posting status was already set to Success in the approval update above
            console.log('✅ MSBC posting status already set to Success');

            // Post to MSBC and wait for completion
            console.log('🚀 Posting PR to MSBC...');
            const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/post-pr-to-msbc`;
            const headers = {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            };

            try {
              const response = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({ requestId: selectedRequest.id }),
              });

              if (response.ok) {
                console.log('✅ PR posted to MSBC successfully');
              } else {
                console.error('❌ Error posting to MSBC');
              }
            } catch (error) {
              console.error('❌ Error posting to MSBC:', error);
            }
          } catch (rfpError) {
            console.error('❌ Error generating RFP:', rfpError);
            // Don't fail the approval if RFP generation fails
          }
        } else if (isLastApproval) {
          console.log('⏭️ Skipping RFP generation for Purchase Order request:', selectedRequest.document_no);
        }

        // STRICT: Send email ONLY to next approver (sequential approval)
        if (!isLastApproval) {
          const nextApprover = approvalFlows[nextLevel];
          console.log(`👤 Next approver (Step ${nextLevel + 1}):`, nextApprover.approver_type);

          const nextApproverInfo = await getApproverEmail(
            nextApprover,
            profile.company_id,
            selectedRequest.department
          );

          if (!nextApproverInfo) {
            throw new Error(`Could not find email for next approver: ${nextApprover.approver_type}`);
          }

          console.log(`📧 Sending email to Step ${nextLevel + 1} approver:`, nextApproverInfo.name);

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
            nextApproverInfo.name
          );

          console.log(`✅ Step ${currentLevel + 1} approved, waiting for Step ${nextLevel + 1}`);
        }
        // This was the last approval - notify requester
        else {
          console.log('🎉 FINAL APPROVAL: All steps completed');
          console.log('📧 Notifying requester of full approval');

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

          console.log('✅ Request fully approved and requester notified');
        }
      }

      setShowModal(false);
      setSelectedRequest(null);
      setComments('');
      loadRequests();
    } catch (error: any) {
      console.error('❌ Error processing approval:', error);
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
                {selectedRequest.purchase_type === 'Non-Purchase Order' && (
                  <div>
                    <label className="text-sm font-semibold text-slate-700">Total Amount</label>
                    <p className="text-slate-900 font-bold">₱{selectedRequest.total_amount.toLocaleString()}</p>
                  </div>
                )}
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
                  <p className="text-slate-900">{selectedRequest.pr_checklists?.item_name || 'N/A'}</p>
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

              {selectedRequest.items && selectedRequest.items.length > 0 && (() => {
                // Filter items to only show those with valid total_price > 0
                const validItems = selectedRequest.items.filter((item: any) => item.total_price > 0);

                if (validItems.length === 0) return null;

                return (
                  <div>
                    <label className="text-sm font-semibold text-slate-700 mb-3 block">Items</label>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Item Name</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Description</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Quantity</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Unit</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Unit Price</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Total Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {validItems.map((item: any, index: number) => (
                            <tr key={index}>
                              <td className="px-4 py-2 text-sm text-slate-900">{item.item_description || item.description || 'N/A'}</td>
                              <td className="px-4 py-2 text-sm text-slate-700">{item.item_notes || '-'}</td>
                              <td className="px-4 py-2 text-sm text-slate-700">{item.quantity}</td>
                              <td className="px-4 py-2 text-sm text-slate-700">{item.unit}</td>
                              <td className="px-4 py-2 text-sm text-slate-700">₱{item.unit_price?.toFixed(2) || '0.00'}</td>
                              <td className="px-4 py-2 text-sm text-slate-900 font-semibold">₱{item.total_price?.toFixed(2) || '0.00'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

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

              {selectedRequest.msbc_posting_status && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">MSBC Posting Status</label>
                  <div className={`border rounded-lg p-4 ${
                    selectedRequest.msbc_posting_status === 'Success' ? 'bg-green-50 border-green-200' :
                    selectedRequest.msbc_posting_status === 'Failed' ? 'bg-red-50 border-red-200' :
                    'bg-yellow-50 border-yellow-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {selectedRequest.msbc_posting_status === 'Success' && (
                          <CheckCircle className="text-green-600" size={24} />
                        )}
                        {selectedRequest.msbc_posting_status === 'Failed' && (
                          <XCircle className="text-red-600" size={24} />
                        )}
                        {selectedRequest.msbc_posting_status === 'Pending' && (
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-600"></div>
                        )}
                        <div>
                          <p className={`font-semibold ${
                            selectedRequest.msbc_posting_status === 'Success' ? 'text-green-900' :
                            selectedRequest.msbc_posting_status === 'Failed' ? 'text-red-900' :
                            'text-yellow-900'
                          }`}>
                            {selectedRequest.msbc_posting_status}
                          </p>
                          {selectedRequest.msbc_posting_date && (
                            <p className="text-xs text-slate-600">
                              Posted on {new Date(selectedRequest.msbc_posting_date).toLocaleString()}
                            </p>
                          )}
                          {selectedRequest.msbc_journal_batch_id && (
                            <p className="text-xs text-slate-600">
                              Journal Batch ID: {selectedRequest.msbc_journal_batch_id}
                            </p>
                          )}
                          {selectedRequest.msbc_error_message && (
                            <p className="text-xs text-red-700 mt-1">
                              Error: {selectedRequest.msbc_error_message}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedRequest.merged_pdf_path && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Attachments</label>
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
                          onClick={async () => {
                            try {
                              const signedUrl = await createSignedUrl(selectedRequest.merged_pdf_path!, 300);
                              window.open(signedUrl, '_blank');
                            } catch (error) {
                              alert('Error viewing PDF');
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition font-semibold flex items-center gap-2"
                        >
                          <Eye size={16} />
                          View PDF
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const blob = await downloadAttachment(selectedRequest.merged_pdf_path!);
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `PR_${selectedRequest.pr_number}_Attachments.pdf`;
                              a.click();
                              URL.revokeObjectURL(url);
                            } catch (error) {
                              alert('Error downloading PDF');
                            }
                          }}
                          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition font-semibold flex items-center gap-2"
                        >
                          <Download size={16} />
                          Download
                        </button>
                      </div>
                    </div>
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

              <ApprovalProgressTracker
                requestType="Purchase Requisition"
                requestId={selectedRequest.id}
              />

              {profile?.role === 'admin' && selectedRequest.status === 'approved' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Admin Actions</label>
                  <button
                    onClick={async () => {
                      if (!confirm('Are you sure you want to regenerate the RFP document?')) return;
                      setLoading(true);
                      try {
                        await generateAndUploadRFP('purchase_requisition', selectedRequest.id, selectedRequest.document_no);
                        alert('RFP regenerated successfully!');
                        fetchRequests();
                      } catch (error) {
                        console.error('Error regenerating RFP:', error);
                        alert('Failed to regenerate RFP: ' + (error as Error).message);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
                  >
                    <RefreshCw size={18} />
                    Regenerate RFP
                  </button>
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
