import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, Eye, X, ArrowRight, Loader2, FileText, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { getApprovalFlow, addExecutiveApprovalSteps, filterApprovalFlowsForRequester, getNextApprover, createApprovalLedgerEntry, ApprovalFlow, sendApprovalEmail, getApproverEmail, createRejectedLedgerEntries } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { generateAndUploadCanvassRFP } from '../../lib/rfpGenerator';
import Pagination from '../Pagination';

interface CanvassReq {
  id: string;
  canvass_number: string;
  requester_id: string;
  company_id?: string;
  department: string;
  request_date: string;
  required_date: string;
  items: any[];
  suppliers: any[];
  total_amount: number;
  status: string;
  current_approval_level: number;
  is_budgeted?: boolean;
  pr_id?: string;
  recommended_quotation_index?: number | null;
  recommendation_remarks?: string | null;
  rfp_pdf_path?: string | null;
  user_profiles?: {
    full_name: string;
    email: string;
    company_id: string;
  };
  companies?: {
    id: string;
    name: string;
  };
  purchase_requisitions?: {
    document_no: string;
    pr_number: string;
    total_amount: number;
  };
}

interface PurchaseRequisition {
  id: string;
  pr_number: string;
  document_no: string;
  description: string;
  department: string;
  request_date: string;
  required_date: string;
  request_type: string;
  purpose: string;
  line_name: string;
  items: any[];
  total_amount: number;
  is_budgeted: boolean;
  merged_pdf_path: string | null;
  company_id: string;
}

interface ApproverRecommendation {
  id: string;
  approver_id: string;
  approver_level: string;
  recommended_quotation_index: number;
  recommendation_remarks: string | null;
  created_at: string;
  user_profiles?: {
    full_name: string;
    role: string;
  };
}

