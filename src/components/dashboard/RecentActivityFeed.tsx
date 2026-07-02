import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, ArrowLeft, FileText, Clock as ClockIcon, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { resolveCompanyIds } from './companyScope';
import { cn } from '../../lib/utils';

interface LedgerEntry {
  id: string;
  request_type: string;
  request_number: string;
  approver_name: string;
  action: string;
  approval_date: string;
  sequence: number;
}

const ACTION_STYLES: Record<string, { icon: any; wrap: string }> = {
  Approved: { icon: CheckCircle, wrap: 'bg-green-100 text-green-800' },
  Rejected: { icon: XCircle, wrap: 'bg-red-100 text-red-800' },
  Returned: { icon: ArrowLeft, wrap: 'bg-orange-100 text-orange-800' },
  Submitted: { icon: FileText, wrap: 'bg-blue-100 text-blue-800' },
};
const DEFAULT_STYLE = { icon: ClockIcon, wrap: 'bg-slate-100 text-slate-800' };

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function RecentActivityFeed() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) return;
    load();
  }, [profile?.company_id]);

  const load = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('approval_ledger')
        .select('id, request_type, request_number, approver_name, action, approval_date, sequence')
        .in('company_id', resolveCompanyIds(profile))
        .order('approval_date', { ascending: false })
        .limit(15);
      if (error) throw error;
      setEntries((data || []) as LedgerEntry[]);
    } catch (error) {
      console.error('Error loading recent activity:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 sm:mb-3 flex-shrink-0">
        <h2 className="text-sm sm:text-base font-semibold text-slate-900">Recent Activity</h2>
        {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
      </div>
      <div className="space-y-1 overflow-y-auto flex-1 min-h-0 pr-1">
        {!loading && entries.length === 0 && (
          <p className="text-xs text-slate-400 py-4 text-center">No recent activity yet</p>
        )}
        {entries.map((entry) => {
          const style = ACTION_STYLES[entry.action] || DEFAULT_STYLE;
          const Icon = style.icon;
          return (
            <div key={entry.id} className="flex items-start gap-2.5 px-1.5 py-2 rounded-lg hover:bg-slate-50">
              <div className={cn('p-1.5 rounded-full flex-shrink-0', style.wrap)}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-slate-700 truncate">
                  <span className="font-medium text-slate-900">{entry.approver_name}</span>{' '}
                  {entry.action.toLowerCase()}{' '}
                  <span className="font-medium text-slate-900">{entry.request_type}</span>{' '}
                  <span className="text-slate-500">{entry.request_number}</span>
                </p>
                <p className="text-[11px] text-slate-400">{getRelativeTime(entry.approval_date)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
