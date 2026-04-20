import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ViewType } from './Layout';
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
  const { profile } = useAuth();
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
        const countViaRpc = async (requestType: string) => {
          const { data } = await supabase.rpc('get_my_pending_approval_ids', {
            p_request_type: requestType,
            p_user_id: profile.id,
          });
          return data?.length || 0;
        };

        const [prCount, canvassCount, pcCount, reimbCount, caCount] = await Promise.all([
          countViaRpc('Purchase Requisition'),
          countViaRpc('Canvass'),
          countViaRpc('Petty Cash'),
          countViaRpc('Reimbursement'),
          countViaRpc('Cash Advance'),
        ]);

        pendingApprovals = {
          pr: prCount,
          canvass: canvassCount,
          pettyCash: pcCount,
          reimbursement: reimbCount,
          cashAdvance: caCount,
        };
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
              onClick={() => onViewChange?.('pr-request')}
            />
            <RequestTypeCard
              icon={Search}
              label="Canvass"
              count={stats.myRequests.canvass}
              onClick={() => onViewChange?.('canvass-request')}
            />
            <RequestTypeCard
              icon={Wallet}
              label="Petty Cash"
              count={stats.myRequests.pettyCash}
              onClick={() => onViewChange?.('petty-cash-request')}
            />
            <RequestTypeCard
              icon={Banknote}
              label="Cash Advance"
              count={stats.myRequests.cashAdvance}
              onClick={() => onViewChange?.('cash-advance-request')}
            />
            <RequestTypeCard
              icon={Receipt}
              label="Reimbursement"
              count={stats.myRequests.reimbursement}
              onClick={() => onViewChange?.('reimbursement-request')}
            />
          </div>
        </div>

        {(profile?.role === 'approver' || profile?.role === 'admin' || profile?.role === 'procurement' || profile?.role === 'accounting') && (
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