export function CanvassApproval() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<CanvassReq[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<CanvassReq | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlow[]>([]);
  const [currentApproverStep, setCurrentApproverStep] = useState<ApprovalFlow | null>(null);
  const [selectedPR, setSelectedPR] = useState<PurchaseRequisition | null>(null);
  const [selectedVendorIndex, setSelectedVendorIndex] = useState<number | null>(null);
  const [myRecommendedVendorIndex, setMyRecommendedVendorIndex] = useState<number | null>(null);
  const [myRecommendationRemarks, setMyRecommendationRemarks] = useState<string>('');
  const [previousRecommendations, setPreviousRecommendations] = useState<ApproverRecommendation[]>([]);
  const [sortColumn, setSortColumn] = useState<string>('request_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  useEffect(() => {
    loadRequests();
  }, [profile]);

  const loadRequests = async () => {
    if (!profile?.company_id && profile?.role !== 'admin') return;

    const { data } = await supabase
      .from('canvass_requests')
      .select(`
        *,
        user_profiles:requester_id (full_name, email, company_id),
        companies!canvass_requests_company_id_fkey (id, name),
        purchase_requisitions(document_no, pr_number, total_amount)
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
        try {
          console.log('🔍 Checking canvass request:', req.canvass_number, 'for user:', profile.full_name);

          // Use the canvass request's company_id to look up the correct approval flow
          const canvassCompanyId = req.company_id || req.user_profiles?.company_id;
          if (!canvassCompanyId) {
            console.log('❌ No company_id found for request:', req.canvass_number);
            return null;
          }

          const { filterApprovalFlowsForRequester } = await import('../../lib/approvalFlow');
          const rawFlows = await getApprovalFlow(
            canvassCompanyId,
            req.department || profile.department || '',
            'Canvass',
            req.is_budgeted ?? false,
            req.total_amount
          );

          console.log('📋 Raw flows:', rawFlows.length);

          // Inject executive approvers if requester is Executive type
          const flowsWithExecutive = await addExecutiveApprovalSteps(
            rawFlows,
            req.requester_id,
            canvassCompanyId
          );

          // Filter out the requester from approval flows
          const flows = await filterApprovalFlowsForRequester(
            flowsWithExecutive,
            req.requester_id,
            req.department || '',
            canvassCompanyId
          );

          console.log('📋 Filtered flows:', flows.length);

          const currentStep = await getNextApprover(flows, req.current_approval_level);

          if (!currentStep) {
            console.log('❌ No current step found for request:', req.canvass_number);
            return null;
          }

          console.log('👤 Current step:', currentStep.approver_type, 'user_id:', currentStep.user_id);

          let isCurrentApprover = false;

          if (currentStep.user_id) {
            isCurrentApprover = currentStep.user_id === profile.id;
            console.log('✅ Checking user_id match:', currentStep.user_id, '===', profile.id, '=', isCurrentApprover);
          } else {
            const approverType = currentStep.approver_type;

            if (approverType === 'Department Head' && profile.role === 'approver') {
              isCurrentApprover = req.department === profile.department;
            } else if (approverType === 'Procurement' || approverType === 'Procurement Head') {
              isCurrentApprover = profile.role === 'procurement' || profile.role === 'approver' || profile.role === 'admin';
            } else if (approverType === 'President') {
              isCurrentApprover = profile.role === 'approver' || profile.role === 'admin';
            }
            console.log('✅ Checking role-based match:', approverType, 'isCurrentApprover:', isCurrentApprover);
          }

          console.log(isCurrentApprover ? '✅ User IS current approver' : '❌ User is NOT current approver');
          return isCurrentApprover ? req : null;
        } catch (error) {
          console.error('❌ Error checking request:', req.canvass_number, error);
          return null;
        }
      })
    );

    const filteredRequests = requestsForCurrentUser.filter(req => req !== null) as CanvassReq[];
    console.log('📊 Final filtered requests:', filteredRequests.length);
    setRequests(filteredRequests);
  };

  const handleViewRequest = async (request: CanvassReq) => {
    setSelectedRequest(request);
    setShowModal(true);
    setComments('');
    setSelectedPR(null);
    setSelectedVendorIndex(request.recommended_quotation_index ?? 0);
    setMyRecommendedVendorIndex(null);
    setMyRecommendationRemarks('');
    setPreviousRecommendations([]);

    // Fetch PR details if pr_id exists
    if (request.pr_id) {
      try {
        const { data: prData, error: prError } = await supabase
          .from('purchase_requisitions')
          .select('*')
          .eq('id', request.pr_id)
          .maybeSingle();

        if (prError) {
          console.error('Error fetching PR:', prError);
        } else if (prData) {
          setSelectedPR(prData as PurchaseRequisition);
        }
      } catch (error) {
        console.error('Error loading PR details:', error);
      }
    }

    // Load previous recommendations
    try {
      const { data: recommendationsData, error: recommendationsError } = await supabase
        .from('canvass_approver_recommendations')
        .select(`
          *,
          user_profiles:approver_id (full_name, role)
        `)
        .eq('canvass_request_id', request.id)
        .order('created_at', { ascending: true });

      if (recommendationsError) {
        console.error('Error fetching recommendations:', recommendationsError);
      } else if (recommendationsData) {
        setPreviousRecommendations(recommendationsData as ApproverRecommendation[]);

        // Check if current user already made a recommendation
        const myExistingRecommendation = recommendationsData.find(
          (rec: any) => rec.approver_id === profile?.id
        );
        if (myExistingRecommendation) {
          setMyRecommendedVendorIndex(myExistingRecommendation.recommended_quotation_index);
          setMyRecommendationRemarks(myExistingRecommendation.recommendation_remarks || '');
        }
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
    }

    // Use the request's company_id to load the correct approval flows
    const requestCompanyId = request.company_id || request.user_profiles?.company_id;
    if (requestCompanyId) {
      const { filterApprovalFlowsForRequester } = await import('../../lib/approvalFlow');
      const rawFlows = await getApprovalFlow(
        requestCompanyId,
        request.department || '',
        'Canvass',
        request.is_budgeted || false,
        request.total_amount
      );

      // Inject executive approvers if requester is Executive type
      const flowsWithExecutive = await addExecutiveApprovalSteps(
        rawFlows,
        request.requester_id,
        requestCompanyId
      );

      // Filter out the requester from approval flows
      const flows = await filterApprovalFlowsForRequester(
        flowsWithExecutive,
        request.requester_id,
        request.department || '',
        requestCompanyId
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
      case 'canvass_number':
        aVal = a.canvass_number;
        bVal = b.canvass_number;
        break;
      case 'requester':
        aVal = a.user_profiles?.full_name || '';
        bVal = b.user_profiles?.full_name || '';
        break;
      case 'department':
        aVal = a.department || '';
        bVal = b.department || '';
        break;
      case 'total_amount':
        aVal = a.total_amount;
        bVal = b.total_amount;
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

    const isLastApprovalLevel = selectedRequest.current_approval_level === approvalFlows.length - 1;

    // Validate vendor selection for non-final approvers making recommendations
    if (action === 'approved' && !isLastApprovalLevel && myRecommendedVendorIndex === null) {
      alert('Please select your recommended vendor before approving.');
      return;
    }

    // Validate vendor selection for final approval
    if (action === 'approved' && isLastApprovalLevel && selectedVendorIndex === null) {
      alert('Please select the winning vendor before approving.');
      return;
    }

    // Confirmation dialog
    const actionText = action === 'approved' ? 'approve' : 'reject';
    let confirmMessage = `Are you sure you want to ${actionText} this Canvass (${selectedRequest.canvass_number})?`;

    if (action === 'approved' && !isLastApprovalLevel && myRecommendedVendorIndex !== null) {
      const recommendedVendor = selectedRequest.suppliers[myRecommendedVendorIndex]?.vendor_name || 'Unknown';
      confirmMessage += `\n\nYour Recommended Vendor: ${recommendedVendor}`;
    }

    if (action === 'approved' && isLastApprovalLevel && selectedVendorIndex !== null) {
      const winningVendor = selectedRequest.suppliers[selectedVendorIndex]?.vendor_name || 'Unknown';
      confirmMessage += `\n\nWinning Vendor: ${winningVendor}`;
    }

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

      const updateData: any = {
        status: newStatus,
        current_approval_level: action === 'approved' ? nextLevel : selectedRequest.current_approval_level
      };

      // If final approval, update the winning vendor index and vendor number
      if (action === 'approved' && isLastApproval && selectedVendorIndex !== null) {
        updateData.recommended_quotation_index = selectedVendorIndex;
        const winningVendor = selectedRequest.suppliers[selectedVendorIndex];
        if (winningVendor?.vendor_number) {
          updateData.winning_vendor_number = winningVendor.vendor_number;
        }
      }

      const { error: updateError } = await supabase
        .from('canvass_requests')
        .update(updateData)
        .eq('id', selectedRequest.id);

      if (updateError) throw updateError;

      // Save approver recommendation (for approved non-final levels)
      if (action === 'approved' && !isLastApproval && myRecommendedVendorIndex !== null) {
        const { error: recommendationError } = await supabase
          .from('canvass_approver_recommendations')
          .upsert({
            canvass_request_id: selectedRequest.id,
            approver_id: profile.id,
            approver_level: currentApproverStep?.approver_type || 'Approver',
            recommended_quotation_index: myRecommendedVendorIndex,
            recommendation_remarks: myRecommendationRemarks || null,
          }, {
            onConflict: 'canvass_request_id,approver_id'
          });

        if (recommendationError) {
          console.error('Error saving recommendation:', recommendationError);
        }
      }

      await createApprovalLedgerEntry(
        'Canvass',
        selectedRequest.id,
        selectedRequest.canvass_number,
        profile.id,
        profile.full_name || 'Unknown',
        currentApproverStep?.approver_type || 'Approver',
        action === 'approved' ? 'Approved' : 'Rejected',
        comments,
        selectedRequest.current_approval_level + 1,
        currentApproverStep?.for_checking || false
      );

      if (action === 'rejected') {
        await createRejectedLedgerEntries(
          'Canvass',
          selectedRequest.id,
          selectedRequest.canvass_number,
          approvalFlows,
          selectedRequest.current_approval_level,
          profile.company_id,
          selectedRequest.department || profile.department || ''
        );
      }

      if (action === 'approved' && !isLastApproval) {
        const nextApprover = approvalFlows[nextLevel];
        const nextApproverInfo = await getApproverEmail(
          nextApprover,
          profile.company_id,
          selectedRequest.department || profile.department || ''
        );

        if (nextApproverInfo) {
          await sendApprovalEmail(
            nextApproverInfo.email,
            nextApproverInfo.name,
            'Canvass',
            selectedRequest.canvass_number,
            selectedRequest.user_profiles?.full_name || 'Unknown',
            selectedRequest.department || 'N/A',
            selectedRequest.total_amount,
            'Approved',
            profile.full_name || 'Unknown',
            comments,
            nextApproverInfo.name
          );
        }
      } else if (action === 'approved' && isLastApproval) {
        try {
          await generateAndUploadCanvassRFP(selectedRequest.id, selectedRequest.canvass_number);
          console.log('RFP generated successfully for canvass:', selectedRequest.canvass_number);
        } catch (rfpError: any) {
          console.error('Error generating RFP:', rfpError);
        }

        // Automatically post to MSBC if vendor number is available
        if (selectedVendorIndex !== null) {
          const winningVendor = selectedRequest.suppliers[selectedVendorIndex];
          if (winningVendor?.vendor_number) {
            try {
              const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/post-canvass-to-msbc`;
              const headers = {
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
              };

              const response = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  canvass_id: selectedRequest.id
                })
              });

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to post to MSBC');
              }

              const result = await response.json();
              console.log('Successfully posted to MSBC:', result);
            } catch (msbcError: any) {
              console.error('Error posting to MSBC:', msbcError);
            }
          }
        }

        await sendApprovalEmail(
          selectedRequest.user_profiles?.email || '',
          selectedRequest.user_profiles?.full_name || 'User',
          'Canvass',
          selectedRequest.canvass_number,
          selectedRequest.user_profiles?.full_name || 'Unknown',
          selectedRequest.department || 'N/A',
          selectedRequest.total_amount,
          'Fully Approved',
          profile.full_name || 'Unknown',
          comments
        );
      } else if (action === 'rejected') {
        await sendApprovalEmail(
          selectedRequest.user_profiles?.email || '',
          selectedRequest.user_profiles?.full_name || 'User',
          'Canvass',
          selectedRequest.canvass_number,
          selectedRequest.user_profiles?.full_name || 'Unknown',
          selectedRequest.department || 'N/A',
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
      setApproving(false);
      setRejecting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Canvass Approvals</h2>
        <p className="text-slate-600 mt-1">Review and approve canvass requests</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {requests.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600">No pending approvals</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200 z-10">
                <tr>
                  <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                    <button
                      onClick={() => handleSort('canvass_number')}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                    >
                      Canvass No.
                      {getSortIcon('canvass_number')}
                    </button>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      PR Document No.
                    </span>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-right whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      PR Amount
                    </span>
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
                      onClick={() => handleSort('total_amount')}
                      className="flex items-center gap-1.5 justify-end text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors ml-auto"
                    >
                      Amount
                      {getSortIcon('total_amount')}
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
                      <span className="font-mono font-bold text-sm text-slate-900 truncate block min-w-[120px]" title={request.canvass_number}>
                        {request.canvass_number}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-sm text-blue-700 font-semibold">
                        {request.purchase_requisitions?.document_no || request.purchase_requisitions?.pr_number || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap text-right">
                      <span className="text-sm text-slate-900 font-semibold">
                        {request.purchase_requisitions?.total_amount ? `₱${request.purchase_requisitions.total_amount.toLocaleString()}` : 'N/A'}
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
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium max-w-[140px] truncate" title={request.department || 'N/A'}>
                        {request.department || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-right whitespace-nowrap">
                      <span className="text-sm font-bold text-slate-900">
                        ₱{request.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
            {requests.length > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                itemsPerPage={itemsPerPage}
                totalItems={sortedRequests.length}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            )}
          </div>
        )}
      </div>

      {showModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-[95vw] w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Review Canvass Request</h3>
                <p className="text-sm text-slate-600 mt-1">{selectedRequest.canvass_number}</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Canvass Number</label>
                  <p className="text-slate-900 font-mono">{selectedRequest.canvass_number}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Company</label>
                  <p className="text-slate-900">{selectedRequest.companies?.name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Department</label>
                  <p className="text-slate-900">{selectedRequest.department || 'N/A'}</p>
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
                  <label className="text-sm font-semibold text-slate-700">Required Date</label>
                  <p className="text-slate-900">{new Date(selectedRequest.required_date).toLocaleDateString()}</p>
                </div>
              </div>

              {selectedPR && (
                <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                  <h4 className="text-lg font-bold text-slate-900 mb-4">
                    Selected Purchase Requisition
                  </h4>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                      <div>
                        <label className="text-sm font-semibold text-blue-600 block mb-1">Document No.</label>
                        <p className="text-sm text-blue-900 font-mono">{selectedPR.document_no || selectedPR.pr_number}</p>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-blue-600 block mb-1">Company</label>
                        <p className="text-sm text-slate-900">{selectedRequest?.companies?.name || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-blue-600 block mb-1">Department</label>
                        <p className="text-sm text-slate-900">{selectedPR.department}</p>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-blue-600 block mb-1">Total Amount</label>
                        <p className="text-sm text-blue-900 font-semibold">₱{selectedPR.total_amount?.toLocaleString()}</p>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-blue-600 block mb-1">Request Date</label>
                      <p className="text-sm text-slate-900">{new Date(selectedPR.request_date).toLocaleDateString()}</p>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-blue-600 block mb-1">Description</label>
                      <p className="text-sm text-slate-900">{selectedPR.description}</p>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-blue-600 block mb-1">Purpose</label>
                      <p className="text-sm text-slate-900">{selectedPR.purpose}</p>
                    </div>

                    {selectedPR.merged_pdf_path && (
                      <div>
                        <label className="text-sm font-semibold text-blue-600 block mb-2">Merged PDF Document</label>
                        <button
                          onClick={async () => {
                            const { data } = supabase.storage
                              .from('attachments')
                              .getPublicUrl(selectedPR.merged_pdf_path!);
                            window.open(data.publicUrl, '_blank');
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                        >
                          <FileText size={18} />
                          View Merged PDF
                        </button>
                      </div>
                    )}

                    {selectedPR.items && selectedPR.items.length > 0 && (
                      <div>
                        <label className="text-sm font-semibold text-blue-600 block mb-2">Items</label>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <table className="w-full">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Item Name</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Description</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Quantity</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Unit</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Unit Price</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Total Amount</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                              {selectedPR.items.map((item: any, index: number) => (
                                <tr key={index}>
                                  <td className="px-4 py-3 text-sm text-slate-900">{item.item_number || item.description}</td>
                                  <td className="px-4 py-3 text-sm text-slate-700">{item.item_description || item.item_notes || '-'}</td>
                                  <td className="px-4 py-3 text-sm text-slate-700">{item.quantity}</td>
                                  <td className="px-4 py-3 text-sm text-slate-700">{item.unit}</td>
                                  <td className="px-4 py-3 text-sm text-slate-700 text-right">₱{item.unit_price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  <td className="px-4 py-3 text-sm text-slate-900 font-semibold text-right">₱{item.total_price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Previous Recommendations Section */}
              {previousRecommendations.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h4 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <CheckCircle size={18} className="text-blue-600" />
                    Previous Approver Recommendations
                  </h4>
                  <div className="space-y-3">
                    {previousRecommendations.map((rec, idx) => {
                      const recommendedVendor = selectedRequest?.suppliers[rec.recommended_quotation_index];
                      return (
                        <div key={rec.id} className="bg-white border border-slate-200 rounded-lg p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                {rec.user_profiles?.full_name || 'Unknown Approver'}
                              </p>
                              <p className="text-xs text-slate-600">{rec.approver_level}</p>
                            </div>
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                              Quotation {rec.recommended_quotation_index + 1}
                            </span>
                          </div>
                          <div className="text-sm text-slate-700">
                            <p className="font-semibold">Recommended Vendor:</p>
                            <p className="text-slate-900">{recommendedVendor?.vendor_name || 'Unknown Vendor'}</p>
                            <p className="text-xs text-slate-600 mt-1">
                              Net Payable: ₱{recommendedVendor?.net_payable?.toLocaleString() || '0'}
                            </p>
                          </div>
                          {rec.recommendation_remarks && (
                            <div className="mt-2 pt-2 border-t border-slate-200">
                              <p className="text-xs font-semibold text-slate-600">Remarks:</p>
                              <p className="text-xs text-slate-700">{rec.recommendation_remarks}</p>
                            </div>
                          )}
                          <p className="text-xs text-slate-500 mt-2">
                            {new Date(rec.created_at).toLocaleString()}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedRequest.suppliers && selectedRequest.suppliers.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Quotations Summary</label>
                  {/* Non-final approvers: select recommended vendor */}
                  {selectedRequest.current_approval_level < approvalFlows.length - 1 && canApprove() && (
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-semibold text-slate-900 mb-3">
                        Select your recommended vendor before approving:
                      </p>
                      <div className="space-y-2">
                        {selectedRequest.suppliers.map((supplier: any, index: number) => {
                          if (!supplier.vendor_name || supplier.vendor_name.trim() === '') return null;
                          return (
                            <label key={index} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-amber-400 transition">
                              <input
                                type="radio"
                                name="my-recommended-vendor"
                                checked={myRecommendedVendorIndex === index}
                                onChange={() => setMyRecommendedVendorIndex(index)}
                                className="w-4 h-4 text-amber-600"
                              />
                              <div className="flex-1">
                                <p className="font-semibold text-slate-900">Quotation {index + 1} - {supplier.vendor_name}</p>
                                <p className="text-sm text-slate-600">Net Payable: ₱{supplier.net_payable?.toLocaleString() || '0'}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      <div className="mt-3">
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Recommendation Remarks (Optional)</label>
                        <textarea
                          value={myRecommendationRemarks}
                          onChange={(e) => setMyRecommendationRemarks(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                          placeholder="Why do you recommend this vendor?"
                        />
                      </div>
                    </div>
                  )}
                  {/* Final approver: select winning vendor */}
                  {selectedRequest.current_approval_level === approvalFlows.length - 1 && canApprove() && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-semibold text-slate-900 mb-2">
                        Select the winning vendor before approving:
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {selectedRequest.suppliers.map((supplier: any, index: number) => {
                      if (!supplier.vendor_name || supplier.vendor_name.trim() === '') return null;
                      const isRecommended = selectedRequest.recommended_quotation_index === index;
                      const isSelected = selectedVendorIndex === index;
                      const isLastApprovalLevel = selectedRequest.current_approval_level === approvalFlows.length - 1;
                      const showSelector = isLastApprovalLevel && canApprove();

                      // Find all approvers who recommended this quotation
                      const approversWhoRecommended = previousRecommendations.filter(
                        rec => rec.recommended_quotation_index === index
                      );

                      return (
                        <div
                          key={index}
                          className={`border rounded-lg p-4 flex flex-col ${
                            isSelected && showSelector
                              ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600'
                              : isRecommended
                                ? 'border-green-500 bg-green-50'
                                : approversWhoRecommended.length > 0
                                  ? 'border-amber-500 bg-amber-50'
                                  : 'border-slate-200 bg-white'
                          } ${showSelector ? 'cursor-pointer hover:border-blue-400 transition' : ''}`}
                          onClick={() => {
                            if (showSelector) {
                              setSelectedVendorIndex(index);
                            }
                          }}
                        >
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="font-bold text-slate-900 flex items-center gap-2">
                                {showSelector && (
                                  <input
                                    type="radio"
                                    checked={isSelected}
                                    onChange={() => setSelectedVendorIndex(index)}
                                    className="w-5 h-5 text-blue-600"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                )}
                                Quotation {index + 1}
                              </h5>
                              <span className="text-lg font-bold text-blue-600">₱{supplier.net_payable?.toLocaleString() || '0'}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {isRecommended && !showSelector && (
                                <span className="px-2 py-1 bg-green-600 text-white text-xs rounded-full">Recommended</span>
                              )}
                              {isRecommended && showSelector && (
                                <span className="px-2 py-1 bg-green-600 text-white text-xs rounded-full">Initially Recommended</span>
                              )}
                              {approversWhoRecommended.map((rec) => (
                                <span key={rec.id} className="px-2 py-1 bg-amber-600 text-white text-xs rounded-full">
                                  Recommended by {rec.user_profiles?.full_name || rec.approver_level}
                                </span>
                              ))}
                              {isSelected && showSelector && (
                                <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">Selected to Win</span>
                              )}
                            </div>
                          </div>

                          {/* Items Table */}
                          {supplier.items && supplier.items.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-200 flex-1 flex flex-col min-h-0">
                              <label className="text-xs font-semibold text-slate-600 mb-2 block">Items</label>
                              <div className="bg-white border border-slate-200 rounded-lg overflow-auto max-h-64">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-50">
                                    <tr>
                                      <th className="px-2 py-2 text-left text-xs font-semibold text-slate-700">Description</th>
                                      <th className="px-2 py-2 text-center text-xs font-semibold text-slate-700">Qty</th>
                                      <th className="px-2 py-2 text-center text-xs font-semibold text-slate-700">UOM</th>
                                      <th className="px-2 py-2 text-right text-xs font-semibold text-slate-700">Unit Price</th>
                                      <th className="px-2 py-2 text-right text-xs font-semibold text-slate-700">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {supplier.items.map((item: any, itemIdx: number) => (
                                      <tr key={itemIdx}>
                                        <td className="px-2 py-2 break-words whitespace-normal">{item.description}</td>
                                        <td className="px-2 py-2 text-center">{item.quantity}</td>
                                        <td className="px-2 py-2 text-center">{item.uom}</td>
                                        <td className="px-2 py-2 text-right">₱{item.unit_price?.toFixed(2)}</td>
                                        <td className="px-2 py-2 text-right font-semibold">₱{item.amount?.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                    <tr>
                                      <td colSpan={4} className="px-2 py-2 text-right font-bold text-slate-900">Total:</td>
                                      <td className="px-2 py-2 text-right font-bold text-blue-600">₱{supplier.quoted_amount?.toFixed(2) || '0.00'}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          )}

                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <label className="text-xs font-semibold text-slate-600 mb-2 block">Amounts</label>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Quoted Amount</label>
                                <p className="text-slate-900">₱{supplier.quoted_amount?.toLocaleString()}</p>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Delivery Fee</label>
                                <p className="text-slate-900">₱{supplier.delivery_fee?.toLocaleString() || '0'}</p>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Discounted Price</label>
                                <p className="text-slate-900">₱{supplier.discounted_price?.toLocaleString() || '0'}</p>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Net of VAT</label>
                                <p className="text-slate-900">₱{supplier.net_of_vat?.toLocaleString() || '0'}</p>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">VAT (12%)</label>
                                <p className="text-slate-900">₱{supplier.vat_12?.toLocaleString() || '0'}</p>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">EWT</label>
                                <p className="text-slate-900">₱{supplier.ewt?.toLocaleString() || '0'}</p>
                              </div>
                            </div>
                            <div className="mt-2 flex gap-2 flex-wrap">
                              {supplier.invoice_availability && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Invoice Available</span>
                              )}
                              {supplier.delivery && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Delivery</span>
                              )}
                              {supplier.installation && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Installation</span>
                              )}
                              {supplier.vatable && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">VATable</span>
                              )}
                              {supplier.withholding_tax && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Withholding Tax</span>
                              )}
                              {supplier.is_service && (
                                <span className="px-2 py-1 bg-slate-100 text-slate-800 text-xs rounded">Service</span>
                              )}
                              {supplier.is_item && (
                                <span className="px-2 py-1 bg-slate-100 text-slate-800 text-xs rounded">Item</span>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-slate-200 space-y-2 text-sm">
                            <label className="text-xs font-semibold text-slate-600 block">Vendor Details</label>
                            <div>
                              <label className="text-xs font-semibold text-slate-600">Vendor</label>
                              <p className="text-slate-900 text-sm">{supplier.vendor_name}</p>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-600">Registered Name</label>
                              <p className="text-slate-900 text-sm">{supplier.registered_name || 'N/A'}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Contact Person</label>
                                <p className="text-slate-900 text-sm">{supplier.contact_person || 'N/A'}</p>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Contact Number</label>
                                <p className="text-slate-900 text-sm">{supplier.contact_no || 'N/A'}</p>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-600">Address</label>
                              <p className="text-slate-900 text-xs">{supplier.complete_address || 'N/A'}</p>
                            </div>
                          </div>

                          {(supplier.quotation_file_path || (supplier as any).quotation_file_path) && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <button
                                onClick={async () => {
                                  console.log('Supplier data:', supplier);
                                  const filePath = supplier.quotation_file_path || (supplier as any).quotation_file_path;
                                  console.log('File path:', filePath);
                                  const { data, error } = await supabase.storage
                                    .from('attachments')
                                    .createSignedUrl(filePath, 60);
                                  if (error) {
                                    console.error('Error creating signed URL:', error);
                                    alert('Error loading file: ' + error.message);
                                    return;
                                  }
                                  if (data?.signedUrl) {
                                    window.open(data.signedUrl, '_blank');
                                  }
                                }}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                              >
                                <FileText size={16} />
                                View Quotation File
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedRequest.recommendation_remarks && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <label className="text-sm font-semibold text-slate-700 mb-2 block">Recommendation Remarks</label>
                  <p className="text-sm text-slate-900">{selectedRequest.recommendation_remarks}</p>
                </div>
              )}

              {selectedRequest.status === 'approved' && selectedRequest.rfp_pdf_path && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Canvass Sheet & RFP Document</label>
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        try {
                          const { data, error } = await supabase.storage
                            .from('attachments')
                            .createSignedUrl(selectedRequest.rfp_pdf_path!, 60);
                          if (error) {
                            console.error('Error creating signed URL:', error);
                            alert('Error loading document: ' + error.message);
                            return;
                          }
                          if (data?.signedUrl) {
                            window.open(data.signedUrl, '_blank');
                          }
                        } catch (error) {
                          console.error('Error viewing document:', error);
                          alert('Error viewing document');
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      <Eye size={16} />
                      View Document
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const { data, error } = await supabase.storage
                            .from('attachments')
                            .download(selectedRequest.rfp_pdf_path!);
                          if (error) {
                            console.error('Error downloading document:', error);
                            alert('Error downloading document: ' + error.message);
                            return;
                          }
                          if (data) {
                            const url = URL.createObjectURL(data);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${selectedRequest.canvass_number}_document.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }
                        } catch (error) {
                          console.error('Error downloading document:', error);
                          alert('Error downloading document');
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                    >
                      <FileText size={16} />
                      Download Document
                    </button>
                  </div>
                </div>
              )}

              <ApprovalProgressTracker
                requestType="Canvass"
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
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold text-sm sm:text-base"
                >
                  {approving ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
                  {approving ? 'Approving...' : 'Approve'}
                </button>
                {selectedRequest.current_approval_level === approvalFlows.length - 1 && (
                  <button
                    onClick={() => handleAction('rejected')}
                    disabled={loading || !canApprove()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 sm:px-6 sm:py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold text-sm sm:text-base"
                  >
                    {rejecting ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
                    {rejecting ? 'Rejecting...' : 'Reject'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
