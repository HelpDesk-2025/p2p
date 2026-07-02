import { motion } from 'framer-motion';
import { AlertCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface PriorityBreakdown {
  high: number;
  medium: number;
  low: number;
}

interface WorkloadCardProps {
  icon: any;
  label: string;
  total: number;
  overdue: number;
  priority: PriorityBreakdown;
  onClick?: () => void;
  delay?: number;
}

export function WorkloadCard({ icon: Icon, label, total, overdue, priority, onClick, delay = 0 }: WorkloadCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      className={cn(
        'text-left bg-slate-50 rounded-lg border border-slate-200 p-3',
        onClick ? 'cursor-pointer hover:bg-slate-100 hover:border-slate-300 transition' : 'cursor-default'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-slate-600 flex-shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-slate-800 truncate">{label}</span>
        </div>
        {overdue > 0 && (
          <span className="flex items-center gap-0.5 text-[11px] font-semibold text-red-700 flex-shrink-0">
            <AlertCircle className="w-3.5 h-3.5" />
            {overdue}
          </span>
        )}
      </div>
      <p className="text-xl font-bold text-slate-900 tabular-nums mt-1.5">{total}</p>
      <p className="text-[11px] text-slate-500">pending approval{total === 1 ? '' : 's'}</p>
      {total > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1 text-red-600">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {priority.high} High
          </span>
          <span className="flex items-center gap-1 text-amber-600">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            {priority.medium} Med
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            {priority.low} Low
          </span>
          <span title="Priority is estimated from request amount" className="ml-auto">
            <Info className="w-3 h-3 text-slate-400" />
          </span>
        </div>
      )}
    </motion.button>
  );
}
