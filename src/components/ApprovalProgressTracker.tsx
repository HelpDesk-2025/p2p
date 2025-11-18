import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Circle, User } from 'lucide-react';
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
  const [currentApprovalLevel, setCurrentApprovalLevel] = useState(0);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [requestId]);

  const loadData = async () => {
    await Promise.all([loadApprovalLedger(), loadRequestData()]);
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

        // Load approval flows for this request
        if (data.company_id) {
          const { getApprovalFlow } = await import('../lib/approvalFlow');
          const flows = await getApprovalFlow(
            data.company_id,
            data.department || '',
            requestType,
            data.is_budgeted || false,
            data.total_amount || data.amount || 0
          );
          setApprovalFlows(flows || []);
        }
      }
    } catch (error) {
      console.error('Error loading request data:', error);
    }
  };

  const getTableName = (requestType: string): string => {
    const typeMap: Record<string, string> = {
      'Purchase Requisition': 'purchase_requisitions',
      'Canvass': 'canvass_requests',
      'Petty Cash': 'petty_cash_requests',
      'Reimbursement': 'reimbursement_requests',
      'Cash Advance': 'cash_advance_requests',
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
    } finally {
      setLoading(false);
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

    if (index < currentApprovalLevel) return 'approved';
    if (index === currentApprovalLevel && status === 'pending') return 'current';
    if (status === 'approved' && index < approvalFlows.length) return 'approved';
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

  if (approvalFlows.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 border border-slate-200">
        <p className="text-slate-500">No approval flow configured for this request.</p>
      </div>
    );
  }

  const submitterEntry = ledgerEntries.find(e => e.sequence === 0);

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

        {approvalFlows.map((flow, index) => {
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
                      Step {index + 1}: {flow.approver_type}
                    </span>
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
        })}
      </div>

      {status === 'approved' && (
        <div className="mt-6 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle size={20} />
            <span className="font-semibold">Request Fully Approved</span>
          </div>
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
