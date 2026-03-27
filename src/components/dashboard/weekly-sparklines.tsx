'use client';

import { useActivities } from '@/hooks/use-activities';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip as RechartsTooltip } from 'recharts';
import { subDays, format, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';

export function WeeklySparklines() {
  const { data: activities, isLoading } = useActivities(200);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }

  // Build last 30 days data
  const now = new Date();
  const emailActivities = (activities || []).filter((a) => a.type === 'email_sent');
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = startOfDay(subDays(now, 29 - i));
    const count = emailActivities.filter((a) => {
      const aDate = startOfDay(new Date(a.created_at));
      return aDate.getTime() === date.getTime();
    }).length;
    return {
      date: format(date, 'dd/MM', { locale: fr }),
      emails: count,
    };
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Emails envoyés (30 derniers jours)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={days}>
              <defs>
                <linearGradient id="emailGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(162, 100%, 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(162, 100%, 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                interval="preserveStartEnd"
              />
              <RechartsTooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Area
                type="monotone"
                dataKey="emails"
                stroke="hsl(162, 100%, 45%)"
                fill="url(#emailGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
