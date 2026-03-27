'use client';

import { motion } from 'framer-motion';
import { useDeals } from '@/hooks/use-deals';
import { useActivities } from '@/hooks/use-activities';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { STAGES, type DealStage } from '@/types/database';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  FunnelChart,
  Funnel,
  LabelList,
  Cell,
} from 'recharts';
import { BarChart3, TrendingUp, Target, MapPin, Calendar, PieChart as PieIcon } from 'lucide-react';
import { subWeeks, format, startOfWeek, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';

const STAGE_COLORS: Record<DealStage, string> = {
  a_contacter: '#3b82f6',
  contacte: '#8b5cf6',
  relance: '#f97316',
  repondu: '#eab308',
  confirme: '#22c55e',
  refuse: '#ef4444',
};

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
    { name: 'Contactés', value: allDeals.filter((d) => d.stage !== 'a_contacter').length, fill: '#8b5cf6' },
    { name: 'Répondu', value: allDeals.filter((d) => ['repondu', 'confirme'].includes(d.stage)).length, fill: '#eab308' },
    { name: 'Confirmés', value: allDeals.filter((d) => d.stage === 'confirme').length, fill: '#22c55e' },
  ];

  // Response rate by venue type
  const venueTypes = ['bar', 'salle', 'festival', 'cafe_concert', 'mjc'];
  const responseByType = venueTypes.map((type) => {
    const typeDeals = allDeals.filter((d) => d.venue?.type === type);
    const responded = typeDeals.filter((d) => ['repondu', 'confirme'].includes(d.stage)).length;
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
      border: '1px solid hsl(var(--border))',
      borderRadius: '8px',
      fontSize: '12px',
    },
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <h1 className="text-xl font-bold">Analytics</h1>

      {/* Top KPIs */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total deals</p>
          <p className="text-2xl font-bold">{allDeals.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Taux de réponse</p>
          <p className="text-2xl font-bold">
            {allDeals.length > 0
              ? Math.round(
                  (allDeals.filter((d) => ['repondu', 'confirme'].includes(d.stage)).length /
                    allDeals.length) *
                    100
                )
              : 0}
            %
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Confirmés</p>
          <p className="text-2xl font-bold text-green-500">
            {allDeals.filter((d) => d.stage === 'confirme').length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Jours moy. confirmation</p>
          <p className="text-2xl font-bold">{avgDaysToConfirm}j</p>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Entonnoir de conversion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                      {funnelData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Response by type */}
        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Taux de réponse par type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={responseByType}>
                    <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="rate" fill="hsl(162, 100%, 45%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Best cities */}
        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Meilleures villes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bestCities} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="city" width={80} tick={{ fontSize: 11 }} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="total" fill="#8b5cf6" radius={[0, 6, 6, 0]} name="Total" />
                    <Bar dataKey="confirmed" fill="#22c55e" radius={[0, 6, 6, 0]} name="Confirmés" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Email volume per week */}
        <motion.div variants={item}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Emails par semaine (12 semaines)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyEmails}>
                    <defs>
                      <linearGradient id="emailGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(162, 100%, 45%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(162, 100%, 45%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip {...chartTooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="emails"
                      stroke="hsl(162, 100%, 45%)"
                      fill="url(#emailGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stage distribution */}
        <motion.div variants={item} className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <PieIcon className="h-4 w-4" />
                Distribution par stage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stageDistribution}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {stageDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
