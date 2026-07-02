import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertOctagon, AlertTriangle, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ViewType } from '../Layout';
import { MODULES } from './modules';
import { resolveCompanyIds } from './companyScope';
import { cn } from '../../lib/utils';

interface OverdueRow {
  approver_id: string;
  request_type: string;
  request_id: string;
  request_number: string;
  days_overdue: number;
  days_allowed: number;
}

interface ActionCenterStats {
  overdue: number;
  escalated: number;
  neededToday: number;
  completedThisWeek: number;
}

interface ActionCenterProps {
  onViewChange?: (view: ViewType) => void;
}

export function ActionCenter({ onViewChange }: ActionCenterProps) {
  const { profile } = useAuth();
  const [stats, setStats] = useState<ActionCenterStats>({
    overdue: 0,
    escalated: 0,
    neededToday: 0,
    completedThisWeek: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    loadActionCenter();
  }, [profile?.id]);

  const loadActionCenter = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      // Real, SLA-based overdue data — existing function, reused as-is, filtered to this viewer.
      const { data: overdueData, error: overdueError } = await supabase.rpc(
        'get_overdue_pending_approvals'
      );
      if (overdueError) throw overdueError;

      const myOverdue: OverdueRow[] = ((overdueData || []) as OverdueRow[]).filter(
        (row) => row.approver_id === profile.id
      );
      const escalated = myOverdue.filter((row) => row.days_overdue >= row.days_allowed).length;

      // "Needed today" — fulfillment due date on the requester's side, distinct from approval SLA.
      const todayStr = new Date().toISOString().slice(0, 10);
      const companyIds = resolveCompanyIds(profile);
      const dueTodayCounts = await Promise.all(
        MODULES.filter((m) => m.dueDateColumn).map(async (m) => {
          const { count } = await supabase
            .from(m.table)
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .in('company_id', companyIds)
            .eq(m.dueDateColumn as string, todayStr);
          return count || 0;
        })
      );
      const neededToday = dueTodayCounts.reduce((a, b) => a + b, 0);

      // Completed this week — approvals this user personally actioned, from the ledger.
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { count: completedThisWeek } = await supabase
        .from('approval_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('approver_id', profile.id)
        .eq('action', 'Approved')
        .gte('approval_date', weekAgo.toISOString());

      setStats({
        overdue: myOverdue.length,
        escalated,
        neededToday,
        completedThisWeek: completedThisWeek || 0,
      });
    } catch (error) {
      console.error('Error loading action center:', error);
    } finally {
      setLoading(false);
    }
  };

  const cards: {
    key: string;
    label: string;
    sublabel: string;
    value: number;
    icon: any;
    wrap: string;
    iconWrap: string;
    onClick?: () => void;
  }[] = [
    {
      key: 'overdue',
      label: 'Overdue Approvals',
      sublabel: 'Past SLA target',
      value: stats.overdue,
      icon: AlertOctagon,
      wrap: 'bg-red-50 border-red-200',
      iconWrap: 'bg-red-100 text-red-700',
      onClick: () => onViewChange?.('pr-approval'),
    },
    {
      key: 'escalated',
      label: 'Escalated',
      sublabel: 'Overdue 2x+ SLA (estimated)',
      value: stats.escalated,
      icon: AlertTriangle,
      wrap: 'bg-orange-50 border-orange-200',
      iconWrap: 'bg-orange-100 text-orange-700',
    },
    {
      key: 'neededToday',
      label: 'Needed Today',
      sublabel: "Requester's due date is today",
      value: stats.neededToday,
      icon: Clock,
      wrap: 'bg-blue-50 border-blue-200',
      iconWrap: 'bg-blue-100 text-blue-700',
    },
    {
      key: 'completed',
      label: 'Completed This Week',
      sublabel: 'Approved by you',
      value: stats.completedThisWeek,
      icon: CheckCircle2,
      wrap: 'bg-green-50 border-green-200',
      iconWrap: 'bg-green-100 text-green-700',
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm sm:text-base font-semibold text-slate-900">Action Center</h2>
          <p className="text-xs text-slate-500">What needs your attention right now</p>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {cards.map((card, i) => (
          <motion.button
            key={card.key}
            type="button"
            onClick={card.onClick}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.05 }}
            className={cn(
              'text-left rounded-lg border p-3 transition',
              card.wrap,
              card.onClick ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className={cn('p-1.5 rounded-lg', card.iconWrap)}>
                <card.icon className="w-4 h-4" />
              </div>
              <span className="text-2xl font-bold text-slate-900 tabular-nums leading-none">
                {loading ? '–' : card.value}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-800 mt-2">{card.label}</p>
            <p className="text-[11px] text-slate-500">{card.sublabel}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
