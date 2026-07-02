import { useEffect, useState } from 'react';
import { Clock, CheckCircle, XCircle, Timer, ShieldCheck, CalendarDays } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { MODULES } from './modules';
import { KpiCard } from './KpiCard';
import { resolveCompanyIds } from './companyScope';

interface PeriodCounts {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

function monthBounds(monthsAgo: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function countForPeriod(companyIds: string[], startIso: string, endIso: string): Promise<PeriodCounts> {
  const rows = await Promise.all(
    MODULES.map((m) =>
      supabase
        .from(m.table)
        .select('status', { count: 'exact' })
        .in('company_id', companyIds)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
    )
  );

  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let total = 0;
  rows.forEach((r) => {
    (r.data || []).forEach((row: any) => {
      total++;
      if (row.status === 'pending') pending++;
      else if (row.status === 'approved') approved++;
      else if (row.status === 'rejected') rejected++;
    });
  });
  return { pending, approved, rejected, total };
}

function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function KpiSection() {
  const { profile } = useAuth();
  const [current, setCurrent] = useState<PeriodCounts | null>(null);
  const [previous, setPrevious] = useState<PeriodCounts | null>(null);
  const [avgApprovalDays, setAvgApprovalDays] = useState<number | null>(null);
  const [avgApprovalDaysPrev, setAvgApprovalDaysPrev] = useState<number | null>(null);
  const [slaOnTrackPct, setSlaOnTrackPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) return;
    load();
  }, [profile?.company_id, profile?.id]);

  const load = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const companyIds = resolveCompanyIds(profile);
      const thisMonth = monthBounds(0);
      const lastMonth = monthBounds(1);

      const [curCounts, prevCounts] = await Promise.all([
        countForPeriod(companyIds, thisMonth.start, thisMonth.end),
        countForPeriod(companyIds, lastMonth.start, lastMonth.end),
      ]);
      setCurrent(curCounts);
      setPrevious(prevCounts);

      const [curAvg, prevAvg] = await Promise.all([
        averageApprovalDays(companyIds, thisMonth.start, thisMonth.end),
        averageApprovalDays(companyIds, lastMonth.start, lastMonth.end),
      ]);
      setAvgApprovalDays(curAvg);
      setAvgApprovalDaysPrev(prevAvg);

      if (profile?.id) {
        const { data: overdueData } = await supabase.rpc('get_overdue_pending_approvals');
        const pendingResults = await Promise.all(
          MODULES.map((m) =>
            supabase.rpc('get_my_pending_approval_ids', {
              p_request_type: m.requestType,
              p_user_id: profile.id,
            })
          )
        );
        const totalPending = pendingResults.reduce((sum, r) => sum + (r.data?.length || 0), 0);
        const overdueMine = ((overdueData || []) as { approver_id: string }[]).filter(
          (r) => r.approver_id === profile.id
        ).length;
        setSlaOnTrackPct(
          totalPending === 0 ? null : ((totalPending - overdueMine) / totalPending) * 100
        );
      }
    } catch (error) {
      console.error('Error loading KPI section:', error);
    } finally {
      setLoading(false);
    }
  };

  const averageApprovalDays = async (companyIds: string[], startIso: string, endIso: string): Promise<number | null> => {
    const diffsPerModule = await Promise.all(
      MODULES.map(async (m) => {
        const { data: approvedRequests } = await supabase
          .from(m.table)
          .select('id, created_at')
          .eq('status', 'approved')
          .in('company_id', companyIds)
          .gte('created_at', startIso)
          .lt('created_at', endIso);

        if (!approvedRequests || approvedRequests.length === 0) return [];

        const ids = approvedRequests.map((r: any) => r.id);
        const { data: ledgerRows } = await supabase
          .from('approval_ledger')
          .select('request_id, approval_date')
          .eq('request_type', m.requestType)
          .eq('action', 'Approved')
          .in('request_id', ids);

        const latestByRequest = new Map<string, string>();
        (ledgerRows || []).forEach((row: any) => {
          const existing = latestByRequest.get(row.request_id);
          if (!existing || row.approval_date > existing) {
            latestByRequest.set(row.request_id, row.approval_date);
          }
        });

        return approvedRequests
          .filter((r: any) => latestByRequest.has(r.id))
          .map((r: any) => {
            const created = new Date(r.created_at).getTime();
            const approved = new Date(latestByRequest.get(r.id) as string).getTime();
            return (approved - created) / (1000 * 60 * 60 * 24);
          });
      })
    );

    const allDiffs = diffsPerModule.flat();
    if (allDiffs.length === 0) return null;
    return allDiffs.reduce((a, b) => a + b, 0) / allDiffs.length;
  };

  const kpis = [
    {
      title: 'Pending Requests',
      value: current ? String(current.pending) : '–',
      trendPct: current && previous ? trendPct(current.pending, previous.pending) : null,
      trendDirectionGood: 'down' as const,
      icon: Clock,
    },
    {
      title: 'Approved Requests',
      value: current ? String(current.approved) : '–',
      trendPct: current && previous ? trendPct(current.approved, previous.approved) : null,
      trendDirectionGood: 'up' as const,
      icon: CheckCircle,
    },
    {
      title: 'Rejected Requests',
      value: current ? String(current.rejected) : '–',
      trendPct: current && previous ? trendPct(current.rejected, previous.rejected) : null,
      trendDirectionGood: 'down' as const,
      icon: XCircle,
    },
    {
      title: 'Avg. Approval Time',
      value: avgApprovalDays !== null ? `${avgApprovalDays.toFixed(1)}d` : '–',
      trendPct:
        avgApprovalDays !== null && avgApprovalDaysPrev !== null
          ? trendPct(avgApprovalDays, avgApprovalDaysPrev)
          : null,
      trendDirectionGood: 'down' as const,
      icon: Timer,
      estimated: true,
      estimateNote: 'From request creation to the latest recorded approval action',
    },
    {
      title: 'SLA On-Track',
      value: slaOnTrackPct !== null ? `${slaOnTrackPct.toFixed(0)}%` : '–',
      trendPct: null,
      trendDirectionGood: 'up' as const,
      icon: ShieldCheck,
      estimated: true,
      estimateNote: 'Share of your currently pending approvals still within their SLA target (not a historical rate)',
    },
    {
      title: 'Requests This Month',
      value: current ? String(current.total) : '–',
      trendPct: current && previous ? trendPct(current.total, previous.total) : null,
      trendDirectionGood: 'up' as const,
      icon: CalendarDays,
    },
  ];

  return (
    <div>
      <h2 className="text-sm sm:text-base font-semibold text-slate-900 mb-2 sm:mb-3">
        Key Metrics
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </div>
      {loading && <p className="text-xs text-slate-400 mt-2">Refreshing metrics…</p>}
    </div>
  );
}
