import { AlertOctagon, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export type Severity = 'critical' | 'attention' | 'information' | 'completed';

const SEVERITY_STYLES: Record<Severity, { wrap: string; iconWrap: string; icon: any; label: string }> = {
  critical: {
    wrap: 'bg-red-50 border-red-200',
    iconWrap: 'bg-red-100 text-red-700',
    icon: AlertOctagon,
    label: 'Critical',
  },
  attention: {
    wrap: 'bg-orange-50 border-orange-200',
    iconWrap: 'bg-orange-100 text-orange-700',
    icon: AlertTriangle,
    label: 'Attention',
  },
  information: {
    wrap: 'bg-blue-50 border-blue-200',
    iconWrap: 'bg-blue-100 text-blue-700',
    icon: Info,
    label: 'Information',
  },
  completed: {
    wrap: 'bg-green-50 border-green-200',
    iconWrap: 'bg-green-100 text-green-700',
    icon: CheckCircle2,
    label: 'Completed',
  },
};

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const style = SEVERITY_STYLES[severity];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium',
        style.wrap,
        style.iconWrap.split(' ')[1],
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {style.label}
    </span>
  );
}

export { SEVERITY_STYLES };
