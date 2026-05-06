import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, MODULE_PERMISSIONS } from '../lib/permissions';
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
  Megaphone,
  Info,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Building2,
  ChevronLeft,
  ChevronRight,
  X,
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

type AnnouncementPriority = 'info' | 'success' | 'warning' | 'critical';

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  starts_at: string | null;
  ends_at: string | null;
  company_id: string | null;
  created_at: string;
  companies?: { name: string } | null;
}

const announcementStyles: Record<AnnouncementPriority, { wrap: string; iconWrap: string; Icon: any }> = {
  info: {
    wrap: 'bg-sky-50 border-sky-200',
    iconWrap: 'bg-sky-100 text-sky-700',
    Icon: Info,
  },
  success: {
    wrap: 'bg-emerald-50 border-emerald-200',
    iconWrap: 'bg-emerald-100 text-emerald-700',
    Icon: CheckCircle2,
  },
  warning: {
    wrap: 'bg-amber-50 border-amber-200',
    iconWrap: 'bg-amber-100 text-amber-700',
    Icon: AlertTriangle,
  },
  critical: {
    wrap: 'bg-rose-50 border-rose-200',
    iconWrap: 'bg-rose-100 text-rose-700',
    Icon: AlertOctagon,
  },
};

export function Dashboard({ onViewChange }: DashboardProps) {
  const { profile, permissions } = useAuth();

  const canView = (perm: string) => hasPermission(permissions, perm);
  const goIfAllowed = (perm: string, view: ViewType) =>
    canView(perm) ? () => onViewChange?.(view) : undefined;
  const [stats, setStats] = useState<DashboardStats>({
    myRequests: { pr: 0, canvass: 0, pettyCash: 0, reimbursement: 0, cashAdvance: 0 },
    pendingApprovals: { pr: 0, canvass: 0, pettyCash: 0, reimbursement: 0, cashAdvance: 0 },
    statusCounts: { pending: 0, approved: 0, rejected: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    loadAnnouncements();
  }, [profile?.id, profile?.company_id]);

  const loadAnnouncements = async () => {
    setAnnouncementsLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('announcements')
        .select('id,title,message,priority,starts_at,ends_at,company_id,created_at,companies(name)')
        .eq('is_active', true)
        .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
        .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAnnouncements((data || []) as Announcement[]);
    } catch (err) {
      console.error('Error loading announcements:', err);
    } finally {
      setAnnouncementsLoading(false);
    }
  };

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
    <div className="h-full flex flex-col gap-3 sm:gap-4 min-h-0 p-4 sm:p-0">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-3 sm:px-6 sm:py-4 flex-shrink-0">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 text-xs sm:text-sm">Welcome back, {profile?.full_name}</p>
      </div>

      <div className="flex-shrink-0">
        <AnnouncementsPanel loading={announcementsLoading} announcements={announcements} />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 flex-shrink-0">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 flex-1 min-h-0">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 flex flex-col min-h-0">
          <h2 className="text-sm sm:text-base font-semibold text-slate-900 mb-2 sm:mb-3 flex-shrink-0">My Requests</h2>
          <div className="space-y-1.5 sm:space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
            <RequestTypeCard
              icon={FileText}
              label="Purchase Requisitions"
              count={stats.myRequests.pr}
              onClick={goIfAllowed(MODULE_PERMISSIONS.PURCHASE_REQUISITION, 'pr-request')}
            />
            <RequestTypeCard
              icon={Search}
              label="Canvass"
              count={stats.myRequests.canvass}
              onClick={goIfAllowed(MODULE_PERMISSIONS.CANVASS, 'canvass-request')}
            />
            <RequestTypeCard
              icon={Wallet}
              label="Petty Cash"
              count={stats.myRequests.pettyCash}
              onClick={goIfAllowed(MODULE_PERMISSIONS.PETTY_CASH, 'petty-cash-request')}
            />
            <RequestTypeCard
              icon={Banknote}
              label="Cash Advance"
              count={stats.myRequests.cashAdvance}
              onClick={goIfAllowed(MODULE_PERMISSIONS.CASH_ADVANCE, 'cash-advance-request')}
            />
            <RequestTypeCard
              icon={Receipt}
              label="Reimbursement | Liquidation"
              count={stats.myRequests.reimbursement}
              onClick={goIfAllowed(MODULE_PERMISSIONS.REIMBURSEMENT, 'reimbursement-request')}
            />
          </div>
        </div>

        {profile && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 flex flex-col min-h-0">
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 mb-2 sm:mb-3 flex-shrink-0">
              Pending Approvals
            </h2>
            <div className="space-y-1.5 sm:space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
              <RequestTypeCard
                icon={FileText}
                label="Purchase Requisitions"
                count={stats.pendingApprovals.pr}
                alert={stats.pendingApprovals.pr > 0}
                onClick={goIfAllowed(MODULE_PERMISSIONS.PR_APPROVAL, 'pr-approval')}
              />
              <RequestTypeCard
                icon={Search}
                label="Canvass"
                count={stats.pendingApprovals.canvass}
                alert={stats.pendingApprovals.canvass > 0}
                onClick={goIfAllowed(MODULE_PERMISSIONS.CANVASS_APPROVAL, 'canvass-approval')}
              />
              <RequestTypeCard
                icon={Wallet}
                label="Petty Cash"
                count={stats.pendingApprovals.pettyCash}
                alert={stats.pendingApprovals.pettyCash > 0}
                onClick={goIfAllowed(MODULE_PERMISSIONS.PETTY_CASH_APPROVAL, 'petty-cash-approval')}
              />
              <RequestTypeCard
                icon={Banknote}
                label="Cash Advance"
                count={stats.pendingApprovals.cashAdvance}
                alert={stats.pendingApprovals.cashAdvance > 0}
                onClick={goIfAllowed(MODULE_PERMISSIONS.CASH_ADVANCE_APPROVAL, 'cash-advance-approval')}
              />
              <RequestTypeCard
                icon={Receipt}
                label="Reimbursement | Liquidation"
                count={stats.pendingApprovals.reimbursement}
                alert={stats.pendingApprovals.reimbursement > 0}
                onClick={goIfAllowed(MODULE_PERMISSIONS.REIMBURSEMENT_APPROVAL, 'reimbursement-approval')}
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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs font-medium text-slate-600">{title}</p>
          <p className="text-lg sm:text-2xl font-bold text-slate-900 leading-tight">{value}</p>
        </div>
        <div className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${colorClasses[color]}`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
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

interface AnnouncementsPanelProps {
  loading: boolean;
  announcements: Announcement[];
}

function AnnouncementsPanel({ loading, announcements }: AnnouncementsPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [selected, setSelected] = useState<Announcement | null>(null);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const total = announcements.length;

  useEffect(() => {
    if (currentIndex >= total && total > 0) {
      setCurrentIndex(0);
    }
  }, [total, currentIndex]);

  useEffect(() => {
    if (total <= 1 || isPaused) return;
    const id = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % total);
    }, 6000);
    return () => clearInterval(id);
  }, [total, isPaused]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Megaphone className="w-4 h-4" />
          Loading announcements...
        </div>
      </div>
    );
  }

  if (total === 0) {
    return null;
  }

  const goPrev = () => setCurrentIndex((i) => (i - 1 + total) % total);
  const goNext = () => setCurrentIndex((i) => (i + 1) % total);
  const safeIndex = Math.min(currentIndex, total - 1);

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-slate-200 px-5 py-4 sm:px-6 sm:py-5 min-h-[300px] sm:min-h-[360px] flex flex-col"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">Announcements</h2>
            <p className="text-xs text-slate-500">Latest updates and notices</p>
          </div>
        </div>
        {total > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {safeIndex + 1} / {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous announcement"
                className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next announcement"
                className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="overflow-hidden flex-1 min-h-0 flex">
        <div
          className="flex transition-transform duration-500 ease-out flex-1 min-h-0"
          style={{ transform: `translateX(-${safeIndex * 100}%)` }}
        >
          {announcements.map((a) => {
            const style = announcementStyles[a.priority] || announcementStyles.info;
            const Icon = style.Icon;
            return (
              <div key={a.id} className="w-full flex-shrink-0 px-0.5 flex">
                <button
                  type="button"
                  onClick={() => setSelected(a)}
                  className={`w-full text-left flex items-stretch gap-3 px-3.5 py-3 sm:px-4 sm:py-3.5 rounded-lg border transition hover:shadow-md hover:-translate-y-0.5 cursor-pointer ${style.wrap}`}
                >
                  <div className={`p-2 rounded-lg flex-shrink-0 self-start ${style.iconWrap}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col h-full">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-semibold text-slate-900 text-base sm:text-lg truncate">{a.title}</h3>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 border border-slate-200 text-xs font-medium text-slate-600 flex-shrink-0">
                          <Building2 className="w-3 h-3" />
                          {a.company_id ? (a.companies?.name ?? 'Specific') : 'All'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        {new Date(a.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1.5 whitespace-pre-wrap flex-1 overflow-hidden">{a.message}</p>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {total > 1 && (
        <div className="flex items-center justify-center gap-1 mt-1.5">
          {announcements.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setCurrentIndex(i)}
              aria-label={`Go to announcement ${i + 1}`}
              className={`h-1 rounded-full transition-all ${
                i === safeIndex ? 'w-4 bg-sky-600' : 'w-1 bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      )}
      {selected && (
        <AnnouncementModal announcement={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

interface AnnouncementModalProps {
  announcement: Announcement;
  onClose: () => void;
}

function AnnouncementModal({ announcement, onClose }: AnnouncementModalProps) {
  const style = announcementStyles[announcement.priority] || announcementStyles.info;
  const Icon = style.Icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-start gap-4 px-6 py-5 border-b ${style.wrap}`}>
          <div className={`p-2.5 rounded-lg flex-shrink-0 ${style.iconWrap}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900 text-xl leading-snug">
              {announcement.title}
            </h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 text-xs font-medium text-slate-600">
                <Building2 className="w-3 h-3" />
                {announcement.company_id
                  ? (announcement.companies?.name ?? 'Specific Company')
                  : 'All Companies'}
              </span>
              <span className="text-xs text-slate-500">
                {new Date(announcement.created_at).toLocaleString()}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">
          <p className="text-sm sm:text-base text-slate-700 whitespace-pre-wrap leading-relaxed">
            {announcement.message}
          </p>
        </div>
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestTypeCard({ icon: Icon, label, count, alert, onClick }: RequestTypeCardProps) {
  const className = `flex items-center justify-between px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-50 rounded-lg ${
    onClick ? 'cursor-pointer hover:bg-slate-100 transition-colors' : ''
  }`;

  return (
    <div className={className} onClick={onClick}>
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Icon className="w-4 h-4 text-slate-600 flex-shrink-0" />
        <span className="text-xs sm:text-sm font-medium text-slate-700 truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        <span className="text-sm sm:text-base font-semibold text-slate-900">{count}</span>
        {alert && <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />}
      </div>
    </div>
  );
}
