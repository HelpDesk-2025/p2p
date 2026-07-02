import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../lib/permissions';
import { ViewType } from '../Layout';
import { MODULES } from './modules';
import { WorkloadCard, PriorityBreakdown } from './WorkloadCard';

interface ModuleWorkload {
  total: number;
  overdue: number;
  priority: PriorityBreakdown;
}

interface ApprovalWorkloadProps {
  onViewChange?: (view: ViewType) => void;
}

export function ApprovalWorkload({ onViewChange }: ApprovalWorkloadProps) {
  const { profile, permissions } = useAuth();
  const [workload, setWorkload] = useState<Record<string, ModuleWorkload>>({});
  const [loading, setLoading] = useState(true);

  const visibleModules = MODULES.filter((m) => hasPermission(permissions, m.approvalPermission));

  useEffect(() => {
    if (!profile?.id || visibleModules.length === 0) {
      setLoading(false);
      return;
    }
    load();
  }, [profile?.id, permissions?.permissions.length]);

  const load = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data: companyRow } = profile.company_id
        ? await supabase.from('companies').select('president_min_amount').eq('id', profile.company_id).maybeSingle()
        : { data: null };
      const highThreshold = Number(companyRow?.president_min_amount) || 0;
      const mediumThreshold = highThreshold > 0 ? highThreshold * 0.5 : 50000;

      const { data: overdueData } = await supabase.rpc('get_overdue_pending_approvals');
      const myOverdue = ((overdueData || []) as { approver_id: string; request_type: string }[]).filter(
        (r) => r.approver_id === profile.id
      );

      const results = await Promise.all(
        visibleModules.map(async (m) => {
          const { data: idRows } = await supabase.rpc('get_my_pending_approval_ids', {
            p_request_type: m.requestType,
            p_user_id: profile.id,
          });
          const ids: string[] = (idRows || []).map((r: { request_id: string }) => r.request_id);
          const overdue = myOverdue.filter((r) => r.request_type === m.requestType).length;

          const priority: PriorityBreakdown = { high: 0, medium: 0, low: 0 };
          if (ids.length > 0) {
            const { data: amountRows } = await supabase
              .from(m.table)
              .select(`id, ${m.amountColumn}`)
              .in('id', ids);
            (amountRows || []).forEach((row: any) => {
              const amt = Number(row[m.amountColumn]) || 0;
              if (amt >= highThreshold && highThreshold > 0) priority.high++;
              else if (amt >= mediumThreshold) priority.medium++;
              else priority.low++;
            });
          }

          return [m.key, { total: ids.length, overdue, priority }] as const;
        })
      );

      setWorkload(Object.fromEntries(results));
    } catch (error) {
      console.error('Error loading approval workload:', error);
    } finally {
      setLoading(false);
    }
  };

  if (visibleModules.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm sm:text-base font-semibold text-slate-900">Approval Workload</h2>
          <p className="text-xs text-slate-500">Your pending load by module</p>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        {visibleModules.map((m, i) => {
          const w = workload[m.key] || { total: 0, overdue: 0, priority: { high: 0, medium: 0, low: 0 } };
          return (
            <WorkloadCard
              key={m.key}
              icon={m.icon}
              label={m.label}
              total={w.total}
              overdue={w.overdue}
              priority={w.priority}
              delay={i * 0.04}
              onClick={() => onViewChange?.(m.approvalView)}
            />
          );
        })}
      </div>
    </div>
  );
}
