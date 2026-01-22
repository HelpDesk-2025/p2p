import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, Eye, X, ArrowRight, Loader2, Download, Paperclip, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { getApprovalFlow, getNextApprover, createApprovalLedgerEntry, ApprovalFlow, sendApprovalEmail, getApproverEmail, createRejectedLedgerEntries } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { generateLiquidationForm } from '../../lib/liquidationFormGenerator';

interface ExpenseItem {
  date: string;
  description: string;
  amount: number;
}

interface ExpenseTypeItem {
  expense_type_id: string;
  expense_type_name: string;
  sub_item_name: string;
  status: string;
  specify_value?: string;
}

interface PettyCashReq {
  id: string;
  pc_number: string;
  requester_id: string;
  company_id?: string;
  department?: string;
  request_date: string;
  date_of_transactions?: string;
  purpose: string;
  amount: number;
  payment_mode_id?: string;
  payee?: string;
  request_type?: string;
  no_of_pax?: number;
  expense_items?: ExpenseItem[];
  expense_type_items?: ExpenseTypeItem[];
  linked_petty_cash_id?: string;
  petty_cash_advance?: number;
  status: string;
  current_approval_level: number;
  attachments?: Array<{
    file_name: string;
    file_path: string;
    file_type: string;
  }>;
  user_profiles?: {
    full_name: string;
    email: string;
    company_id: string;
    department?: string;
    e_sig?: string;
  };
  companies?: {
    id: string;
    name: string;
  };
}

