import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, Eye, X, ArrowRight, Loader2, Download, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { getApprovalFlow, addExecutiveApprovalSteps, filterApprovalFlowsForRequester, getNextApprover, createApprovalLedgerEntry, ApprovalFlow, sendApprovalEmail, sendApprovalEmailToAll, createRejectedLedgerEntries } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import Pagination from '../Pagination';
import { generateReimbursementForm } from '../../lib/reimbursementFormGenerator';
import { fetchApprovalRecordsWithRetry } from '../../lib/storageHelper';

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
  const [listLoading, setListLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [flowsLoading, setFlowsLoading] = useState(false);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlow[]>([]);
  const [currentApproverStep, setCurrentApproverStep] = useState<ApprovalFlow | null>(null);
  const [linkedRequestDetails, setLinkedRequestDetails] = useState<any>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState<string>('');
  const [showLinkedPdfPreview, setShowLinkedPdfPreview] = useState(false);
  const [linkedPdfPreviewUrl, setLinkedPdfPreviewUrl] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('request_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  useEffect(() => {
    loadRequests();
  }, [profile]);

  const loadRequests = async () => {
    if (!profile?.company_id && profile?.role !== 'admin') return;
    setListLoading(true);

    try {
      const { data: idRows, error: rpcError } = await supabase.rpc('get_my_pending_approval_ids', {
        p_request_type: 'Reimbursement',
        p_user_id: profile.id,
      });

      if (rpcError) {
        console.error('RPC error loading Reimbursement approval IDs:', rpcError);
        setRequests([]);
        setListLoading(false);
        return;
      }

      const ids = (idRows || []).map((r: { request_id: string }) => r.request_id);

      if (ids.length === 0) {
        setRequests([]);
        setListLoading(false);
        return;
      }

      const { data } = await supabase
        .from('reimbursement_requests')
        .select(`
          *,
          user_profiles:requester_id (full_name, email, company_id, department, e_sig),
          companies!reimbursement_requests_company_id_fkey (id, name),
          request_type,
          linked_cash_advance_id,
          cash_advance_type
        `)
        .in('id', ids)
        .order('created_at', { ascending: false });

      setRequests(data || []);
    } catch (error) {
      console.error('Error loading reimbursement approvals:', error);
      setRequests([]);
    }
    setListLoading(false);
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
    setFlowsLoading(true);

    // Load linked request details if this is a liquidation
    if ((request as any).request_type === 'Liquidation' && (request as any).linked_cash_advance_id && (request as any).cash_advance_type) {
      await loadLinkedRequestDetails((request as any).linked_cash_advance_id, (request as any).cash_advance_type);
    }

    // Use the reimbursement request's company_id to look up the correct approval flow
    const reimbCompanyId = request.company_id || request.user_profiles?.company_id;
    if (reimbCompanyId) {
      try {
        const { filterApprovalFlowsForRequester } = await import('../../lib/approvalFlow');
        const rawFlows = await getApprovalFlow(
          reimbCompanyId,
          request.department || request.user_profiles?.department || profile.department || '',
          'Reimbursement',
          false,
          request.amount
        );

        // Inject executive approvers if requester is Executive type
        const flowsWithExecutive = await addExecutiveApprovalSteps(
          rawFlows,
          request.requester_id,
          reimbCompanyId
        );

        // Filter out the requester from approval flows
        const flows = await filterApprovalFlowsForRequester(
          flowsWithExecutive,
          request.requester_id,
          request.department || request.user_profiles?.department || '',
          reimbCompanyId
        );

        setApprovalFlows(flows);

        const currentStep = await getNextApprover(flows, request.current_approval_level);
        setCurrentApproverStep(currentStep);
      } catch (error) {
        console.error('Error loading approval flow:', error);
        setApprovalFlows([]);
        setCurrentApproverStep(null);
      } finally {
        setFlowsLoading(false);
      }
    } else {
      setFlowsLoading(false);
    }
  };

  const canApprove = (): boolean => {
    if (!profile || !selectedRequest) return false;

    if (profile.role === 'admin') {
      return true;
    }

    if (!currentApproverStep) return false;

    if (currentApproverStep.user_id) {
      if (currentApproverStep.user_id === profile.id) return true;
      if (currentApproverStep.alternate_approver_id === profile.id) return true;
      return false;
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
      case 'reimb_number':
        aVal = a.reimb_number;
        bVal = b.reimb_number;
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

  const totalPages = Math.ceil(sortedRequests.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRequests = sortedRequests.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
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

      // For approval ledger, always use 'Reimbursement' (Liquidation is a type of Reimbursement)
      // The approval_ledger table constraint only allows specific values
      await createApprovalLedgerEntry(
        'Reimbursement',
        selectedRequest.id,
        selectedRequest.reimb_number,
        profile.id,
        profile.full_name || 'Unknown',
        currentApproverStep?.approver_type || 'Approver',
        action === 'approved' ? 'Approved' : 'Rejected',
        comments,
        selectedRequest.current_approval_level + 1,
        currentApproverStep?.for_checking || false
      );

      const requestDepartment = selectedRequest.department || selectedRequest.user_profiles?.department || 'N/A';

      if (action === 'rejected') {
        await createRejectedLedgerEntries(
          'Reimbursement',
          selectedRequest.id,
          selectedRequest.reimb_number,
          approvalFlows,
          selectedRequest.current_approval_level,
          selectedRequest.company_id || profile.company_id,
          requestDepartment
        );
      }

      // Keep track of actual request type for emails and PDF display
      const actualRequestType = selectedRequest.request_type || 'Reimbursement';

      // Handle email notifications first (separate from PDF generation)
      if (action === 'approved' && !isLastApproval) {
        const nextApprover = approvalFlows[nextLevel];
        await sendApprovalEmailToAll(
          nextApprover,
          selectedRequest.company_id || profile.company_id,
          requestDepartment,
          actualRequestType,
          selectedRequest.reimb_number,
          selectedRequest.user_profiles?.full_name || 'Unknown',
          selectedRequest.amount,
          'Approved',
          profile.full_name || 'Unknown',
          comments,
          nextApprover.approver_type
        );
      } else if (action === 'rejected') {
        // Send rejection email to requester
        await sendApprovalEmail(
          selectedRequest.user_profiles?.email || '',
          selectedRequest.user_profiles?.full_name || 'Unknown',
          actualRequestType,
          selectedRequest.reimb_number,
          selectedRequest.user_profiles?.full_name || 'Unknown',
          requestDepartment,
          selectedRequest.amount,
          'Rejected',
          profile.full_name || 'Unknown',
          comments
        );
      } else if (action === 'approved' && isLastApproval) {
        // Send final approval email to requester
        await sendApprovalEmail(
          selectedRequest.user_profiles?.email || '',
          selectedRequest.user_profiles?.full_name || 'Unknown',
          actualRequestType,
          selectedRequest.reimb_number,
          selectedRequest.user_profiles?.full_name || 'Unknown',
          requestDepartment,
          selectedRequest.amount,
          'Fully Approved',
          profile.full_name || 'Unknown',
          comments
        );
      }

      // NOW generate the PDF as the absolute LAST step (only for final approval)
      if (action === 'approved' && isLastApproval) {
        // Wait to ensure all database transactions are committed
        // This is critical for the approval ledger entries to be fully persisted
        await new Promise(resolve => setTimeout(resolve, 1000));

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

          // Fetch approval records using enhanced retry logic
          const expectedApprovalCount = approvalFlows.length;
          const approvalRecordsWithSigs = await fetchApprovalRecordsWithRetry(
            selectedRequest.id,
            'Reimbursement',
            expectedApprovalCount
          );

          // Use the requester info from the fetched request
          const requesterData = {
            full_name: selectedRequest.user_profiles?.full_name || 'Unknown',
            e_sig: selectedRequest.user_profiles?.e_sig || null
          };

          // Prepare approval records with esig (already includes e-signatures from helper)
          const approvals = approvalRecordsWithSigs.map((record: any) => ({
            approver_name: record.approver_name,
            approver_esig: record.approver_esig || null,
            approval_date: record.approval_date,
          }));

          // Calculate net amount
          const netAmount = selectedRequest.amount - (selectedRequest.cash_advance || 0);

          // Get company name
          const companyName = selectedRequest.companies?.name || 'N/A';

          // Generate the reimbursement form PDF
          const requestDateObj = new Date(selectedRequest.request_date);
          const reimbursementFormBytes = await generateReimbursementForm({
            reimbNumber: selectedRequest.reimb_number,
            requestType: selectedRequest.request_type || 'Reimbursement',
            requestedBy: requesterData.full_name || 'Unknown',
            requestedByEsig: requesterData.e_sig || null,
            requestDate: requestDateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
              requestDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {listLoading ? (
          <div className="overflow-auto flex-1">
            <table className="w-full hidden lg:table">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  {['DOC NO.', 'REQUESTER', 'DEPARTMENT', 'PURPOSE', 'DATE', 'AMOUNT', 'LEVEL', 'ACTION'].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-28 mb-1"/><div className="h-3 bg-slate-100 rounded w-20"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-36 mb-1"/><div className="h-3 bg-slate-100 rounded w-44"/></td>
                    <td className="py-3 px-4"><div className="h-6 bg-slate-200 rounded-full w-28"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-40"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-20"/></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-24"/></td>
                    <td className="py-3 px-4"><div className="h-6 bg-slate-200 rounded w-10"/></td>
                    <td className="py-3 px-4"><div className="h-8 bg-slate-200 rounded w-8"/></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="lg:hidden divide-y divide-slate-200">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 animate-pulse space-y-3">
                  <div className="flex justify-between">
                    <div className="h-4 bg-slate-200 rounded w-28"/>
                    <div className="h-6 bg-slate-200 rounded w-10"/>
                  </div>
                  <div className="h-3 bg-slate-100 rounded w-40"/>
                  <div className="h-3 bg-slate-100 rounded w-24"/>
                </div>
              ))}
            </div>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600">No pending approvals</p>
          </div>
        ) : (
          <>
          <div className="overflow-auto flex-1">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200 z-10">
                <tr>
                  <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                    <button
                      onClick={() => handleSort('reimb_number')}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                    >
                      Reimb No.
                      {getSortIcon('reimb_number')}
                    </button>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                    <button
                      onClick={() => handleSort('requester')}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                    >
                      Requester
                      {getSortIcon('requester')}
                    </button>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                    <button
                      onClick={() => handleSort('department')}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                    >
                      Department
                      {getSortIcon('department')}
                    </button>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleSort('amount')}
                      className="flex items-center gap-1.5 justify-end text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors ml-auto"
                    >
                      Amount
                      {getSortIcon('amount')}
                    </button>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Level
                    </span>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Action
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedRequests.map((request, index) => (
                  <tr
                    key={request.id}
                    className={`hover:bg-slate-50 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                  >
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="font-mono font-bold text-sm text-slate-900 truncate block min-w-[120px]" title={request.reimb_number}>
                        {request.reimb_number}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3">
                      <div className="flex flex-col min-w-[180px] max-w-[250px]">
                        <span className="text-sm font-semibold text-slate-900 truncate" title={request.user_profiles?.full_name}>
                          {request.user_profiles?.full_name}
                        </span>
                        <span className="text-xs text-slate-500 truncate" title={request.user_profiles?.email}>
                          {request.user_profiles?.email}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium max-w-[140px] truncate" title={request.department || request.user_profiles?.department || 'N/A'}>
                        {request.department || request.user_profiles?.department || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-right whitespace-nowrap">
                      <span className="text-sm font-bold text-slate-900">
                        ₱{request.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-bold">
                        L{request.current_approval_level + 1}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleViewRequest(request)}
                        className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm hover:shadow group-hover:scale-105 transform"
                        title="Review Request"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sortedRequests.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              itemsPerPage={itemsPerPage}
              totalItems={sortedRequests.length}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          )}
          </>
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
                  if (!loading) {
                    setShowModal(false);
                    setLinkedRequestDetails(null);
                  }
                }}
                disabled={loading}
                className="p-2 hover:bg-slate-100 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
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
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Supplier Name & Particulars</th>
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
                  disabled={loading || flowsLoading || !canApprove()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
                >
                  {approving ? <Loader2 size={20} className="animate-spin" /> : flowsLoading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                  {approving ? 'Approving...' : flowsLoading ? 'Loading...' : 'Approve'}
                </button>
                <button
                  onClick={() => handleAction('rejected')}
                  disabled={loading || flowsLoading || !canApprove()}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
                >
                  {rejecting ? <Loader2 size={20} className="animate-spin" /> : flowsLoading ? <Loader2 size={20} className="animate-spin" /> : <XCircle size={20} />}
                  {rejecting ? 'Rejecting...' : flowsLoading ? 'Loading...' : 'Reject'}
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
