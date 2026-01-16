import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, Eye, X, ArrowRight, Loader2, Download } from 'lucide-react';
import { getApprovalFlow, getNextApprover, createApprovalLedgerEntry, ApprovalFlow, sendApprovalEmail, getApproverEmail, createRejectedLedgerEntries } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { generateReimbursementForm } from '../../lib/reimbursementFormGenerator';

interface ReimbursementReq {
  id: string;
  reimb_number: string;
  requester_id: string;
  company_id?: string;
  department?: string;
  request_date: string;
  payee?: string;
  purpose: string;
  amount: number;
  payment_mode_id?: string;
  status: string;
  current_approval_level: number;
  receipts?: any[];
  expense_items?: Array<{
    date: string;
    description: string;
    amount: number;
  }>;
  cash_advance?: number;
  request_type?: string;
  merged_pdf_path?: string;
  linked_cash_advance_id?: string;
  cash_advance_type?: string;
  user_profiles?: {
    full_name: string;
    email: string;
    company_id: string;
    department?: string;
  };
  companies?: {
    name: string;
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
  const [linkedRequestDetails, setLinkedRequestDetails] = useState<any>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState<string>('');
  const [showLinkedPdfPreview, setShowLinkedPdfPreview] = useState(false);
  const [linkedPdfPreviewUrl, setLinkedPdfPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, [profile]);

  const loadRequests = async () => {
    if (!profile?.company_id && profile?.role !== 'admin') return;

    const { data } = await supabase
      .from('reimbursement_requests')
      .select(`
        *,
        user_profiles:requester_id (full_name, email, company_id, department),
        companies!reimbursement_requests_company_id_fkey (id, name),
        request_type,
        linked_cash_advance_id,
        cash_advance_type
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

  const loadLinkedRequestDetails = async (linkedId: string, type: 'Cash Advance' | 'Petty Cash') => {
    try {
      if (type === 'Cash Advance') {
        const { data, error } = await supabase
          .from('cash_advance_requests')
          .select('id, ca_number, request_date, amount, purpose, approved_ca_pdf_path')
          .eq('id', linkedId)
          .single();

        if (error) throw error;
        setLinkedRequestDetails({
          ...data,
          type: 'Cash Advance',
          display_number: data.ca_number,
          rfp_pdf_path: data.approved_ca_pdf_path // Map to rfp_pdf_path for consistency
        });
      } else if (type === 'Petty Cash') {
        const { data, error } = await supabase
          .from('petty_cash_requests')
          .select('id, pc_number, request_date, amount, purpose, approved_petty_cash_pdf_path')
          .eq('id', linkedId)
          .single();

        if (error) throw error;
        setLinkedRequestDetails({
          ...data,
          type: 'Petty Cash',
          display_number: data.pc_number,
          rfp_pdf_path: data.approved_petty_cash_pdf_path // Map to rfp_pdf_path for consistency
        });
      }
    } catch (error) {
      console.error('Error loading linked request details:', error);
    }
  };

  const downloadAttachments = async (pdfPath: string, reimbNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reimbNumber}_Attachments.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading attachments:', error);
      alert('Failed to download attachments');
    }
  };

  const previewAttachments = async (pdfPath: string, title: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      setPdfPreviewUrl(url);
      setPdfPreviewTitle(title);
      setShowPdfPreview(true);
    } catch (error) {
      console.error('Error loading PDF preview:', error);
      alert('Failed to load PDF preview');
    }
  };

  const closePdfPreview = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }
    setPdfPreviewUrl(null);
    setPdfPreviewTitle('');
    setShowPdfPreview(false);
  };

  const previewLinkedRequest = async (pdfPath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      setLinkedPdfPreviewUrl(url);
      setShowLinkedPdfPreview(true);
    } catch (error) {
      console.error('Error loading PDF preview:', error);
      alert('Failed to load PDF preview');
    }
  };

  const closeLinkedPdfPreview = () => {
    if (linkedPdfPreviewUrl) {
      URL.revokeObjectURL(linkedPdfPreviewUrl);
    }
    setLinkedPdfPreviewUrl(null);
    setShowLinkedPdfPreview(false);
  };

  const handleViewRequest = async (request: ReimbursementReq) => {
    setSelectedRequest(request);
    setShowModal(true);
    setComments('');
    setLinkedRequestDetails(null);

    // Load linked request details if this is a liquidation
    if ((request as any).request_type === 'Liquidation' && (request as any).linked_cash_advance_id && (request as any).cash_advance_type) {
      await loadLinkedRequestDetails((request as any).linked_cash_advance_id, (request as any).cash_advance_type);
    }

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

      // Use the actual request type for ledger entries
      const actualRequestType = selectedRequest.request_type || 'Reimbursement';

      await createApprovalLedgerEntry(
        actualRequestType,
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
          actualRequestType,
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
            actualRequestType,
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
        // Generate reimbursement form PDF
        try {
          // Get linked request details if this is a liquidation
          let linkedDetails = null;
          if (selectedRequest.request_type === 'Liquidation' && selectedRequest.linked_cash_advance_id) {
            const linkedType = selectedRequest.cash_advance_type;
            const linkedId = selectedRequest.linked_cash_advance_id;

            if (linkedType === 'Cash Advance') {
              const { data, error } = await supabase
                .from('cash_advance_requests')
                .select('ca_number, request_date, amount, purpose, rfp_pdf_path')
                .eq('id', linkedId)
                .single();

              if (!error && data) {
                linkedDetails = {
                  type: 'Cash Advance',
                  display_number: data.ca_number,
                  request_date: data.request_date,
                  amount: data.amount,
                  purpose: data.purpose,
                  rfp_pdf_path: data.rfp_pdf_path
                };
              }
            } else if (linkedType === 'Petty Cash') {
              const { data, error } = await supabase
                .from('petty_cash_requests')
                .select('pc_number, request_date, amount, purpose')
                .eq('id', linkedId)
                .single();

              if (!error && data) {
                linkedDetails = {
                  type: 'Petty Cash',
                  display_number: data.pc_number,
                  request_date: data.request_date,
                  amount: data.amount,
                  purpose: data.purpose
                };
              }
            }
          }

          // Get all approval records from the ledger (use actual request type)
          const { data: approvalRecords, error: ledgerError } = await supabase
            .from('approval_ledger')
            .select('approver_name, approval_date, approver_id')
            .eq('request_id', selectedRequest.id)
            .eq('request_type', actualRequestType)
            .eq('action', 'Approved')
            .order('sequence', { ascending: true });

          if (ledgerError) throw ledgerError;

          // Get e-signatures for all approvers
          const approverIds = (approvalRecords || []).map((record: any) => record.approver_id);
          const { data: approverProfiles, error: profilesError } = await supabase
            .from('user_profiles')
            .select('id, e_sig')
            .in('id', approverIds);

          if (profilesError) throw profilesError;

          // Use the requester info from the fetched request
          const requesterData = {
            full_name: selectedRequest.user_profiles?.full_name || 'Unknown',
            e_sig: selectedRequest.user_profiles?.e_sig || null
          };

          // Create a map of approver IDs to their e-signatures
          const esigMap = new Map<string, string | null>();
          (approverProfiles || []).forEach((profile: any) => {
            esigMap.set(profile.id, profile.e_sig);
          });

          // Prepare approval records with esig
          const approvals = (approvalRecords || []).map((record: any) => ({
            approver_name: record.approver_name,
            approver_esig: esigMap.get(record.approver_id) || null,
            approval_date: record.approval_date,
          }));

          // Calculate net amount
          const netAmount = selectedRequest.amount - (selectedRequest.cash_advance || 0);

          // Get company name
          const companyName = selectedRequest.companies?.name || 'N/A';

          // Generate the reimbursement form PDF
          const reimbursementFormBytes = await generateReimbursementForm({
            reimbNumber: selectedRequest.reimb_number,
            requestType: selectedRequest.request_type || 'Reimbursement',
            requestedBy: requesterData.full_name || 'Unknown',
            requestedByEsig: requesterData.e_sig || null,
            requestDate: new Date(selectedRequest.request_date).toLocaleDateString(),
            company: companyName,
            department: selectedRequest.department || 'N/A',
            linkedRequestType: linkedDetails?.type || undefined,
            linkedRequestNumber: linkedDetails?.display_number || undefined,
            linkedRequestDate: linkedDetails?.request_date ? new Date(linkedDetails.request_date).toLocaleDateString() : undefined,
            linkedRequestAmount: linkedDetails?.amount || undefined,
            linkedRequestPurpose: linkedDetails?.purpose || undefined,
            purpose: selectedRequest.purpose,
            expenseItems: selectedRequest.expense_items || [],
            totalExpenditures: selectedRequest.amount,
            cashAdvance: selectedRequest.cash_advance || 0,
            netAmount: netAmount,
            payee: selectedRequest.payee || selectedRequest.user_profiles?.full_name || 'Unknown',
            approvals: approvals
          });

          // Upload the reimbursement form to storage
          const timestamp = Date.now();
          const formPath = `reimbursement-forms/${selectedRequest.id}_${timestamp}_form.pdf`;

          const { error: uploadError } = await supabase.storage
            .from('attachments')
            .upload(formPath, reimbursementFormBytes, {
              contentType: 'application/pdf',
              upsert: true
            });

          if (uploadError) throw uploadError;

          // Update the request with the new form path
          const { error: updateError } = await supabase
            .from('reimbursement_requests')
            .update({
              reimbursement_form_pdf_path: formPath,
              updated_at: new Date().toISOString()
            })
            .eq('id', selectedRequest.id);

          if (updateError) throw updateError;

        } catch (pdfError: any) {
          console.error('Error generating reimbursement form:', pdfError);
          // Don't fail the approval if PDF generation fails
        }

        await sendApprovalEmail(
          selectedRequest.user_profiles?.email || '',
          selectedRequest.user_profiles?.full_name || 'User',
          actualRequestType,
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
          actualRequestType,
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
      setLinkedRequestDetails(null);
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
                onClick={() => {
                  setShowModal(false);
                  setLinkedRequestDetails(null);
                }}
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
                  <label className="text-sm font-semibold text-slate-700">Company</label>
                  <p className="text-slate-900">{selectedRequest.companies?.name || 'N/A'}</p>
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
                  <p className="text-slate-900 font-bold">
                    ₱{Math.abs(selectedRequest.amount - (selectedRequest.cash_advance || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Date</label>
                  <p className="text-slate-900">{new Date(selectedRequest.request_date).toLocaleDateString()}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Purpose</label>
                <p className="text-slate-900">{selectedRequest.purpose}</p>
              </div>

              {/* Expense Itemization */}
              {selectedRequest.expense_items && selectedRequest.expense_items.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 block">Expense Itemization</label>
                  <div className="border border-slate-300 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Supplier Name/Vendor Name</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedRequest.expense_items.map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-slate-700">{new Date(item.date).toLocaleDateString()}</td>
                            <td className="px-4 py-2 text-sm text-slate-700">{item.description}</td>
                            <td className="px-4 py-2 text-sm text-slate-900 font-medium">
                              ₱{item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t">
                        <tr>
                          <td colSpan={2} className="px-4 py-2 text-right font-semibold text-slate-700">
                            Total Expenditures:
                          </td>
                          <td className="px-4 py-2 font-bold text-slate-900">
                            ₱{selectedRequest.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={2} className="px-4 py-2 text-right font-semibold text-slate-700">
                            Less: Cash Advance:
                          </td>
                          <td className="px-4 py-2 font-semibold text-slate-900">
                            ₱{(selectedRequest.cash_advance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                        <tr className="border-t-2 border-slate-300">
                          <td colSpan={2} className="px-4 py-2 text-right font-bold text-slate-900">
                            {(selectedRequest.amount - (selectedRequest.cash_advance || 0)) >= 0 ? 'Over for Reimbursement:' : 'Excess for Deposit:'}
                          </td>
                          <td className="px-4 py-2 font-bold text-lg text-slate-900">
                            ₱{Math.abs(selectedRequest.amount - (selectedRequest.cash_advance || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {(selectedRequest as any).request_type === 'Liquidation' && linkedRequestDetails && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Linked Request Details</label>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-xs font-medium text-slate-600">Type</label>
                      <p className="text-sm text-slate-900">{linkedRequestDetails.type}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Number</label>
                      <p className="text-sm text-slate-900 font-mono">{linkedRequestDetails.display_number}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Request Date</label>
                      <p className="text-sm text-slate-900">{new Date(linkedRequestDetails.request_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Amount</label>
                      <p className="text-sm text-slate-900 font-medium">₱{linkedRequestDetails.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-slate-600">Purpose</label>
                      <p className="text-sm text-slate-900">{linkedRequestDetails.purpose}</p>
                    </div>
                  </div>
                  {linkedRequestDetails.rfp_pdf_path && (
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-2 block">Approved {linkedRequestDetails.type} Form</label>
                      <div className="flex gap-3">
                        <button
                          onClick={() => previewLinkedRequest(linkedRequestDetails.rfp_pdf_path)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                          <Eye size={18} />
                          Preview Form
                        </button>
                        <a
                          href={supabase.storage.from('attachments').getPublicUrl(linkedRequestDetails.rfp_pdf_path).data.publicUrl}
                          download
                          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition"
                        >
                          <Download size={18} />
                          Download
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedRequest.merged_pdf_path && (
                <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Attachments (Receipts)</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => previewAttachments(selectedRequest.merged_pdf_path!, 'Attachments Preview')}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      <Eye size={18} />
                      Preview Attachments
                    </button>
                    <button
                      onClick={() => downloadAttachments(selectedRequest.merged_pdf_path!, selectedRequest.reimb_number)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition"
                    >
                      <Download size={18} />
                      Download
                    </button>
                  </div>
                </div>
              )}

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

      {showPdfPreview && pdfPreviewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">{pdfPreviewTitle}</h3>
              <button
                onClick={closePdfPreview}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-full"
                title="PDF Preview"
              />
            </div>
          </div>
        </div>
      )}

      {showLinkedPdfPreview && linkedPdfPreviewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Approved {linkedRequestDetails?.type} Form Preview</h3>
              <button
                onClick={closeLinkedPdfPreview}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                src={linkedPdfPreviewUrl}
                className="w-full h-full"
                title="Linked Request Form Preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
