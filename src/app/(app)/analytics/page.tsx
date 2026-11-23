'use client';

import { motion } from 'framer-motion';
import { useDeals } from '@/hooks/use-deals';
import { useActivities } from '@/hooks/use-activities';
import { Skeleton } from '@/components/ui/skeleton';
import { STAGES, type DealStage, APPLE, STAGE_HEX } from '@/types/database';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  Cell,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { subWeeks, format, startOfWeek, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PageHeader } from '@/components/layout/page-header';

const STAGE_COLORS: Record<DealStage, string> = STAGE_HEX;

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function AnalyticsPage() {
  const { data: deals, isLoading: dealsLoading } = useDeals();
  const { data: activities, isLoading: activitiesLoading } = useActivities(500);
  const isLoading = dealsLoading || activitiesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  const allDeals = deals || [];
  const allActivities = activities || [];

  // Conversion funnel
  const funnelData = [
    { name: 'Contactés', value: allDeals.filter((d) => d.stage !== 'a_contacter').length, fill: '#5E5CE6' },
    { name: 'Répondu', value: allDeals.filter((d) => ['repondu', 'a_suivre', 'confirme'].includes(d.stage)).length, fill: '#FFD60A' },
    { name: 'Confirmés', value: allDeals.filter((d) => d.stage === 'confirme').length, fill: '#30D158' },
  ];

  // Response rate by venue type
  const venueTypes = ['bar', 'salle', 'festival', 'cafe_concert', 'mjc'];
  const responseByType = venueTypes.map((type) => {
    const typeDeals = allDeals.filter((d) => d.venue?.type === type);
    const responded = typeDeals.filter((d) => ['repondu', 'a_suivre', 'confirme'].includes(d.stage)).length;
    return {
      type: type === 'cafe_concert' ? 'Café' : type.charAt(0).toUpperCase() + type.slice(1),
      rate: typeDeals.length > 0 ? Math.round((responded / typeDeals.length) * 100) : 0,
      count: typeDeals.length,
    };
  });

  // Average days to confirmation
  const confirmedDeals = allDeals.filter((d) => d.stage === 'confirme' && d.first_contact_at);
  const avgDaysToConfirm =
    confirmedDeals.length > 0
      ? Math.round(
          confirmedDeals.reduce((acc, d) => {
            return acc + differenceInDays(new Date(d.updated_at), new Date(d.first_contact_at!));
          }, 0) / confirmedDeals.length
        )
      : 0;

  // Best cities
  const cityMap = new Map<string, { total: number; confirmed: number }>();
  allDeals.forEach((d) => {
    const city = d.venue?.city || 'Inconnu';
    const current = cityMap.get(city) || { total: 0, confirmed: 0 };
    current.total++;
    if (d.stage === 'confirme') current.confirmed++;
    cityMap.set(city, current);
  });
  const bestCities = Array.from(cityMap.entries())
    .map(([city, data]) => ({ city, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // Email volume per week (last 12 weeks)
  const emailActivities = allActivities.filter((a) => a.type === 'email_sent');
  const now = new Date();
  const weeklyEmails = Array.from({ length: 12 }, (_, i) => {
    const weekStart = startOfWeek(subWeeks(now, 11 - i), { weekStartsOn: 1 });
    const weekEnd = startOfWeek(subWeeks(now, 10 - i), { weekStartsOn: 1 });
    const count = emailActivities.filter((a) => {
      const d = new Date(a.created_at);
      return d >= weekStart && d < weekEnd;
    }).length;
    return {
      week: format(weekStart, 'dd MMM', { locale: fr }),
      emails: count,
    };
  });

  // Stage distribution
  const stageDistribution = STAGES.map((s) => ({
    name: s.label,
    count: allDeals.filter((d) => d.stage === s.key).length,
    fill: STAGE_COLORS[s.key],
  }));

  const chartTooltipStyle = {
    contentStyle: {
      background: 'hsl(var(--card))',
      border: '0.5px solid var(--line)',
      borderRadius: '8px',
      fontSize: '12px',
    },
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader icon={BarChart3} title="Analytics" />

      {/* Key figures */}
      <motion.div variants={item} className="grid grid-cols-2 gap-x-8 gap-y-5 border-y py-5 lg:grid-cols-4">
        {[
          { label: 'Opportunités', value: allDeals.length },
          {
            label: 'Taux de réponse',
            value: `${
              allDeals.length > 0
                ? Math.round((allDeals.filter((d) => ['repondu', 'a_suivre', 'confirme'].includes(d.stage)).length / allDeals.length) * 100)
                : 0
            } %`,
          },
          { label: 'Dates confirmées', value: allDeals.filter((d) => d.stage === 'confirme').length },
          { label: 'Délai moyen de confirmation', value: `${avgDaysToConfirm} j` },
        ].map((f) => (
          <div key={f.label}>
            <div className="font-display nums text-[32px] font-semibold leading-none">{f.value}</div>
            <div className="mt-1.5 text-[13px] text-muted-foreground">{f.label}</div>
          </div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
        {/* Conversion Funnel */}
        <motion.div variants={item}>
          <section>
            <h2 className="font-display text-[17px] font-semibold">Du contact à la date</h2>
            <div className="mt-3">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fill: '#8E8E93', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                      {funnelData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </motion.div>

        {/* Response by type */}
        <motion.div variants={item}>
          <section>
            <h2 className="font-display text-[17px] font-semibold">Taux de réponse par type de lieu</h2>
            <div className="mt-3">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={responseByType}>
                    <XAxis dataKey="type" tick={{ fill: '#8E8E93', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#8E8E93', fontSize: 11 }} unit="%" axisLine={false} tickLine={false} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="rate" fill={APPLE.blue} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </motion.div>

        {/* Best cities */}
        <motion.div variants={item}>
          <section>
            <h2 className="font-display text-[17px] font-semibold">Meilleures villes</h2>
            <div className="mt-3">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bestCities} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="city" width={80} tick={{ fill: '#8E8E93', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="total" fill={APPLE.indigo} radius={[0, 6, 6, 0]} name="Total" />
                    <Bar dataKey="confirmed" fill={APPLE.green} radius={[0, 6, 6, 0]} name="Confirmés" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </motion.div>

        {/* Email volume per week */}
        <motion.div variants={item}>
          <section>
            <h2 className="font-display text-[17px] font-semibold">Mails envoyés par semaine</h2>
            <div className="mt-3">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyEmails}>
                    <defs>
                      <linearGradient id="emailGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={APPLE.blue} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={APPLE.blue} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="week" tick={{ fill: '#8E8E93', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#8E8E93', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...chartTooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="emails"
                      stroke={APPLE.blue}
                      fill="url(#emailGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </motion.div>

        {/* Stage distribution */}
        <motion.div variants={item} className="lg:col-span-2">
          <section>
            <h2 className="font-display text-[17px] font-semibold">Opportunités par étape</h2>
            <div className="mt-3">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stageDistribution}>
                    <XAxis dataKey="name" tick={{ fill: '#8E8E93', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#8E8E93', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {stageDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </motion.div>
      </div>
    </motion.div>
  );
}
