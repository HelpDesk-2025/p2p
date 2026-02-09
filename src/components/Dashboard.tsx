import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ViewType } from './Layout';
import { getApprovalFlow, getNextApprover, filterApprovalFlowsForRequester } from '../lib/approvalFlow';
import {
  FileText,
  Search,
  Wallet,
  Receipt,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Banknote,
} from 'lucide-react';

interface DashboardStats {
  myRequests: {
    pr: number;
    canvass: number;
    pettyCash: number;
    reimbursement: number;
    cashAdvance: number;
  };
  pendingApprovals: {
    pr: number;
    canvass: number;
    pettyCash: number;
    reimbursement: number;
    cashAdvance: number;
  };
  statusCounts: {
    pending: number;
    approved: number;
    rejected: number;
  };
}

interface DashboardProps {
  onViewChange?: (view: ViewType) => void;
}

export function Dashboard({ onViewChange }: DashboardProps) {
  const { profile, isImpersonating } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    myRequests: { pr: 0, canvass: 0, pettyCash: 0, reimbursement: 0, cashAdvance: 0 },
    pendingApprovals: { pr: 0, canvass: 0, pettyCash: 0, reimbursement: 0, cashAdvance: 0 },
    statusCounts: { pending: 0, approved: 0, rejected: 0 },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [profile?.id]);

  const loadDashboardData = async () => {
    if (!profile?.id) return;

    try {
      const [prData, canvassData, pcData, reimbData, cashAdvData] = await Promise.all([
        supabase
          .from('purchase_requisitions')
          .select('status', { count: 'exact' })
          .eq('requester_id', profile.id),
        supabase
          .from('canvass_requests')
          .select('status', { count: 'exact' })
          .eq('requester_id', profile.id),
        supabase
          .from('petty_cash_requests')
          .select('status', { count: 'exact' })
          .eq('requester_id', profile.id),
        supabase
          .from('reimbursement_requests')
          .select('status', { count: 'exact' })
          .eq('requester_id', profile.id),
        supabase
          .from('cash_advance_requests')
          .select('status', { count: 'exact' })
          .eq('requester_id', profile.id),
      ]);

      const myRequests = {
        pr: prData.count || 0,
        canvass: canvassData.count || 0,
        pettyCash: pcData.count || 0,
        reimbursement: reimbData.count || 0,
        cashAdvance: cashAdvData.count || 0,
      };

      let pendingApprovals = { pr: 0, canvass: 0, pettyCash: 0, reimbursement: 0, cashAdvance: 0 };
      if (profile.role === 'approver' || profile.role === 'admin' || profile.role === 'procurement' || profile.role === 'accounting') {
        // When impersonating, use manual counting since RPC uses auth.uid()
        if (isImpersonating) {
          // Manually count pending approvals by checking approval flows
          const countApprovals = async (requestType: string, tableName: string) => {
            const { data: requests } = await supabase
              .from(tableName)
              .select('*')
              .eq('status', 'pending');

            if (!requests) return 0;

            let count = 0;
            for (const req of requests) {
              const companyId = req.company_id || profile.company_id;
              if (!companyId) continue;

              const rawFlows = await getApprovalFlow(
                companyId,
                req.department,
                requestType,
                req.is_budgeted || req.budgeted || false,
                req.total_amount || req.amount || 0
              );

              const flows = await filterApprovalFlowsForRequester(
                rawFlows,
                req.requester_id,
                req.department,
                companyId
              );

              const currentStep = await getNextApprover(flows, req.current_approval_level);

              if (!currentStep) continue;

              // Get the current sequence
              const currentSequence = currentStep.sequence;

              // Check if user matches ANY approval flow at this sequence
              const isCurrentApprover = flows.some(flow => {
                if (flow.sequence !== currentSequence) return false;

                if (flow.user_id) {
                  return flow.user_id === profile.id;
                } else {
                  const approverType = flow.approver_type;

                  if (approverType === 'Department Head' && profile.role === 'approver') {
                    return req.department === profile.department;
                  } else if (approverType === 'Procurement' || approverType === 'Procurement Head') {
                    return profile.role === 'procurement' || profile.role === 'approver' || profile.role === 'admin';
                  } else if (approverType === 'President') {
                    return profile.role === 'approver' || profile.role === 'admin';
                  } else if (approverType === 'Accounting' || approverType === 'Accounting Head') {
                    return profile.role === 'accounting' || profile.role === 'approver' || profile.role === 'admin';
                  }
                }
                return false;
              });

              if (isCurrentApprover) count++;
            }

            return count;
          };

          pendingApprovals = {
            pr: await countApprovals('Purchase Requisition', 'purchase_requisitions'),
            canvass: await countApprovals('Canvass', 'canvass_requests'),
            pettyCash: await countApprovals('Petty Cash', 'petty_cash_requests'),
            reimbursement: await countApprovals('Reimbursement', 'reimbursement_requests'),
            cashAdvance: await countApprovals('Cash Advance', 'cash_advance_requests'),
          };
        } else {
          // Use RPC function for non-impersonated users
          const { data: countsData } = await supabase.rpc('get_user_pending_approval_counts');

          if (countsData && countsData.length > 0) {
            const counts = countsData[0];
            pendingApprovals = {
              pr: counts.purchase_requisition_count || 0,
              canvass: counts.canvass_request_count || 0,
              pettyCash: counts.petty_cash_request_count || 0,
              reimbursement: counts.reimbursement_request_count || 0,
              cashAdvance: counts.cash_advance_request_count || 0,
            };
          }
        }
      }

      let pending = 0;
      let approved = 0;
      let rejected = 0;

      [prData, canvassData, pcData, reimbData, cashAdvData].forEach((result) => {
        result.data?.forEach((item: any) => {
          if (item.status === 'pending') pending++;
          else if (item.status === 'approved') approved++;
          else if (item.status === 'rejected') rejected++;
        });
      });

      setStats({
        myRequests,
        pendingApprovals,
        statusCounts: { pending, approved, rejected },
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-600">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-0">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-1 text-sm sm:text-base">Welcome back, {profile?.full_name}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
        <StatCard
          title="Pending"
          value={stats.statusCounts.pending}
          icon={Clock}
          color="yellow"
        />
        <StatCard
          title="Approved"
          value={stats.statusCounts.approved}
          icon={CheckCircle}
          color="green"
        />
        <StatCard
          title="Rejected"
          value={stats.statusCounts.rejected}
          icon={XCircle}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">My Requests</h2>
          <div className="space-y-2 sm:space-y-3">
            <RequestTypeCard
              icon={FileText}
              label="Purchase Requisitions"
              count={stats.myRequests.pr}
            />
            <RequestTypeCard icon={Search} label="Canvass" count={stats.myRequests.canvass} />
            <RequestTypeCard
              icon={Wallet}
              label="Petty Cash"
              count={stats.myRequests.pettyCash}
            />
            <RequestTypeCard
              icon={Banknote}
              label="Cash Advance"
              count={stats.myRequests.cashAdvance}
            />
            <RequestTypeCard
              icon={Receipt}
              label="Reimbursement"
              count={stats.myRequests.reimbursement}
            />
          </div>
        </div>

        {(profile?.role === 'approver' || profile?.role === 'admin' || profile?.role === 'procurement') && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">
              Pending Approvals
            </h2>
            <div className="space-y-2 sm:space-y-3">
              <RequestTypeCard
                icon={FileText}
                label="Purchase Requisitions"
                count={stats.pendingApprovals.pr}
                alert={stats.pendingApprovals.pr > 0}
                onClick={() => onViewChange?.('pr-approval')}
              />
              <RequestTypeCard
                icon={Search}
                label="Canvass"
                count={stats.pendingApprovals.canvass}
                alert={stats.pendingApprovals.canvass > 0}
                onClick={() => onViewChange?.('canvass-approval')}
              />
              <RequestTypeCard
                icon={Wallet}
                label="Petty Cash"
                count={stats.pendingApprovals.pettyCash}
                alert={stats.pendingApprovals.pettyCash > 0}
                onClick={() => onViewChange?.('petty-cash-approval')}
              />
              <RequestTypeCard
                icon={Banknote}
                label="Cash Advance"
                count={stats.pendingApprovals.cashAdvance}
                alert={stats.pendingApprovals.cashAdvance > 0}
                onClick={() => onViewChange?.('cash-advance-approval')}
              />
              <RequestTypeCard
                icon={Receipt}
                label="Reimbursement"
                count={stats.pendingApprovals.reimbursement}
                alert={stats.pendingApprovals.reimbursement > 0}
                onClick={() => onViewChange?.('reimbursement-approval')}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  icon: any;
  color: 'yellow' | 'green' | 'red';
}

function StatCard({ title, value, icon: Icon, color }: StatCardProps) {
  const colorClasses = {
    yellow: 'bg-yellow-100 text-yellow-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs sm:text-sm font-medium text-slate-600">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1 sm:mt-2">{value}</p>
        </div>
        <div className={`p-2 sm:p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
      </div>
    </div>
  );
}

interface RequestTypeCardProps {
  icon: any;
  label: string;
  count: number;
  alert?: boolean;
  onClick?: () => void;
}

function RequestTypeCard({ icon: Icon, label, count, alert, onClick }: RequestTypeCardProps) {
  const className = `flex items-center justify-between p-2.5 sm:p-3 bg-slate-50 rounded-lg ${
    onClick ? 'cursor-pointer hover:bg-slate-100 transition-colors' : ''
  }`;

  return (
    <div className={className} onClick={onClick}>
      <div className="flex items-center gap-2 sm:gap-3">
        <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 flex-shrink-0" />
        <span className="text-xs sm:text-sm font-medium text-slate-700">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span className="text-base sm:text-lg font-semibold text-slate-900">{count}</span>
        {alert && <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />}
      </div>
    </div>
  );
}
