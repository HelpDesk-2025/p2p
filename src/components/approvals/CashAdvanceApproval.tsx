import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, X, Loader2, Eye, Download, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { getApprovalFlow, getNextApprover, createApprovalLedgerEntry, ApprovalFlow, sendApprovalEmail, getApproverEmail, createRejectedLedgerEntries } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';

interface PaymentModeLine {
  name: string;
  value: string;
  is_required?: boolean;
}

interface CashAdvanceReq {
  id: string;
  ca_number: string;
  requester_id: string;
  company_id?: string;
  department?: string;
  request_date: string;
  payee?: string;
  payee_number?: string;
  purpose: string;
  amount: number;
  budgeted: boolean;
  date_needed?: string;
  payment_mode_id?: string;
  payment_mode_lines?: PaymentModeLine[];
  status: string;
  current_approval_level: number;
  attachments_pdf_path?: string;
  attachment_metadata?: Array<{
    name: string;
    type: string;
    size: number;
  }>;
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

export function CashAdvanceApproval() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<CashAdvanceReq[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<CashAdvanceReq | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlow[]>([]);
  const [currentApproverStep, setCurrentApproverStep] = useState<ApprovalFlow | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [outstandingAsl, setOutstandingAsl] = useState('None');
  const [remarks, setRemarks] = useState('OK');
  const [paymentModeName, setPaymentModeName] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('request_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadRequests();
  }, [profile]);

