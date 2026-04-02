'use client';

import { motion } from 'framer-motion';
import { KpiCards } from '@/components/dashboard/kpi-cards';
import { RelanceAlerts } from '@/components/dashboard/relance-alerts';
import { UpcomingConcerts } from '@/components/dashboard/upcoming-concerts';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { VenueMap } from '@/components/dashboard/venue-map';
import { WeeklySparklines } from '@/components/dashboard/weekly-sparklines';
import { PendingTasks } from '@/components/dashboard/pending-tasks';

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

export default function DashboardPage() {
  const now = new Date();
  const greeting =
    now.getHours() < 12 ? 'Bonjour' : now.getHours() < 18 ? 'Bon après-midi' : 'Bonsoir';
  const dateStr = now.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Hero */}
      <motion.div variants={item} className="gradient-hero rounded-2xl p-6 lg:p-8">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
          {greeting}, <span className="text-primary">KRUZBERG</span>
        </h1>
        <p className="text-muted-foreground mt-1 capitalize">{dateStr}</p>
      </motion.div>

      {/* KPIs */}
      <motion.div variants={item}>
        <KpiCards />
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={item}>
        <QuickActions />
      </motion.div>

      {/* Alerts + Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={item}>
          <RelanceAlerts />
        </motion.div>
        <motion.div variants={item}>
          <PendingTasks />
        </motion.div>
      </div>

      {/* Concerts + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={item}>
          <UpcomingConcerts />
        </motion.div>
        <motion.div variants={item}>
          <ActivityFeed />
        </motion.div>
      </div>

      {/* Map */}
      <motion.div variants={item}>
        <VenueMap />
      </motion.div>

      {/* Sparklines */}
      <motion.div variants={item}>
        <WeeklySparklines />
      </motion.div>
    </motion.div>
  );
}
