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
  const [approvalsLoading, setApprovalsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [profile?.id]);

  const loadDashboardData = async () => {
    if (!profile?.id) return;

    try {
      const countQuery = (table: string) =>
        supabase
          .from(table)
          .select('status', { count: 'exact', head: false })
          .eq('requester_id', profile.id);

      const [prData, canvassData, pcData, reimbData, cashAdvData] = await Promise.all([
        countQuery('purchase_requisitions'),
        countQuery('canvass_requests'),
        countQuery('petty_cash_requests'),
        countQuery('reimbursement_requests'),
        countQuery('cash_advance_requests'),
      ]);

      const myRequests = {
        pr: prData.count || 0,
        canvass: canvassData.count || 0,
        pettyCash: pcData.count || 0,
        reimbursement: reimbData.count || 0,
        cashAdvance: cashAdvData.count || 0,
      };

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

      setStats(prev => ({
        ...prev,
        myRequests,
        statusCounts: { pending, approved, rejected },
      }));
      setLoading(false);

      const isApprover = profile.role === 'approver' || profile.role === 'admin' || profile.role === 'procurement' || profile.role === 'accounting';
      if (!isApprover) {
        setApprovalsLoading(false);
        return;
      }

      if (isImpersonating) {
        const countApprovals = async (requestType: string, tableName: string, useIsBudgeted: boolean) => {
          const budgetCol = useIsBudgeted ? 'is_budgeted, total_amount' : 'budgeted, amount';
          const { data: requests } = await supabase
            .from(tableName)
            .select(`id, company_id, department, requester_id, current_approval_level, ${budgetCol}`)
            .eq('status', 'pending');

          if (!requests) return 0;

          const results = await Promise.all(
            requests.map(async (req) => {
              const companyId = req.company_id || profile.company_id;
              if (!companyId) return false;
              try {
                const isBudgeted = useIsBudgeted ? (req.is_budgeted || false) : (req.budgeted || false);
                const amount = useIsBudgeted ? (req.total_amount || 0) : (req.amount || 0);
                const rawFlows = await getApprovalFlow(
                  companyId,
                  req.department,
                  requestType,
                  isBudgeted,
                  amount
                );
                const flows = await filterApprovalFlowsForRequester(
                  rawFlows,
                  req.requester_id,
                  req.department,
                  companyId
                );
                const currentStep = await getNextApprover(flows, req.current_approval_level);
                if (!currentStep) return false;
                const currentSequence = currentStep.sequence;
                return flows.some(flow => {
                  if (flow.sequence !== currentSequence) return false;
                  if (flow.user_id) return flow.user_id === profile.id;
                  const approverType = flow.approver_type;
                  if (approverType === 'Department Head' && profile.role === 'approver') return req.department === profile.department;
                  if (approverType === 'Procurement' || approverType === 'Procurement Head') return profile.role === 'procurement' || profile.role === 'approver' || profile.role === 'admin';
                  if (approverType === 'President') return profile.role === 'approver' || profile.role === 'admin';
                  if (approverType === 'Accounting' || approverType === 'Accounting Head') return profile.role === 'accounting' || profile.role === 'approver' || profile.role === 'admin';
                  return false;
                });
              } catch {
                return false;
              }
            })
          );
          return results.filter(Boolean).length;
        };

        const [prCount, canvassCount, pcCount, reimbCount, caCount] = await Promise.all([
          countApprovals('Purchase Requisition', 'purchase_requisitions', true),
          countApprovals('Canvass', 'canvass_requests', true),
          countApprovals('Petty Cash', 'petty_cash_requests', false),
          countApprovals('Reimbursement', 'reimbursement_requests', false),
          countApprovals('Cash Advance', 'cash_advance_requests', false),
        ]);

        setStats(prev => ({
          ...prev,
          pendingApprovals: { pr: prCount, canvass: canvassCount, pettyCash: pcCount, reimbursement: reimbCount, cashAdvance: caCount },
        }));
      } else {
        const { data: countsData } = await supabase.rpc('get_user_pending_approval_counts');
        if (countsData && countsData.length > 0) {
          const counts = countsData[0];
          setStats(prev => ({
            ...prev,
            pendingApprovals: {
              pr: counts.purchase_requisition_count || 0,
              canvass: counts.canvass_request_count || 0,
              pettyCash: counts.petty_cash_request_count || 0,
              reimbursement: counts.reimbursement_request_count || 0,
              cashAdvance: counts.cash_advance_request_count || 0,
            },
          }));
        }
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setLoading(false);
    } finally {
      setApprovalsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6 p-4 sm:p-0">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <div className="h-8 bg-slate-200 rounded w-32 mb-2 animate-pulse"/>
          <div className="h-4 bg-slate-100 rounded w-48 animate-pulse"/>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
          {[0,1,2].map(i => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 animate-pulse">
              <div className="flex items-center justify-between">
                <div><div className="h-4 bg-slate-200 rounded w-16 mb-2"/><div className="h-8 bg-slate-200 rounded w-12"/></div>
                <div className="w-10 h-10 bg-slate-200 rounded-lg"/>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 animate-pulse">
            <div className="h-5 bg-slate-200 rounded w-28 mb-4"/>
            <div className="space-y-3">
              {[0,1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg"/>)}
            </div>
          </div>
        </div>
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

        {(profile?.role === 'approver' || profile?.role === 'admin' || profile?.role === 'procurement' || profile?.role === 'accounting') && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900">
                Pending Approvals
              </h2>
              {approvalsLoading && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin"/>
                  Updating...
                </span>
              )}
            </div>
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
