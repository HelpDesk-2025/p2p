import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, X, Loader2, Eye, Download, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Send, CornerDownLeft, FileText, Paperclip } from 'lucide-react';
import { ChangeAttachmentModal } from './ChangeAttachmentModal';
import { getApprovalFlow, addExecutiveApprovalSteps, filterApprovalFlowsForRequester, getNextApprover, createApprovalLedgerEntry, ApprovalFlow, sendApprovalEmail, sendApprovalEmailToAll, createRejectedLedgerEntries } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import Pagination from '../Pagination';
import { fetchApprovalRecordsWithRetry } from '../../lib/storageHelper';
import { logAuditTrail } from '../../lib/auditTrail';

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
  const [listLoading, setListLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [returning, setReturning] = useState(false);
  const [showChangeAttachmentModal, setShowChangeAttachmentModal] = useState(false);
  const [flowsLoading, setFlowsLoading] = useState(false);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlow[]>([]);
  const [currentApproverStep, setCurrentApproverStep] = useState<ApprovalFlow | null>(null);
  const [outstandingAsl, setOutstandingAsl] = useState('None');
  const [remarks, setRemarks] = useState('OK');
  const [paymentModeName, setPaymentModeName] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('request_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [regeneratingRfp, setRegeneratingRfp] = useState(false);
  const [repostingToMsbc, setRepostingToMsbc] = useState(false);

  useEffect(() => {
    loadRequests();
  }, [profile]);

  const loadRequests = async () => {
    if (!profile?.company_id && profile?.role !== 'admin') return;
    setListLoading(true);

    try {
      const { data: idRows, error: rpcError } = await supabase.rpc('get_my_pending_approval_ids', {
        p_request_type: 'Cash Advance',
        p_user_id: profile.id,
      });

      if (rpcError) {
        console.error('RPC error loading Cash Advance approval IDs:', rpcError);
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
        .from('cash_advance_requests')
        .select(`
          *,
          user_profiles:requester_id (full_name, email, company_id, department),
          companies!cash_advance_requests_company_id_fkey (id, name)
        `)
        .in('id', ids)
        .order('created_at', { ascending: false });

      setRequests(data || []);
    } catch (error) {
      console.error('Error loading cash advance approvals:', error);
      setRequests([]);
    }
    setListLoading(false);
  };

  const handleViewRequest = async (request: CashAdvanceReq) => {
    setSelectedRequest(request);
    setShowModal(true);
    setComments('');
    setFlowsLoading(true);

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
      try {
        const { filterApprovalFlowsForRequester } = await import('../../lib/approvalFlow');
        const rawFlows = await getApprovalFlow(
          caCompanyId,
          request.department || request.user_profiles?.department || profile.department || '',
          'Cash Advance',
          request.budgeted,
          request.amount
        );

        // Inject executive approvers if requester is Executive type
        const flowsWithExecutive = await addExecutiveApprovalSteps(
          rawFlows,
          request.requester_id,
          caCompanyId,
          !!request.budgeted
        );

        // Filter out the requester from approval flows
        const flows = await filterApprovalFlowsForRequester(
          flowsWithExecutive,
          request.requester_id,
          request.department || request.user_profiles?.department || '',
          caCompanyId
        );

        setApprovalFlows(flows);

        const currentStep = await getNextApprover(flows, request.current_approval_level);
        setCurrentApproverStep(currentStep);

        if (request.status === 'pending' && request.current_approval_level >= flows.length && flows.length > 0) {
          const { error: fixError } = await supabase
            .from('cash_advance_requests')
            .update({ status: 'approved' })
            .eq('id', request.id);
          if (!fixError) {
            setSelectedRequest({ ...request, status: 'approved' });
          }
        }
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
      if (!currentApproverStep && selectedRequest.current_approval_level >= approvalFlows.length) {
        return false;
      }
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
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error loading PDF preview:', error);
      alert('Failed to load PDF preview');
    }
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
      const currentLevel = selectedRequest.current_approval_level;
      const nextLevel = currentLevel + 1;
      const isLastApproval = nextLevel >= approvalFlows.length || currentLevel >= approvalFlows.length;
      const newStatus = action === 'rejected' ? 'rejected' : (isLastApproval ? 'approved' : 'pending');

      // Create approval ledger entry FIRST
      await createApprovalLedgerEntry(
        'Cash Advance',
        selectedRequest.id,
        selectedRequest.ca_number,
        profile.id,
        profile.full_name || 'Unknown',
        currentApproverStep?.approver_type || 'Approver',
        action === 'approved' ? 'Approved' : 'Rejected',
        comments,
        selectedRequest.current_approval_level + 1,
        currentApproverStep?.for_checking || false
      );

      // Update request status IMMEDIATELY (before PDF generation to prevent stuck requests)
      const updateData: any = {
        status: newStatus,
        current_approval_level: action === 'approved' ? nextLevel : selectedRequest.current_approval_level
      };

      if (action === 'approved' && selectedRequest.current_approval_level === 0) {
        updateData.outstanding_asl = outstandingAsl;
        updateData.remarks = remarks;
      }

      const { error: updateError } = await supabase
        .from('cash_advance_requests')
        .update(updateData)
        .eq('id', selectedRequest.id);

      if (updateError) throw updateError;

      // Generate PDF if this is the last approval (non-blocking - status already saved)
      if (action === 'approved' && isLastApproval) {
        try {
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

          const approvalRecordsWithSigs = await fetchApprovalRecordsWithRetry(
            selectedRequest.id,
            'Cash Advance',
            selectedRequest.current_approval_level || 1
          );

          const currentApproverInLedger = approvalRecordsWithSigs.some(
            record => record.approver_name === profile.full_name
          );

          if (!currentApproverInLedger) {
            approvalRecordsWithSigs.push({
              approver_name: profile.full_name || 'Unknown',
              approver_esig: profile.e_sig || null,
              approval_date: new Date().toISOString(),
              sequence: selectedRequest.current_approval_level + 1,
              for_checking: currentApproverStep?.for_checking || false
            });
          }

          // If no for_checking approver is in the results, look up from approval flow definition
          const hasForCheckingRecord = approvalRecordsWithSigs.some(r => r.for_checking);
          if (!hasForCheckingRecord && selectedRequest.company_id && selectedRequest.department) {
            const { data: setupData } = await supabase
              .from('approval_flow_setups')
              .select('id')
              .eq('company_id', selectedRequest.company_id)
              .eq('request_type', 'Cash Advance')
              .eq('department_id', selectedRequest.department)
              .eq('is_active', true)
              .maybeSingle();

            if (setupData) {
              const { data: checkerFlows } = await supabase
                .from('approval_flows')
                .select('user_id, sequence')
                .eq('approval_flow_setup_id', setupData.id)
                .eq('for_checking', true)
                .order('sequence', { ascending: true })
                .limit(1);

              if (checkerFlows && checkerFlows.length > 0) {
                const checkerUserId = checkerFlows[0].user_id;
                const checkerSeq = checkerFlows[0].sequence;

                const { data: checkerProfile } = await supabase
                  .from('user_profiles')
                  .select('full_name, e_sig')
                  .eq('id', checkerUserId)
                  .single();

                if (checkerProfile) {
                  approvalRecordsWithSigs.unshift({
                    approver_name: checkerProfile.full_name || 'Unknown',
                    approver_esig: checkerProfile.e_sig || null,
                    approval_date: new Date().toISOString(),
                    sequence: checkerSeq,
                    for_checking: true
                  });
                }
              }
            }
          }

          const finalApprovalRecords = approvalRecordsWithSigs;

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
            requestorEsig: requestorData?.e_sig || null,
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

          const rfpApprovals = finalApprovalRecords.filter(record => !record.for_checking);

          const rfpBytes = await generateRFP({
            companyName: companyData?.name || 'N/A',
            requestType: 'Cash Advance',
            documentNumber: selectedRequest.ca_number,
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
            approvals: rfpApprovals
          });

          const { mergePDFBytes } = await import('../../lib/pdfMerger');

          const pdfsToMerge: Uint8Array[] = [rfpBytes, approvedCaFormBytes];

          if (selectedRequest.attachments_pdf_path) {
            try {
              const { data: attachmentData, error: attachmentError } = await supabase.storage
                .from('attachments')
                .download(selectedRequest.attachments_pdf_path);

              if (!attachmentError && attachmentData) {
                const attachmentBytes = new Uint8Array(await attachmentData.arrayBuffer());
                pdfsToMerge.push(attachmentBytes);
              }
            } catch (dlError) {
              console.error('Error downloading attachments:', dlError);
            }
          }

          const mergedPdfBytes = await mergePDFBytes(pdfsToMerge);

          const mergedFileName = `CA_${selectedRequest.ca_number}_Complete_${Date.now()}.pdf`;
          const { data: mergedUploadData, error: mergedUploadError } = await supabase.storage
            .from('attachments')
            .upload(mergedFileName, mergedPdfBytes, {
              contentType: 'application/pdf',
              cacheControl: '3600',
              upsert: false
            });

          if (!mergedUploadError && mergedUploadData) {
            await supabase
              .from('cash_advance_requests')
              .update({
                rfp_pdf_path: null,
                approved_ca_pdf_path: mergedUploadData.path
              })
              .eq('id', selectedRequest.id);
          } else {
            console.error('Error uploading merged PDF:', mergedUploadError);
          }
        } catch (pdfError: any) {
          console.error('Error generating PDF (status already updated):', pdfError);
        }
      }

      // Fire-and-forget audit trail logging
      logAuditTrail({
        tableName: 'cash_advance_requests',
        recordId: selectedRequest.id,
        action: 'UPDATE',
        module: 'approvals',
        description: action === 'approved'
          ? `Approved cash advance request ${selectedRequest.ca_number}`
          : `Rejected cash advance request ${selectedRequest.ca_number}`,
        oldValues: selectedRequest,
        newValues: updateData,
        performedBy: profile.id,
        performedByName: profile.full_name || 'Unknown',
        companyId: selectedRequest.company_id || profile.company_id
      });

      const requestDepartment = selectedRequest.department || selectedRequest.user_profiles?.department || 'N/A';

      if (action === 'rejected') {
        await createRejectedLedgerEntries(
          'Cash Advance',
          selectedRequest.id,
          selectedRequest.ca_number,
          approvalFlows,
          selectedRequest.current_approval_level,
          selectedRequest.company_id || profile.company_id,
          requestDepartment
        );
      }

      if (action === 'approved' && !isLastApproval) {
        const nextApprover = approvalFlows[nextLevel];
        await sendApprovalEmailToAll(
          nextApprover,
          selectedRequest.company_id || profile.company_id,
          requestDepartment,
          'Cash Advance',
          selectedRequest.ca_number,
          selectedRequest.user_profiles?.full_name || 'Unknown',
          selectedRequest.amount,
          'Approved',
          profile.full_name || 'Unknown',
          comments,
          nextApprover.approver_type
        );
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

  const handleReturnToMaker = async () => {
    if (!selectedRequest || !profile?.company_id) return;
    if (!canApprove()) {
      alert('You are not authorized to perform this action at this level.');
      return;
    }
    if (!comments.trim()) {
      alert('Please provide a comment explaining the reason for returning this request.');
      return;
    }
    if (!confirm(`Are you sure you want to return this Cash Advance (${selectedRequest.ca_number}) to the maker for revision?`)) {
      return;
    }

    setReturning(true);
    setLoading(true);
    try {
      const currentLevel = selectedRequest.current_approval_level;

      const { error: updateError } = await supabase
        .from('cash_advance_requests')
        .update({ status: 'returned_to_maker', current_approval_level: currentLevel })
        .eq('id', selectedRequest.id);
      if (updateError) throw updateError;

      // Fire-and-forget audit trail logging
      logAuditTrail({
        tableName: 'cash_advance_requests',
        recordId: selectedRequest.id,
        action: 'UPDATE',
        module: 'approvals',
        description: `Returned cash advance request to maker`,
        oldValues: selectedRequest,
        newValues: { status: 'returned_to_maker', current_approval_level: currentLevel },
        performedBy: profile.id,
        performedByName: profile.full_name || 'Unknown',
        companyId: selectedRequest.company_id || profile.company_id
      });

      await createApprovalLedgerEntry(
        'Cash Advance',
        selectedRequest.id,
        selectedRequest.ca_number,
        profile.id,
        profile.full_name || 'Unknown',
        currentApproverStep?.approver_type || 'Checker',
        'Returned',
        comments,
        currentLevel + 1,
        currentApproverStep?.for_checking || false
      );

      await sendApprovalEmail(
        selectedRequest.user_profiles?.email || '',
        selectedRequest.user_profiles?.full_name || 'User',
        'Cash Advance',
        selectedRequest.ca_number,
        selectedRequest.user_profiles?.full_name || 'Unknown',
        selectedRequest.department,
        selectedRequest.amount,
        'Returned to Maker',
        profile.full_name || 'Unknown',
        comments
      );

      setShowModal(false);
      setSelectedRequest(null);
      setComments('');
      loadRequests();
    } catch (error: any) {
      console.error('Error returning cash advance to maker:', error);
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
      setReturning(false);
    }
  };

  const handleRegenerateRFP = async () => {
    if (!selectedRequest || !profile) return;

    if (selectedRequest.status !== 'approved') {
      alert('RFP can only be regenerated for approved requests.');
      return;
    }

    if (profile.role !== 'admin') {
      alert('Only admin users can regenerate RFPs.');
      return;
    }

    const confirmMessage = 'Are you sure you want to regenerate the RFP for this Cash Advance? This will replace the existing RFP with updated signatures.';
    if (!confirm(confirmMessage)) {
      return;
    }

    setRegeneratingRfp(true);

    try {
      const { generateCashAdvanceForm } = await import('../../lib/cashAdvanceFormGenerator');
      const { generateRFP } = await import('../../lib/rfpGenerator');

      const { data: companyData } = await supabase
        .from('companies')
        .select('name')
        .eq('id', selectedRequest.company_id || profile.company_id)
        .single();

      // Fetch requestor data
      const { data: requestorData } = await supabase
        .from('user_profiles')
        .select('full_name, e_sig')
        .eq('id', selectedRequest.requester_id)
        .single();

      // Fetch payee data
      const { data: payeeData } = await supabase
        .from('user_profiles')
        .select('e_sig')
        .eq('full_name', selectedRequest.payee)
        .maybeSingle();

      // Get ALL approval records (including checkers) for Cash Advance form using enhanced retry logic
      const approvalRecordsWithSigs = await fetchApprovalRecordsWithRetry(
        selectedRequest.id,
        'Cash Advance',
        selectedRequest.current_approval_level || 1
      );

      // If no for_checking approver is in the results, look up from approval flow definition
      const hasForCheckingInRfp = approvalRecordsWithSigs.some(r => r.for_checking);
      if (!hasForCheckingInRfp && selectedRequest.company_id && selectedRequest.department) {
        const { data: setupDataRfp } = await supabase
          .from('approval_flow_setups')
          .select('id')
          .eq('company_id', selectedRequest.company_id)
          .eq('request_type', 'Cash Advance')
          .eq('department_id', selectedRequest.department)
          .eq('is_active', true)
          .maybeSingle();

        if (setupDataRfp) {
          const { data: checkerFlowsRfp } = await supabase
            .from('approval_flows')
            .select('user_id, sequence')
            .eq('approval_flow_setup_id', setupDataRfp.id)
            .eq('for_checking', true)
            .order('sequence', { ascending: true })
            .limit(1);

          if (checkerFlowsRfp && checkerFlowsRfp.length > 0) {
            const { data: checkerProfileRfp } = await supabase
              .from('user_profiles')
              .select('full_name, e_sig')
              .eq('id', checkerFlowsRfp[0].user_id)
              .single();

            if (checkerProfileRfp) {
              approvalRecordsWithSigs.unshift({
                approver_name: checkerProfileRfp.full_name || 'Unknown',
                approver_esig: checkerProfileRfp.e_sig || null,
                approval_date: new Date().toISOString(),
                sequence: checkerFlowsRfp[0].sequence,
                for_checking: true
              });
            }
          }
        }
      }

      // Generate Cash Advance Form with ALL approvers (including checkers)
      console.log('Generating Cash Advance Form PDF...');
      const caFormPdf = await generateCashAdvanceForm({
        caNumber: selectedRequest.ca_number,
        requestedBy: requestorData?.full_name || 'Unknown',
        requestDate: new Date(selectedRequest.request_date).toLocaleDateString(),
        amount: selectedRequest.amount,
        company: companyData?.name || 'N/A',
        department: selectedRequest.department || selectedRequest.user_profiles?.department || 'N/A',
        purpose: selectedRequest.purpose,
        payee: selectedRequest.payee || 'Unknown',
        payeeEsig: payeeData?.e_sig || null,
        requestorEsig: requestorData?.e_sig || null,
        outstandingAsl: selectedRequest.outstanding_asl || '',
        outstandingAslDate: selectedRequest.outstanding_asl_date
          ? new Date(selectedRequest.outstanding_asl_date).toLocaleDateString()
          : new Date().toLocaleDateString(),
        remarks: selectedRequest.remarks || '',
        approvals: approvalRecordsWithSigs
      });

      // Get payment mode information for RFP
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

      // Filter out checkers for RFP (only include actual approvers, not for_checking)
      const rfpApprovals = approvalRecordsWithSigs.filter(record => !record.for_checking);

      // Generate RFP with filtered approvals (excluding checkers)
      console.log('Generating RFP PDF...');
      const rfpPdf = await generateRFP({
        companyName: companyData?.name || 'Unknown Company',
        requestType: 'Cash Advance',
        documentNumber: selectedRequest.ca_number,
        dateOfRequest: new Date(selectedRequest.request_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }),
        payee: selectedRequest.payee || 'Unknown',
        purpose: selectedRequest.purpose,
        dateNeeded: selectedRequest.date_needed || 'N/A',
        amount: selectedRequest.amount,
        budgeted: selectedRequest.budgeted,
        paymentMode: paymentModeName || 'N/A',
        paymentModeLines: paymentModeLines,
        requestorName: requestorData?.full_name || 'Unknown',
        requestorEsig: requestorData?.e_sig || null,
        approvals: rfpApprovals
      });

      // Merge PDFs
      const { mergeRFPWithAttachments } = await import('../../lib/pdfMerger');
      console.log('Merging PDFs...');
      const mergedPdf = await mergeRFPWithAttachments(
        rfpPdf,
        caFormPdf,
        selectedRequest.attachments_pdf_path || null
      );

      // Upload merged PDF
      console.log('Uploading merged PDF...');
      const timestamp = Date.now();
      const mergedPdfPath = `cash-advance/${selectedRequest.ca_number}_merged_${timestamp}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(mergedPdfPath, mergedPdf, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('cash_advance_requests')
        .update({
          approved_ca_pdf_path: mergedPdfPath,
          rfp_pdf_path: null
        })
        .eq('id', selectedRequest.id);

      if (updateError) throw updateError;

      alert('RFP has been successfully regenerated with updated signatures!');

      // Refresh the request data
      setShowModal(false);
      setSelectedRequest(null);
      loadRequests();
    } catch (error: any) {
      console.error('Error regenerating RFP:', error);
      alert('Failed to regenerate RFP: ' + error.message);
    } finally {
      setRegeneratingRfp(false);
    }
  };

  const handleRepostToMsbc = async () => {
    if (!selectedRequest || !profile) return;

    if (selectedRequest.status !== 'approved') {
      alert('Only approved requests can be reposted to MSBC.');
      return;
    }

    if (profile.role !== 'admin') {
      alert('Only admin users can repost to MSBC.');
      return;
    }

    const confirmMessage = 'Are you sure you want to repost this Cash Advance to MSBC? This will create a new entry in the MSBC system.';
    if (!confirm(confirmMessage)) {
      return;
    }

    setRepostingToMsbc(true);

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
        throw new Error(result.error || 'Failed to post to MSBC');
      }

      alert('Successfully reposted to MSBC: ' + (result.message || 'Success'));

      // Refresh the request data
      setShowModal(false);
      setSelectedRequest(null);
      loadRequests();
    } catch (error: any) {
      console.error('Error reposting to MSBC:', error);
      alert('Failed to repost to MSBC: ' + error.message);
    } finally {
      setRepostingToMsbc(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Cash Advance Approvals</h2>
        <p className="text-slate-600 mt-1">Review and approve cash advance requests</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {listLoading ? (
          <div className="overflow-auto flex-1">
            <table className="w-full hidden lg:table">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  {['CA NO.', 'REQUESTER', 'DEPARTMENT', 'PURPOSE', 'DATE', 'AMOUNT', 'LEVEL', 'ACTION'].map((h) => (
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
                    onClick={() => handleSort('ca_number')}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                  >
                    CA No.
                    {getSortIcon('ca_number')}
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
                    <span className="font-mono font-bold text-sm text-slate-900 truncate block min-w-[120px]" title={request.ca_number}>
                      {request.ca_number}
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
                <h3 className="text-xl font-bold text-slate-900">Review Cash Advance Request</h3>
                <p className="text-sm text-slate-600 mt-1">{selectedRequest.ca_number}</p>
              </div>
              <button
                onClick={() => { if (!loading) setShowModal(false); }}
                disabled={loading}
                className="p-2 hover:bg-slate-100 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
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

              {selectedRequest.current_approval_level === 0 && (
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

              {!canApprove() && selectedRequest.status === 'pending' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-amber-800">
                    You are not authorized to approve this request at the current approval level.
                  </p>
                </div>
              )}

              {selectedRequest.status === 'approved' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800 font-semibold">
                    This request has been fully approved.
                  </p>
                </div>
              )}

              {selectedRequest.status === 'approved' && profile.role === 'admin' && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Admin Actions</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleRegenerateRFP}
                      disabled={regeneratingRfp || repostingToMsbc}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                    >
                      {regeneratingRfp ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                      {regeneratingRfp ? 'Regenerating...' : 'Regenerate RFP'}
                    </button>
                    <button
                      onClick={handleRepostToMsbc}
                      disabled={regeneratingRfp || repostingToMsbc}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                    >
                      {repostingToMsbc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {repostingToMsbc ? 'Reposting...' : 'Repost to MSBC'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                {selectedRequest.status === 'pending' ? (
                  <>
                    <button
                      onClick={() => handleAction('approved')}
                      disabled={loading || flowsLoading || !canApprove()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold text-sm sm:text-base"
                    >
                      {approving ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : flowsLoading ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
                      {approving ? 'Approving...' : flowsLoading ? 'Loading...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleAction('rejected')}
                      disabled={loading || flowsLoading || !canApprove()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold text-sm sm:text-base"
                    >
                      {rejecting ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : flowsLoading ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
                      {rejecting ? 'Rejecting...' : flowsLoading ? 'Loading...' : 'Reject'}
                    </button>
                    <button
                      onClick={handleReturnToMaker}
                      disabled={loading || flowsLoading || !canApprove() || !comments.trim()}
                      title={!comments.trim() ? 'Please add comments explaining what needs to be revised' : ''}
                      className="w-full sm:w-auto sm:flex-1 flex items-center justify-center gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold text-sm sm:text-base"
                    >
                      {returning ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <CornerDownLeft className="w-4 h-4 sm:w-5 sm:h-5" />}
                      {returning ? 'Returning...' : 'Return to Maker'}
                    </button>
                    {selectedRequest.attachment_metadata && selectedRequest.attachment_metadata.length > 0 && (
                      <button
                        onClick={() => setShowChangeAttachmentModal(true)}
                        className="w-full sm:w-auto sm:flex-1 flex items-center justify-center gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition font-semibold text-sm sm:text-base"
                      >
                        <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                        Change Attachment
                      </button>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {showChangeAttachmentModal && selectedRequest && (
        <ChangeAttachmentModal
          isOpen={showChangeAttachmentModal}
          onClose={() => setShowChangeAttachmentModal(false)}
          requestType="Cash Advance"
          requestId={selectedRequest.id}
          requestNumber={selectedRequest.ca_number}
          requesterId={selectedRequest.requester_id}
          companyId={selectedRequest.company_id}
          approverId={profile!.id}
          approverName={profile!.full_name}
          onSuccess={() => {}}
        />
      )}
    </div>
  );
}
