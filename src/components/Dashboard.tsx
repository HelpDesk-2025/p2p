import { motion, type Variants } from 'framer-motion';
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

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

export function Dashboard({ onViewChange }: DashboardProps) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-3 sm:gap-4 p-4 sm:p-0 pb-6"
    >
      <motion.div variants={item}>
        <DashboardHeader onViewChange={onViewChange} />
      </motion.div>

      <motion.div variants={item}>
        <CompactAnnouncements />
      </motion.div>

      <motion.div variants={item}>
        <ActionCenter onViewChange={onViewChange} />
      </motion.div>

      <motion.div variants={item}>
        <KpiSection />
      </motion.div>

      <motion.div variants={item}>
        <ApprovalWorkload onViewChange={onViewChange} />
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <div className="min-h-[320px] flex flex-col">
          <MyRequestsPanel onViewChange={onViewChange} />
        </div>
        <div className="min-h-[320px] flex flex-col">
          <RecentActivityFeed />
        </div>
      </motion.div>
    </motion.div>
  );
}
