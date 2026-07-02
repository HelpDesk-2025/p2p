import { ViewType } from './Layout';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { ActionCenter } from './dashboard/ActionCenter';
import { KpiSection } from './dashboard/KpiSection';
import { ApprovalWorkload } from './dashboard/ApprovalWorkload';
import { MyRequestsPanel } from './dashboard/MyRequestsPanel';
import { RecentActivityFeed } from './dashboard/RecentActivityFeed';
import { CompactAnnouncements } from './dashboard/CompactAnnouncements';

interface DashboardProps {
  onViewChange?: (view: ViewType) => void;
}

export function Dashboard({ onViewChange }: DashboardProps) {
  return (
    <div className="flex flex-col gap-3 sm:gap-4 p-4 sm:p-0 pb-6">
      <DashboardHeader onViewChange={onViewChange} />

      <CompactAnnouncements />

      <ActionCenter onViewChange={onViewChange} />

      <KpiSection />

      <ApprovalWorkload onViewChange={onViewChange} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <div className="min-h-[320px] flex flex-col">
          <MyRequestsPanel onViewChange={onViewChange} />
        </div>
        <div className="min-h-[320px] flex flex-col">
          <RecentActivityFeed />
        </div>
      </div>
    </div>
  );
}
