import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Circle, User, Send, CornerDownLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ApprovalFlow } from '../lib/approvalFlow';

interface ApprovalLedgerEntry {
  id: string;
  approver_name: string;
  approver_type: string;
  action: string;
  comments: string;
  approval_date: string;
  sequence: number;
}

interface ApprovalProgressTrackerProps {
  requestType: string;
  requestId: string;
}

export function ApprovalProgressTracker({
  requestType,
  requestId,
}: ApprovalProgressTrackerProps) {
  const [ledgerEntries, setLedgerEntries] = useState<ApprovalLedgerEntry[]>([]);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlow[]>([]);
  const [approverNames, setApproverNames] = useState<Record<string, string>>({});
  const [currentApprovalLevel, setCurrentApprovalLevel] = useState(0);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [msbcSyncStatus, setMsbcSyncStatus] = useState('pending');
  const [msbcSyncDate, setMsbcSyncDate] = useState<string | null>(null);
  const [msbcSyncError, setMsbcSyncError] = useState<string | null>(null);
  const [purchaseType, setPurchaseType] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [requestId]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadApprovalLedger(), loadRequestData()]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRequestData = async () => {
    try {
      const tableName = getTableName(requestType);
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', requestId)
        .single();

      if (error) throw error;

      if (data) {
        setCurrentApprovalLevel(data.current_approval_level || 0);
        setStatus(data.status || 'pending');
        setMsbcSyncStatus(data.msbc_sync_status || 'pending');
        setMsbcSyncDate(data.msbc_sync_date || null);
        setMsbcSyncError(data.msbc_sync_error || null);

        // Store purchase type for PR requests
        if (requestType === 'Purchase Requisition' || requestType === 'purchase_requisition') {
          setPurchaseType(data.purchase_type || null);
        }

        // Get company_id from user profile if not in request
        let companyId = data.company_id;
        if (!companyId && data.requester_id) {
          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('company_id')
            .eq('id', data.requester_id)
            .single();
          companyId = profileData?.company_id;
        }

        // Load approval flows for this request
        if (companyId) {
          try {
            const { getApprovalFlow, filterApprovalFlowsForRequester, addExecutiveApprovalSteps } = await import('../lib/approvalFlow');
            // Handle both column names: is_budgeted (PR, Canvass) and budgeted (Petty Cash, Reimbursement, Cash Advance)
            const isBudgeted = data.is_budgeted !== undefined ? data.is_budgeted : (data.budgeted || false);

            console.log('Loading approval flows for tracker:', {
              companyId,
              department: data.department,
              requestType,
              isBudgeted,
              amount: data.total_amount || data.amount || 0
            });

            const isPettyCash = requestType === 'Petty Cash' || requestType === 'petty_cash';

            const isPR = requestType === 'Purchase Requisition' || requestType === 'purchase_requisition';

            const rawFlows = await getApprovalFlow(
              companyId,
              data.department || '',
              requestType,
              isBudgeted,
              data.total_amount || data.amount || 0,
              isPettyCash ? (data.expense_category || 'Department Expense') : undefined,
              isPR ? (data.purchase_type || undefined) : undefined
            );

            console.log('Raw flows loaded:', rawFlows?.length || 0);

            // For Petty Cash, the configured Approval Flow Setup is the source of truth
            // (Expense Category drives which workflow is used), so executive override is skipped.
            const flowsWithExecutive = isPettyCash
              ? (rawFlows || [])
              : await addExecutiveApprovalSteps(
                  rawFlows || [],
                  data.requester_id,
                  companyId,
                  isBudgeted
                );

            console.log('Flows after executive check:', flowsWithExecutive?.length || 0);

            // Filter out requester from approval flows
            const flows = await filterApprovalFlowsForRequester(
              flowsWithExecutive || [],
              data.requester_id,
              data.department || '',
              companyId
            );

            console.log('Filtered flows:', flows?.length || 0);

            setApprovalFlows(flows || []);

            // Load approver names for flows with user_id or alternate_approver_id
            if (flows && flows.length > 0) {
              const userIds = [
                ...flows.filter(f => f.user_id).map(f => f.user_id as string),
                ...flows.filter(f => f.alternate_approver_id).map(f => f.alternate_approver_id as string),
              ].filter((id, i, arr) => arr.indexOf(id) === i);

              if (userIds.length > 0) {
                const { data: profiles } = await supabase
                  .from('user_profiles')
                  .select('id, full_name')
                  .in('id', userIds);

                if (profiles) {
                  const nameMap: Record<string, string> = {};
                  profiles.forEach(profile => {
                    nameMap[profile.id] = profile.full_name;
                  });
                  setApproverNames(nameMap);
                  console.log('Approver names loaded:', Object.keys(nameMap).length);
                }
              }
            }
          } catch (flowError) {
            console.error('Error loading approval flows:', flowError);
            // Set empty flows to prevent infinite loading
            setApprovalFlows([]);
          }
        } else {
          console.warn('No company ID found for request');
          setApprovalFlows([]);
        }
      }
    } catch (error) {
      console.error('Error loading request data:', error);
      setApprovalFlows([]);
    }
  };

  const getTableName = (requestType: string): string => {
    const typeMap: Record<string, string> = {
      'Purchase Requisition': 'purchase_requisitions',
      'Canvass': 'canvass_requests',
      'Petty Cash': 'petty_cash_requests',
      'Reimbursement': 'reimbursement_requests',
      'Cash Advance': 'cash_advance_requests',
      'Purchase Order': 'purchase_orders',
    };
    return typeMap[requestType] || 'purchase_requisitions';
  };

  const loadApprovalLedger = async () => {
    try {
      const { data, error } = await supabase
        .from('approval_ledger')
        .select('*')
        .eq('request_type', requestType)
        .eq('request_id', requestId)
        .order('sequence', { ascending: true });

      if (error) throw error;
      setLedgerEntries(data || []);
    } catch (error) {
      console.error('Error loading approval ledger:', error);
    }
  };

  const getStepStatus = (index: number) => {
    if (status === 'rejected') {
      const ledgerEntry = ledgerEntries.find(e => e.sequence === index + 1);
      if (ledgerEntry) {
        if (ledgerEntry.action === 'Rejected') return 'rejected';
        if (ledgerEntry.action === 'Auto-Rejected') return 'auto-rejected';
        if (ledgerEntry.action === 'Approved') return 'approved';
      }
      if (index < currentApprovalLevel) return 'approved';
      return 'cancelled';
    }

    if (status === 'returned_to_maker') {
      const ledgerEntry = ledgerEntries.find(e => e.sequence === index + 1);
      if (ledgerEntry) {
        if (ledgerEntry.action === 'Returned') return 'returned';
        if (ledgerEntry.action === 'Approved') return 'approved';
      }
      if (index < currentApprovalLevel) return 'approved';
      return 'cancelled';
    }

    const ledgerEntry = ledgerEntries.find(e => e.sequence === index + 1);
    if (ledgerEntry && ledgerEntry.action === 'Approved') return 'approved';
    if (index < currentApprovalLevel && !ledgerEntry) return 'approved';
    if (index === currentApprovalLevel && (status === 'pending' || status === 'pending_approval')) return 'current';
    return 'pending';
  };

  const getStepIcon = (stepStatus: string) => {
    switch (stepStatus) {
      case 'approved':
        return <CheckCircle className="text-green-600" size={24} />;
      case 'rejected':
        return <XCircle className="text-red-600" size={24} />;
      case 'auto-rejected':
        return <XCircle className="text-gray-400" size={24} />;
      case 'returned':
        return <CornerDownLeft className="text-amber-500" size={24} />;
      case 'current':
        return <Clock className="text-blue-600 animate-pulse" size={24} />;
      case 'cancelled':
        return <Circle className="text-gray-300" size={24} />;
      default:
        return <Circle className="text-gray-300" size={24} />;
    }
  };

  const getStepColor = (stepStatus: string) => {
    switch (stepStatus) {
      case 'approved':
        return 'border-green-600 bg-green-50';
      case 'rejected':
        return 'border-red-600 bg-red-50';
      case 'auto-rejected':
        return 'border-gray-300 bg-gray-50';
      case 'returned':
        return 'border-amber-500 bg-amber-50';
      case 'current':
        return 'border-blue-600 bg-blue-50';
      case 'cancelled':
        return 'border-gray-200 bg-gray-50';
      default:
        return 'border-gray-200 bg-white';
    }
  };

  const getLedgerEntry = (sequence: number) => {
    return ledgerEntries.find(e => e.sequence === sequence);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 border border-slate-200">
        <p className="text-slate-500">Loading approval progress...</p>
      </div>
    );
  }

  const submitterEntry = ledgerEntries.find(e => e.sequence === 0);
  const approvalEntries = ledgerEntries.filter(e => e.sequence > 0);

  if (approvalFlows.length === 0 && approvalEntries.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 border border-slate-200">
        <p className="text-slate-500">No approval flow configured for this request.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-6 border border-slate-200">
      <h3 className="text-lg font-bold text-slate-900 mb-4">Approval Progress</h3>

      <div className="space-y-4">
        {submitterEntry && (
          <div className="flex items-start gap-4 pb-4 border-b border-slate-200">
            <div className="flex-shrink-0 mt-1">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <User className="text-slate-600" size={20} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">Submitted</span>
                <span className="text-xs text-slate-500">
                  {new Date(submitterEntry.approval_date).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-slate-600 mt-1">{submitterEntry.approver_name}</p>
              {submitterEntry.comments && (
                <p className="text-xs text-slate-500 mt-1 italic">{submitterEntry.comments}</p>
              )}
            </div>
          </div>
        )}

        {approvalFlows.length > 0 ? approvalFlows.map((flow, index) => {
          const stepStatus = getStepStatus(index);
          const ledgerEntry = getLedgerEntry(index + 1);
          const isLast = index === approvalFlows.length - 1;

          return (
            <div key={flow.id} className="relative">
              {!isLast && (
                <div
                  className={`absolute left-5 top-12 w-0.5 h-full -mb-4 ${
                    stepStatus === 'approved' ? 'bg-green-600' :
                    stepStatus === 'rejected' ? 'bg-red-600' :
                    stepStatus === 'returned' ? 'bg-amber-500' :
                    'bg-gray-200'
                  }`}
                />
              )}

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 z-10">
                  <div
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${getStepColor(
                      stepStatus
                    )}`}
                  >
                    {getStepIcon(stepStatus)}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">
                      Step {index + 1}:{' '}
                      {flow.user_id && approverNames[flow.user_id]
                        ? approverNames[flow.user_id]
                        : flow.approver_type}
                      {flow.alternate_approver_id && approverNames[flow.alternate_approver_id] && (
                        <span className="text-slate-500 font-normal">
                          {' '}or {approverNames[flow.alternate_approver_id]}
                        </span>
                      )}
                    </span>
                    {flow.for_checking && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                        For Validation
                      </span>
                    )}
                    {stepStatus === 'current' && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">
                        Pending Approval
                      </span>
                    )}
                    {stepStatus === 'approved' && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                        Approved
                      </span>
                    )}
                    {stepStatus === 'rejected' && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">
                        Rejected
                      </span>
                    )}
                    {stepStatus === 'auto-rejected' && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-semibold">
                        Auto-Rejected
                      </span>
                    )}
                    {stepStatus === 'returned' && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-semibold">
                        Returned to Maker
                      </span>
                    )}
                  </div>

                  {ledgerEntry ? (
                    <div className="mt-2">
                      <p className="text-sm text-slate-600">{ledgerEntry.approver_name}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(ledgerEntry.approval_date).toLocaleString()}
                      </p>
                      {ledgerEntry.comments && (
                        <p className="text-sm text-slate-700 mt-2 p-3 bg-slate-50 rounded border border-slate-200 italic">
                          "{ledgerEntry.comments}"
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 mt-1">
                      {stepStatus === 'current' ? 'Waiting for approval...' : 'Not yet reached'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        }) : approvalEntries.map((entry, index) => {
          const isLast = index === approvalEntries.length - 1;
          const isApproved = entry.action === 'approved';
          const isRejected = entry.action === 'rejected';

          return (
            <div key={entry.id} className="relative">
              {!isLast && (
                <div
                  className={`absolute left-5 top-12 w-0.5 h-full -mb-4 ${
                    isApproved ? 'bg-green-600' :
                    isRejected ? 'bg-red-600' :
                    'bg-gray-200'
                  }`}
                />
              )}

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 z-10">
                  <div
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
                      isApproved ? 'bg-green-50 border-green-600' :
                      isRejected ? 'bg-red-50 border-red-600' :
                      'bg-blue-50 border-blue-600'
                    }`}
                  >
                    {isApproved ? (
                      <CheckCircle size={20} className="text-green-600" />
                    ) : isRejected ? (
                      <XCircle size={20} className="text-red-600" />
                    ) : (
                      <Clock size={20} className="text-blue-600" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">
                      Step {index + 1}: {entry.approver_type}
                    </span>
                    {isApproved && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                        Approved
                      </span>
                    )}
                    {isRejected && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">
                        Rejected
                      </span>
                    )}
                    {!isApproved && !isRejected && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">
                        Pending Approval
                      </span>
                    )}
                  </div>

                  <div className="mt-2">
                    <p className="text-sm text-slate-600">{entry.approver_name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(entry.approval_date).toLocaleString()}
                    </p>
                    {entry.comments && (
                      <p className="text-sm text-slate-700 mt-2 p-3 bg-slate-50 rounded border border-slate-200 italic">
                        "{entry.comments}"
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {status === 'approved' && (
        <div className="mt-6 pt-4 border-t border-slate-200 space-y-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle size={20} />
            <span className="font-semibold">Request Fully Approved</span>
          </div>

          {/* Hide MSBC sync for Purchase Order type PRs and Petty Cash */}
          {!((requestType === 'Purchase Requisition' || requestType === 'purchase_requisition') && purchaseType === 'Purchase Order') &&
           !(requestType === 'Petty Cash' || requestType === 'petty_cash') && (
            <div className="relative">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 z-10">
                  <div
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
                      msbcSyncStatus === 'synced' ? 'bg-green-50 border-green-600' :
                      msbcSyncStatus === 'syncing' ? 'bg-blue-50 border-blue-600' :
                      msbcSyncStatus === 'failed' ? 'bg-red-50 border-red-600' :
                      'bg-gray-50 border-gray-300'
                    }`}
                  >
                    {msbcSyncStatus === 'synced' ? (
                      <CheckCircle className="text-green-600" size={24} />
                    ) : msbcSyncStatus === 'syncing' ? (
                      <Send className="text-blue-600 animate-pulse" size={24} />
                    ) : msbcSyncStatus === 'failed' ? (
                      <XCircle className="text-red-600" size={24} />
                    ) : (
                      <Clock className="text-gray-400" size={24} />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">
                      Sending Request to MSBC
                    </span>
                    {msbcSyncStatus === 'pending' && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-semibold">
                        Pending
                      </span>
                    )}
                    {msbcSyncStatus === 'syncing' && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">
                        Syncing...
                      </span>
                    )}
                    {msbcSyncStatus === 'synced' && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                        Sent Successfully
                      </span>
                    )}
                    {msbcSyncStatus === 'failed' && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">
                        Failed
                      </span>
                    )}
                  </div>

                  {msbcSyncStatus === 'synced' && msbcSyncDate && (
                    <p className="text-xs text-slate-500 mt-1">
                      Sent to MSBC on {new Date(msbcSyncDate).toLocaleString()}
                    </p>
                  )}

                  {msbcSyncStatus === 'failed' && msbcSyncError && (
                    <div className="mt-2 p-3 bg-red-50 rounded border border-red-200">
                      <p className="text-sm text-red-700 font-semibold">Error:</p>
                      <p className="text-sm text-red-600 mt-1">{msbcSyncError}</p>
                    </div>
                  )}

                  {msbcSyncStatus === 'pending' && (
                    <p className="text-sm text-slate-500 mt-1">
                      Waiting to send to MSBC...
                    </p>
                  )}

                  {msbcSyncStatus === 'syncing' && (
                    <p className="text-sm text-slate-500 mt-1">
                      Sending request to MSBC...
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {status === 'rejected' && (
        <div className="mt-6 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 text-red-700">
            <XCircle size={20} />
            <span className="font-semibold">Request Rejected</span>
          </div>
        </div>
      )}
    </div>
  );
}
