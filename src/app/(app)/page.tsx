'use client';

import { motion } from 'framer-motion';
import { KpiCards } from '@/components/dashboard/kpi-cards';
import { RelanceAlerts } from '@/components/dashboard/relance-alerts';
import { UpcomingConcerts } from '@/components/dashboard/upcoming-concerts';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { VenueMap } from '@/components/dashboard/venue-map';
import { WeeklySparklines } from '@/components/dashboard/weekly-sparklines';
import { PendingTasks } from '@/components/dashboard/pending-tasks';
import { NextTour } from '@/components/dashboard/next-tour';
import { BriefingCard } from '@/components/dashboard/briefing-card';
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

// Action first (what to do this week), then the overview, which can be folded.
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
      <motion.div variants={item} className="gradient-hero rounded-2xl p-5 lg:p-6">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
          {greeting}, <span className="text-primary">KRUZBERG</span>
        </h1>
        <p className="text-muted-foreground mt-1 capitalize">{dateStr}</p>
      </motion.div>

      {/* Weekly briefing by Claude */}
      <motion.div variants={item}>
        <BriefingCard />
      </motion.div>

      {/* To do now */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={item}>
          <RelanceAlerts />
        </motion.div>
        <motion.div variants={item}>
          <PendingTasks />
        </motion.div>
      </div>

      {/* Festival / tremplin applications */}
      <motion.div variants={item}>
        <ApplicationDeadlines />
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

      {/* Overview */}
      <motion.div variants={item}>
        <CollapsibleSection id="kpis" title="Chiffres clés">
          <KpiCards />
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
