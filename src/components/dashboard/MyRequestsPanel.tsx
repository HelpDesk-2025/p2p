import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../lib/permissions';
import { ViewType } from '../Layout';
import { MODULES } from './modules';
import { cn } from '../../lib/utils';

type StatusKey = 'draft' | 'pending' | 'approved' | 'rejected' | 'returned_to_maker';

const STATUS_LABELS: Record<StatusKey, string> = {
  draft: 'Draft',
  pending: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  returned_to_maker: 'Returned',
};

const STATUS_STYLES: Record<StatusKey, string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending: 'bg-blue-50 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  returned_to_maker: 'bg-orange-100 text-orange-700',
};

interface ModuleStatusCounts {
  draft: number;
  pending: number;
  approved: number;
  rejected: number;
  returned_to_maker: number;
}

interface MyRequestsPanelProps {
  onViewChange?: (view: ViewType) => void;
}

export function MyRequestsPanel({ onViewChange }: MyRequestsPanelProps) {
  const { profile, permissions } = useAuth();
  const [counts, setCounts] = useState<Record<string, ModuleStatusCounts>>({});
  const [loading, setLoading] = useState(true);

  const visibleModules = MODULES.filter((m) => hasPermission(permissions, m.requestPermission));

  useEffect(() => {
    if (!profile?.id) return;
    load();
  }, [profile?.id]);

  const load = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const results = await Promise.all(
        visibleModules.map(async (m) => {
          const { data } = await supabase
            .from(m.table)
            .select('status')
            .eq(m.requesterColumn, profile.id);

          const c: ModuleStatusCounts = { draft: 0, pending: 0, approved: 0, rejected: 0, returned_to_maker: 0 };
          (data || []).forEach((row: any) => {
            if (row.status in c) c[row.status as StatusKey]++;
          });
          return [m.key, c] as const;
        })
      );
      setCounts(Object.fromEntries(results));
    } catch (error) {
      console.error('Error loading my requests:', error);
    } finally {
      setLoading(false);
    }
  };

  if (visibleModules.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 sm:mb-3 flex-shrink-0">
        <h2 className="text-sm sm:text-base font-semibold text-slate-900">My Requests</h2>
        {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
      </div>
      <div className="space-y-1.5 sm:space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
        {visibleModules.map((m) => {
          const c = counts[m.key] || { draft: 0, pending: 0, approved: 0, rejected: 0, returned_to_maker: 0 };
          const total = c.draft + c.pending + c.approved + c.rejected + c.returned_to_maker;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onViewChange?.(m.requestView)}
              className="w-full text-left px-2.5 py-2 sm:px-3 sm:py-2.5 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <m.icon className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium text-slate-700 truncate">{m.label}</span>
                </div>
                <span className="text-sm sm:text-base font-semibold text-slate-900 tabular-nums flex-shrink-0">
                  {total}
                </span>
              </div>
              {total > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(Object.keys(STATUS_LABELS) as StatusKey[])
                    .filter((s) => c[s] > 0)
                    .map((s) => (
                      <span
                        key={s}
                        className={cn(
                          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                          STATUS_STYLES[s]
                        )}
                      >
                        {STATUS_LABELS[s]} {c[s]}
                      </span>
                    ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