export function PettyCashApproval() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<PettyCashReq[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PettyCashReq | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlow[]>([]);
  const [currentApproverStep, setCurrentApproverStep] = useState<ApprovalFlow | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('request_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [linkedPettyCashDetails, setLinkedPettyCashDetails] = useState<PettyCashReq | null>(null);

  useEffect(() => {
    loadRequests();
  }, [profile]);

  useEffect(() => {
    const fetchLinkedPettyCash = async () => {
      if (selectedRequest?.request_type === 'For Liquidation' && selectedRequest?.linked_petty_cash_id) {
        try {
          const { data, error } = await supabase
            .from('petty_cash_requests')
            .select('*')
            .eq('id', selectedRequest.linked_petty_cash_id)
            .maybeSingle();

          if (error) throw error;
          setLinkedPettyCashDetails(data);
        } catch (error) {
          console.error('Error fetching linked petty cash:', error);
          setLinkedPettyCashDetails(null);
        }
      } else {
        setLinkedPettyCashDetails(null);
      }
    };

    fetchLinkedPettyCash();
  }, [selectedRequest]);

  const loadRequests = async () => {
    if (!profile?.company_id && profile?.role !== 'admin') return;

    const { data } = await supabase
      .from('petty_cash_requests')
      .select(`
        *,
        user_profiles:requester_id (full_name, email, company_id, department, e_sig),
        companies!petty_cash_requests_company_id_fkey (id, name)
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
        // Use the petty cash request's company_id to look up the correct approval flow
        const pcCompanyId = req.company_id || req.user_profiles?.company_id;
        if (!pcCompanyId) return null;

        const { filterApprovalFlowsForRequester } = await import('../../lib/approvalFlow');
        const rawFlows = await getApprovalFlow(
          pcCompanyId,
          req.department || req.user_profiles?.department || profile.department || '',
          'Petty Cash',
          false,
          req.amount
        );

        // Filter out the requester from approval flows
        const flows = await filterApprovalFlowsForRequester(
          rawFlows,
          req.requester_id,
          req.department || req.user_profiles?.department || '',
          pcCompanyId
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

    const filteredRequests = requestsForCurrentUser.filter(req => req !== null) as PettyCashReq[];
    setRequests(filteredRequests);
  };

  const handleViewRequest = async (request: PettyCashReq) => {
    setSelectedRequest(request);
    setShowModal(true);
    setComments('');

    // Use the petty cash request's company_id to look up the correct approval flow
    const pcCompanyId = request.company_id || request.user_profiles?.company_id;
    if (pcCompanyId) {
      const { filterApprovalFlowsForRequester } = await import('../../lib/approvalFlow');
      const rawFlows = await getApprovalFlow(
        pcCompanyId,
        request.department || request.user_profiles?.department || profile.department || '',
        'Petty Cash',
        false,
        request.amount
      );

      // Filter out the requester from approval flows
      const flows = await filterApprovalFlowsForRequester(
        rawFlows,
        request.requester_id,
        request.department || request.user_profiles?.department || '',
        pcCompanyId
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
      case 'pc_number':
        aVal = a.pc_number;
        bVal = b.pc_number;
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
    const confirmMessage = `Are you sure you want to ${actionText} this Petty Cash (${selectedRequest.pc_number})?`;

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
        .from('petty_cash_requests')
        .update({
          status: newStatus,
          current_approval_level: action === 'approved' ? nextLevel : selectedRequest.current_approval_level
        })
        .eq('id', selectedRequest.id);

      if (updateError) throw updateError;

      await createApprovalLedgerEntry(
        'Petty Cash',
        selectedRequest.id,
        selectedRequest.pc_number,
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
          'Petty Cash',
          selectedRequest.id,
          selectedRequest.pc_number,
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
            'Petty Cash',
            selectedRequest.pc_number,
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
        if (selectedRequest.request_type === 'For Liquidation') {
          try {
            const { data: ledgerData, error: ledgerError } = await supabase
              .from('approval_ledger')
              .select(`
                approver_name,
                approval_date,
                approver_id,
                user_profiles!approval_ledger_approver_id_fkey (
                  e_sig
                )
              `)
              .eq('request_type', 'Petty Cash')
              .eq('request_id', selectedRequest.id)
              .eq('action', 'Approved')
              .order('sequence', { ascending: true });

            if (ledgerError) throw ledgerError;

            if (ledgerData && ledgerData.length > 0) {
              const firstApprover = ledgerData[0];

              const { data: companyData } = await supabase
                .from('companies')
                .select('name')
                .eq('id', selectedRequest.company_id || profile.company_id)
                .single();

              const totalExpenses = (selectedRequest.expense_items || []).reduce((sum, item) => sum + item.amount, 0);
              const cashAdvanceReceived = selectedRequest.petty_cash_advance || 0;
              const balance = cashAdvanceReceived - totalExpenses;

              const requestDateObj = new Date(selectedRequest.request_date);
              const approvedDateObj = new Date(firstApprover.approval_date);
              const preparedDateObj = new Date();

              let linkedRequestData = null;
              if (selectedRequest.linked_petty_cash_id) {
                const { data: linkedData } = await supabase
                  .from('petty_cash_requests')
                  .select('pc_number, request_date, amount, purpose, payee, status')
                  .eq('id', selectedRequest.linked_petty_cash_id)
                  .maybeSingle();

                if (linkedData) {
                  linkedRequestData = {
                    pcNumber: linkedData.pc_number,
                    requestDate: new Date(linkedData.request_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
                    amount: linkedData.amount,
                    purpose: linkedData.purpose,
                    payee: linkedData.payee || 'N/A',
                    status: linkedData.status
                  };
                }
              }

              const liquidationPdfBytes = await generateLiquidationForm({
                pcNumber: selectedRequest.pc_number,
                accountable: selectedRequest.payee || selectedRequest.user_profiles?.full_name || 'Unknown',
                requestDate: requestDateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
                purpose: selectedRequest.purpose,
                cashAdvanceAmount: cashAdvanceReceived,
                expenseItems: selectedRequest.expense_items || [],
                expenseTypeItems: selectedRequest.expense_type_items || [],
                noOfPax: selectedRequest.no_of_pax || 0,
                dateOfTransaction: selectedRequest.date_of_transactions
                  ? new Date(selectedRequest.date_of_transactions).toLocaleDateString()
                  : 'N/A',
                company: companyData?.name || profile.company_name || 'Unknown',
                department: selectedRequest.department || requestDepartment,
                totalExpenses: totalExpenses,
                cashAdvanceReceived: cashAdvanceReceived,
                balance: balance,
                preparedByName: selectedRequest.user_profiles?.full_name || 'Unknown',
                preparedByEsig: selectedRequest.user_profiles?.e_sig || null,
                preparedByDate: preparedDateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
                approvedByName: firstApprover.approver_name,
                approvedByEsig: firstApprover.user_profiles?.e_sig || null,
                approvedByDate: approvedDateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
                linkedPettyCashRequest: linkedRequestData,
              });

              const liquidationPdfFileName = `liquidation_${selectedRequest.pc_number}_${Date.now()}.pdf`;
              const liquidationPdfPath = `petty_cash/${selectedRequest.company_id || profile.company_id}/${liquidationPdfFileName}`;

              const { error: uploadError } = await supabase.storage
                .from('attachments')
                .upload(liquidationPdfPath, liquidationPdfBytes, {
                  contentType: 'application/pdf',
                  upsert: false
                });

              if (uploadError) throw uploadError;

              const { error: updatePdfError } = await supabase
                .from('petty_cash_requests')
                .update({ liquidation_pdf_path: liquidationPdfPath })
                .eq('id', selectedRequest.id);

              if (updatePdfError) throw updatePdfError;
            }
          } catch (error: any) {
            console.error('Error generating liquidation PDF:', error);
          }
        }

        await sendApprovalEmail(
          selectedRequest.user_profiles?.email || '',
          selectedRequest.user_profiles?.full_name || 'User',
          'Petty Cash',
          selectedRequest.pc_number,
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
          'Petty Cash',
          selectedRequest.pc_number,
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

  const downloadAttachment = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      alert('Failed to download attachment');
    }
  };

  const previewAttachment = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error previewing attachment:', error);
      alert('Failed to preview attachment');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Petty Cash Approvals</h2>
        <p className="text-slate-600 mt-1">Review and approve petty cash requests</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {requests.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600">No pending approvals</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-50 to-slate-100">
              <tr>
                <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('pc_number')}
                    className="flex items-center gap-1 hover:text-slate-900 transition-colors"
                  >
                    PC Number
                    {getSortIcon('pc_number')}
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
                    <span className="font-mono font-semibold text-slate-900">{request.pc_number}</span>
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
          </div>
        )}
      </div>

      {showModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Review Petty Cash Request</h3>
                <p className="text-sm text-slate-600 mt-1">{selectedRequest.pc_number}</p>
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
                  <label className="text-sm font-semibold text-slate-700">PC Number</label>
                  <p className="text-slate-900 font-mono">{selectedRequest.pc_number}</p>
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
                  <label className="text-sm font-semibold text-slate-700">Request Date</label>
                  <p className="text-slate-900">{new Date(selectedRequest.request_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Date of Transactions</label>
                  <p className="text-slate-900">
                    {selectedRequest.date_of_transactions
                      ? new Date(selectedRequest.date_of_transactions).toLocaleDateString()
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">To / Receipient</label>
                  <p className="text-slate-900">{selectedRequest.payee || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Type</label>
                  <p className="text-slate-900">{selectedRequest.request_type || 'For Cash Advance'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Amount</label>
                  <p className="text-slate-900 font-bold">₱{selectedRequest.amount.toLocaleString()}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Purpose</label>
                {selectedRequest.expense_type_items && selectedRequest.expense_type_items.length > 0 ? (
                  <div className="space-y-1 mt-1">
                    {selectedRequest.expense_type_items.map((item, index) => (
                      <p key={index} className="text-slate-900">
                        {item.expense_type_name} : {item.sub_item_name}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-900">{selectedRequest.purpose}</p>
                )}
              </div>

              {selectedRequest.request_type === 'For Liquidation' && linkedPettyCashDetails && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Linked Petty Cash Advance Request</label>
                  <div className="bg-white rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-slate-600">PC Number</label>
                        <p className="text-sm text-slate-900 font-semibold">{linkedPettyCashDetails.pc_number}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Request Date</label>
                        <p className="text-sm text-slate-900">
                          {new Date(linkedPettyCashDetails.request_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Advance Amount</label>
                        <p className="text-sm text-slate-900 font-bold text-green-700">
                          ₱{linkedPettyCashDetails.amount.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Status</label>
                        <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          {linkedPettyCashDetails.status}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Purpose</label>
                      <p className="text-sm text-slate-900">{linkedPettyCashDetails.purpose}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Payee</label>
                      <p className="text-sm text-slate-900">{linkedPettyCashDetails.payee || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedRequest.no_of_pax && (
                <div>
                  <label className="text-sm font-semibold text-slate-700">No. of Pax</label>
                  <p className="text-slate-900">{selectedRequest.no_of_pax}</p>
                </div>
              )}

              {selectedRequest.expense_items && selectedRequest.expense_items.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-3">
                    Expense Itemization
                  </label>
                  <div className="overflow-x-auto border border-slate-300 rounded-lg">
                    <table className="min-w-full bg-white">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700 border-b">Date</th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700 border-b">Supplier Name/Vendor Name</th>
                          <th className="px-4 py-2 text-right text-sm font-semibold text-slate-700 border-b">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRequest.expense_items.map((item, index) => (
                          <tr key={index} className="border-b hover:bg-slate-50">
                            <td className="px-4 py-2 text-sm text-slate-700">
                              {item.date ? new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                            </td>
                            <td className="px-4 py-2 text-sm text-slate-700">{item.description}</td>
                            <td className="px-4 py-2 text-sm text-slate-900 text-right font-medium">₱{item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-semibold border-t-2 border-slate-300">
                          <td colSpan={2} className="px-4 py-3 text-sm text-slate-700 text-right">Total Expenditures:</td>
                          <td className="px-4 py-3 text-sm text-slate-900 text-right">
                            ₱{selectedRequest.expense_items.reduce((sum, item) => sum + item.amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                        <tr className="bg-white">
                          <td colSpan={2} className="px-4 py-2 text-sm text-slate-700 text-right">Less: Petty Cash Advance:</td>
                          <td className="px-4 py-2 text-sm text-slate-900 text-right font-medium">
                            ₱{(selectedRequest.petty_cash_advance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                        <tr className={`font-bold ${(selectedRequest.petty_cash_advance || 0) - selectedRequest.expense_items.reduce((sum, item) => sum + item.amount, 0) >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                          <td colSpan={2} className="px-4 py-3 text-sm text-slate-700 text-right">
                            {(selectedRequest.petty_cash_advance || 0) - selectedRequest.expense_items.reduce((sum, item) => sum + item.amount, 0) >= 0
                              ? 'Excess for Deposit:'
                              : 'Over for Reimbursement:'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-900 text-right">
                            ₱{Math.abs((selectedRequest.petty_cash_advance || 0) - selectedRequest.expense_items.reduce((sum, item) => sum + item.amount, 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedRequest.attachments && selectedRequest.attachments.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">
                    {selectedRequest.request_type === 'For Cash Advance'
                      ? 'Supporting Documents'
                      : selectedRequest.request_type === 'For Reimbursement'
                      ? 'Attached Receipts'
                      : 'Attached Liquidation Form'}
                  </label>
                  <div className="space-y-2">
                    {selectedRequest.attachments.map((attachment: any, index: number) => (
                      <div key={index} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-300">
                        <div className="flex items-center gap-2">
                          <Paperclip size={18} className="text-blue-600" />
                          <span className="text-sm text-slate-700">{attachment.file_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => previewAttachment(attachment.file_path)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition"
                          >
                            <Eye size={16} />
                            Preview
                          </button>
                          <button
                            onClick={() => downloadAttachment(attachment.file_path, attachment.file_name)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                          >
                            <Download size={16} />
                            Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <ApprovalProgressTracker
                requestType="Petty Cash"
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