  const loadRequests = async () => {
    if (!profile?.company_id && profile?.role !== 'admin') return;

    const { data } = await supabase
      .from('cash_advance_requests')
      .select(`
        *,
        user_profiles:requester_id (full_name, email, company_id, department),
        companies!cash_advance_requests_company_id_fkey (id, name)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

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
        // Use the cash advance request's company_id to look up the correct approval flow
        const caCompanyId = req.company_id || req.user_profiles?.company_id;
        if (!caCompanyId) return null;

        const { filterApprovalFlowsForRequester } = await import('../../lib/approvalFlow');
        const rawFlows = await getApprovalFlow(
          caCompanyId,
          req.department || req.user_profiles?.department || profile.department || '',
          'Cash Advance',
          req.budgeted,
          req.amount
        );

        // Filter out the requester from approval flows
        const flows = await filterApprovalFlowsForRequester(
          rawFlows,
          req.requester_id,
          req.department || req.user_profiles?.department || '',
          caCompanyId
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

    const filteredRequests = requestsForCurrentUser.filter(req => req !== null) as CashAdvanceReq[];
    setRequests(filteredRequests);
  };

  const handleViewRequest = async (request: CashAdvanceReq) => {
    setSelectedRequest(request);
    setShowModal(true);
    setComments('');

    if (request.payment_mode_id) {
      const { data: paymentModeData } = await supabase
        .from('payment_modes')
        .select('mode_name')
        .eq('id', request.payment_mode_id)
        .maybeSingle();

      setPaymentModeName(paymentModeData?.mode_name || null);
    } else {
      setPaymentModeName(null);
    }

    // Use the cash advance request's company_id to look up the correct approval flow
    const caCompanyId = request.company_id || request.user_profiles?.company_id;
    if (caCompanyId) {
      const { filterApprovalFlowsForRequester } = await import('../../lib/approvalFlow');
      const rawFlows = await getApprovalFlow(
        caCompanyId,
        request.department || request.user_profiles?.department || profile.department || '',
        'Cash Advance',
        request.budgeted,
        request.amount
      );

      // Filter out the requester from approval flows
      const flows = await filterApprovalFlowsForRequester(
        rawFlows,
        request.requester_id,
        request.department || request.user_profiles?.department || '',
        caCompanyId
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

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown size={14} className="opacity-40" />;
    }
    return sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  const sortedRequests = [...requests].sort((a, b) => {
    let aVal: any;
    let bVal: any;

    switch (sortColumn) {
      case 'ca_number':
        aVal = a.ca_number;
        bVal = b.ca_number;
        break;
      case 'requester':
        aVal = a.user_profiles?.full_name || '';
        bVal = b.user_profiles?.full_name || '';
        break;
      case 'department':
        aVal = a.department || a.user_profiles?.department || '';
        bVal = b.department || b.user_profiles?.department || '';
        break;
      case 'amount':
        aVal = a.amount;
        bVal = b.amount;
        break;
      case 'request_date':
        aVal = new Date(a.request_date).getTime();
        bVal = new Date(b.request_date).getTime();
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const downloadAttachments = async (pdfPath: string, caNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CA_${caNumber}_Attachments.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading attachments:', error);
      alert('Failed to download attachments');
    }
  };

  const previewAttachments = async (pdfPath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      setPdfPreviewUrl(url);
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
    setShowPdfPreview(false);
  };

  const handleAction = async (action: 'approved' | 'rejected') => {
    if (!selectedRequest || !profile?.company_id) return;

    if (!canApprove()) {
      alert('You are not authorized to approve this request at this level.');
      return;
    }

    if (action === 'rejected' && !comments.trim()) {
      alert('Please provide a comment explaining the reason for rejection.');
      return;
    }

    const actionText = action === 'approved' ? 'approve' : 'reject';
    const confirmMessage = `Are you sure you want to ${actionText} this Cash Advance (${selectedRequest.ca_number})?`;

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

      // Create approval ledger entry FIRST (before PDF generation and status update)
      await createApprovalLedgerEntry(
        'Cash Advance',
        selectedRequest.id,
        selectedRequest.ca_number,
        profile.id,
        profile.full_name || 'Unknown',
        currentApproverStep?.approver_type || 'Approver',
        action === 'approved' ? 'Approved' : 'Rejected',
        comments,
        selectedRequest.current_approval_level + 1
      );

      let approvedCaPdfPath: string | null = null;

      // Generate PDF if this is the last approval (BEFORE updating status)
      if (action === 'approved' && isLastApproval) {
        const { generateCashAdvanceForm } = await import('../../lib/cashAdvanceFormGenerator');
        const { generateRFP } = await import('../../lib/rfpGenerator');

        const { data: companyData } = await supabase
          .from('companies')
          .select('name')
          .eq('id', selectedRequest.company_id)
          .single();

        const { data: requestorData } = await supabase
          .from('user_profiles')
          .select('full_name, e_sig')
          .eq('id', selectedRequest.requester_id)
          .single();

        const { data: payeeData } = await supabase
          .from('user_profiles')
          .select('e_sig')
          .eq('full_name', selectedRequest.payee)
          .maybeSingle();

        // Delay to ensure database transaction is fully committed including foreign key joins
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Use RPC function to bypass RLS and get all approval records with signatures
        const { data: approvalRecords, error: ledgerError } = await supabase
          .rpc('get_approval_records_with_signatures', {
            p_request_id: selectedRequest.id,
            p_request_type: 'Cash Advance'
          });

        if (ledgerError) {
          console.error('Error fetching approval records:', ledgerError);
        }

        // Ensure we have an array to work with
        const finalApprovalRecords = approvalRecords || [];

        // Manually add current approver if not found (due to transaction timing)
        const currentApproverInLedger = finalApprovalRecords.some(
          record => record.approver_name === profile.full_name
        );

        if (!currentApproverInLedger) {
          finalApprovalRecords.push({
            approver_name: profile.full_name || 'Unknown',
            approver_esig: profile.e_sig || null,
            approval_date: new Date().toISOString(),
            sequence: selectedRequest.current_approval_level + 1
          });
        }

        const approvedCaFormBytes = await generateCashAdvanceForm({
          caNumber: selectedRequest.ca_number,
          requestedBy: requestorData?.full_name || 'Unknown',
          requestDate: new Date(selectedRequest.request_date).toLocaleDateString(),
          amount: selectedRequest.amount,
          company: companyData?.name || 'N/A',
          department: selectedRequest.department || selectedRequest.user_profiles?.department || 'N/A',
          purpose: selectedRequest.purpose,
          payee: selectedRequest.payee || 'Unknown',
          payeeEsig: payeeData?.e_sig || null,
          outstandingAsl: outstandingAsl,
          outstandingAslDate: new Date().toLocaleDateString(),
          remarks: remarks,
          approvals: finalApprovalRecords
        });

        let paymentModeName = '';
        const paymentModeLines: Array<{ label: string; value: string }> = [];

        if (selectedRequest.payment_mode_id) {
          const { data: paymentModeData } = await supabase
            .from('payment_modes')
            .select('mode_name')
            .eq('id', selectedRequest.payment_mode_id)
            .maybeSingle();

          paymentModeName = paymentModeData?.mode_name || '';

          if (selectedRequest.payment_mode_lines) {
            selectedRequest.payment_mode_lines.forEach((line) => {
              paymentModeLines.push({
                label: line.name,
                value: line.value
              });
            });
          }
        }

        const rfpBytes = await generateRFP({
          companyName: companyData?.name || 'N/A',
          requestType: 'Cash Advance',
          dateOfRequest: new Date(selectedRequest.request_date).toLocaleDateString(),
          payee: selectedRequest.payee || 'Unknown',
          purpose: selectedRequest.purpose,
          dateNeeded: selectedRequest.date_needed ? new Date(selectedRequest.date_needed).toLocaleDateString() : 'N/A',
          amount: selectedRequest.amount,
          budgeted: selectedRequest.budgeted,
          paymentMode: paymentModeName,
          paymentModeLines: paymentModeLines,
          requestorName: requestorData?.full_name || 'Unknown',
          requestorEsig: requestorData?.e_sig || null,
          approvals: finalApprovalRecords
        });

        // Upload RFP separately
        const rfpFileName = `CA_${selectedRequest.ca_number}_RFP_${Date.now()}.pdf`;
        const { data: rfpUploadData, error: rfpUploadError } = await supabase.storage
          .from('attachments')
          .upload(rfpFileName, rfpBytes, {
            contentType: 'application/pdf',
            cacheControl: '3600',
            upsert: false
          });

        if (rfpUploadError) throw rfpUploadError;
        const rfpPdfPath = rfpUploadData.path;

        // Upload Cash Advance Form separately
        const caFormFileName = `CA_${selectedRequest.ca_number}_Form_${Date.now()}.pdf`;
        const { data: caFormUploadData, error: caFormUploadError } = await supabase.storage
          .from('attachments')
          .upload(caFormFileName, approvedCaFormBytes, {
            contentType: 'application/pdf',
            cacheControl: '3600',
            upsert: false
          });

        if (caFormUploadError) throw caFormUploadError;
        approvedCaPdfPath = caFormUploadData.path;

        // Update the request with both PDF paths
        const { error: pdfUpdateError } = await supabase
          .from('cash_advance_requests')
          .update({
            rfp_pdf_path: rfpPdfPath,
            approved_ca_pdf_path: approvedCaPdfPath
          })
          .eq('id', selectedRequest.id);

        if (pdfUpdateError) throw pdfUpdateError;
      }

      // Update request status AFTER PDF generation (if applicable)
      const updateData: any = {
        status: newStatus,
        current_approval_level: action === 'approved' ? nextLevel : selectedRequest.current_approval_level
      };

      if (action === 'approved' && isLastApproval) {
        updateData.outstanding_asl = outstandingAsl;
        updateData.remarks = remarks;
      }

      const { error: updateError } = await supabase
        .from('cash_advance_requests')
        .update(updateData)
        .eq('id', selectedRequest.id);

      if (updateError) throw updateError;

      const requestDepartment = selectedRequest.department || selectedRequest.user_profiles?.department || 'N/A';

      if (action === 'rejected') {
        await createRejectedLedgerEntries(
          'Cash Advance',
          selectedRequest.id,
          selectedRequest.ca_number,
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
            'Cash Advance',
            selectedRequest.ca_number,
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
          'Cash Advance',
          selectedRequest.ca_number,
          selectedRequest.user_profiles?.full_name || 'Unknown',
          requestDepartment,
          selectedRequest.amount,
          'Fully Approved',
          profile.full_name || 'Unknown',
          comments
        );

        try {
          const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/post-ca-to-msbc`;
          const headers = {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          };

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ requestId: selectedRequest.id }),
          });

          const result = await response.json();

          if (!response.ok) {
            console.error('Failed to post to MSBC:', result);
          } else {
            console.log('Successfully posted to MSBC:', result);
          }
        } catch (msbcError) {
          console.error('Error posting to MSBC:', msbcError);
        }
      } else if (action === 'rejected') {
        await sendApprovalEmail(
          selectedRequest.user_profiles?.email || '',
          selectedRequest.user_profiles?.full_name || 'User',
          'Cash Advance',
          selectedRequest.ca_number,
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
        <h2 className="text-3xl font-bold text-slate-900">Cash Advance Approvals</h2>
        <p className="text-slate-600 mt-1">Review and approve cash advance requests</p>
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
                  <button
                    onClick={() => handleSort('ca_number')}
                    className="flex items-center gap-1 hover:text-slate-900 transition-colors"
                  >
                    CA Number
                    {getSortIcon('ca_number')}
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('requester')}
                    className="flex items-center gap-1 hover:text-slate-900 transition-colors"
                  >
                    Requester
                    {getSortIcon('requester')}
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('department')}
                    className="flex items-center gap-1 hover:text-slate-900 transition-colors"
                  >
                    Department
                    {getSortIcon('department')}
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('amount')}
                    className="flex items-center gap-1 hover:text-slate-900 transition-colors"
                  >
                    Amount
                    {getSortIcon('amount')}
                  </button>
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
              {sortedRequests.map((request) => (
                <tr key={request.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono font-semibold text-slate-900">{request.ca_number}</span>
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
                      ₱{request.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                <h3 className="text-xl font-bold text-slate-900">Review Cash Advance Request</h3>
                <p className="text-sm text-slate-600 mt-1">{selectedRequest.ca_number}</p>
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
                  <label className="text-sm font-semibold text-slate-700">CA Number</label>
                  <p className="text-slate-900 font-mono">{selectedRequest.ca_number}</p>
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
                  <label className="text-sm font-semibold text-slate-700">Payee</label>
                  <p className="text-slate-900">{selectedRequest.payee || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Amount</label>
                  <p className="text-slate-900 font-bold">₱{selectedRequest.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Budgeted</label>
                  <p className="text-slate-900">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${selectedRequest.budgeted ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {selectedRequest.budgeted ? 'Budgeted' : 'Non-Budgeted'}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Date</label>
                  <p className="text-slate-900">{new Date(selectedRequest.request_date).toLocaleDateString()}</p>
                </div>
                {selectedRequest.date_needed && (
                  <div>
                    <label className="text-sm font-semibold text-slate-700">Date Needed</label>
                    <p className="text-slate-900">{new Date(selectedRequest.date_needed).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Purpose</label>
                <p className="text-slate-900">{selectedRequest.purpose}</p>
              </div>

              {paymentModeName && (
                <div>
                  <label className="text-sm font-semibold text-slate-700">Payment Mode</label>
                  <p className="text-slate-900 font-semibold">{paymentModeName}</p>
                </div>
              )}

              {selectedRequest.payment_mode_lines && selectedRequest.payment_mode_lines.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Payment Mode Details</label>
                  <div className="space-y-3">
                    {selectedRequest.payment_mode_lines.map((line: any, index: number) => (
                      <div key={index} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">{line.name}</span>
                              {line.is_required && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">Required</span>
                              )}
                            </div>
                            <p className="text-sm text-slate-700 mt-1">{line.value || <span className="text-slate-400 italic">Not provided</span>}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRequest.attachments_pdf_path && (
                <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Attachments</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => previewAttachments(selectedRequest.attachments_pdf_path!)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      <Eye size={18} />
                      Preview Attachments
                    </button>
                    <button
                      onClick={() => downloadAttachments(selectedRequest.attachments_pdf_path!, selectedRequest.ca_number)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition"
                    >
                      <Download size={18} />
                      Download
                    </button>
                  </div>
                </div>
              )}

              <ApprovalProgressTracker
                requestType="Cash Advance"
                requestId={selectedRequest.id}
              />

              {selectedRequest.current_approval_level + 1 === approvalFlows.length && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                  <h4 className="font-semibold text-slate-900">Accounting Department Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Outstanding ASL
                      </label>
                      <input
                        type="text"
                        value={outstandingAsl}
                        onChange={(e) => setOutstandingAsl(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Enter outstanding ASL or 'None'"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Remarks
                      </label>
                      <input
                        type="text"
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Enter remarks"
                      />
                    </div>
                  </div>
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

      {showPdfPreview && pdfPreviewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Attachments Preview</h3>
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
            <div className="p-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={closePdfPreview}
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
