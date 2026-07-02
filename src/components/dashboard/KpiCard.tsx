import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

interface KpiCardProps {
  title: string;
  value: string;
  trendPct: number | null; // null = no comparison available
  trendDirectionGood: 'up' | 'down'; // whether an upward trend is a good thing for this KPI
  icon: any;
  estimated?: boolean;
  estimateNote?: string;
}

export function KpiCard({ title, value, trendPct, trendDirectionGood, icon: Icon, estimated, estimateNote }: KpiCardProps) {
  const hasTrend = trendPct !== null && Number.isFinite(trendPct);
  const isFlat = hasTrend && Math.abs(trendPct as number) < 0.5;
  const isUp = hasTrend && (trendPct as number) > 0;
  const isGood = hasTrend && !isFlat && (isUp ? trendDirectionGood === 'up' : trendDirectionGood === 'down');

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="relative bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold-400" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-[11px] sm:text-xs font-medium text-slate-600 truncate">{title}</p>
            {estimated && (
              <span title={estimateNote || 'Estimated'} className="flex-shrink-0">
                <Info className="w-3 h-3 text-slate-400" />
              </span>
            )}
          </div>
          <p className="text-lg sm:text-2xl font-bold text-slate-900 leading-tight tabular-nums mt-0.5">
            {value}
          </p>
        </div>
        <div className="p-1.5 sm:p-2 rounded-lg flex-shrink-0 bg-blue-50 text-blue-700">
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs">
        {!hasTrend && <span className="text-slate-400">No prior-period data</span>}
        {hasTrend && isFlat && (
          <>
            <Minus className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500">Flat vs. last period</span>
          </>
        )}
        {hasTrend && !isFlat && (
          <>
            {isUp ? (
              <TrendingUp className={cn('w-3.5 h-3.5', isGood ? 'text-green-600' : 'text-red-600')} />
            ) : (
              <TrendingDown className={cn('w-3.5 h-3.5', isGood ? 'text-green-600' : 'text-red-600')} />
            )}
            <span className={cn('font-medium tabular-nums', isGood ? 'text-green-700' : 'text-red-700')}>
              {Math.abs(trendPct as number).toFixed(0)}%
            </span>
            <span className="text-slate-500">vs. last period</span>
          </>
        )}
      </div>
    </motion.div>
  );
}
