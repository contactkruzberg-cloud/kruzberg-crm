'use client';

import { motion } from 'framer-motion';
import { TodayStrip } from '@/components/dashboard/today-strip';
import { KpiCards } from '@/components/dashboard/kpi-cards';
import { RelanceAlerts } from '@/components/dashboard/relance-alerts';
import { UpcomingConcerts } from '@/components/dashboard/upcoming-concerts';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { VenueMap } from '@/components/dashboard/venue-map';
import { WeeklySparklines } from '@/components/dashboard/weekly-sparklines';
import { PendingTasks } from '@/components/dashboard/pending-tasks';
import { NextTour } from '@/components/dashboard/next-tour';
import { ApplicationDeadlines } from '@/components/dashboard/application-deadlines';
import { CollapsibleSection } from '@/components/dashboard/collapsible-section';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

// Today at a glance, then what to do now, then the overview (foldable).
export default function DashboardPage() {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <h1 className="sr-only">Dashboard</h1>

      {/* Today at a glance */}
      <motion.div variants={item}>
        <TodayStrip />
      </motion.div>

      {/* To do now */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={item}>
          <RelanceAlerts />
        </motion.div>
        <motion.div variants={item} id="taches" className="scroll-mt-20">
          <PendingTasks />
        </motion.div>
      </div>

      {/* Festival / tremplin applications */}
      <motion.div variants={item}>
        <ApplicationDeadlines />
      </motion.div>

      {/* Pipeline overview */}
      <motion.div variants={item}>
        <CollapsibleSection id="kpis" title="Pipeline">
          <KpiCards />
        </CollapsibleSection>
      </motion.div>

      {/* Upcoming */}
      <motion.div variants={item}>
        <CollapsibleSection id="upcoming" title="Prochaines dates">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UpcomingConcerts />
            <NextTour />
          </div>
        </CollapsibleSection>
      </motion.div>

      <motion.div variants={item}>
        <CollapsibleSection id="activity" title="Activité récente">
          <ActivityFeed />
        </CollapsibleSection>
      </motion.div>

      <motion.div variants={item}>
        <CollapsibleSection id="map" title="Carte">
          <VenueMap />
        </CollapsibleSection>
      </motion.div>

      <motion.div variants={item}>
        <CollapsibleSection id="trends" title="Tendances">
          <WeeklySparklines />
        </CollapsibleSection>
      </motion.div>
    </motion.div>
  );
}
