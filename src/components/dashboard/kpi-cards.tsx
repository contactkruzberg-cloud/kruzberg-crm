'use client';

import { useDeals } from '@/hooks/use-deals';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Mail, CheckCircle, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

function AnimatedCounter({ target, duration = 1200 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return <span>{count}</span>;
}

export function KpiCards() {
  const { data: deals, isLoading } = useDeals();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const total = deals?.length || 0;
  const awaiting = deals?.filter((d) => ['contacte', 'relance'].includes(d.stage)).length || 0;
  const confirmed = deals?.filter((d) => d.stage === 'confirme').length || 0;
  const replied = deals?.filter((d) => d.stage === 'repondu').length || 0;
  const conversionRate = total > 0 ? Math.round((confirmed / total) * 100) : 0;

  const kpis = [
    { label: 'Lieux contactés', value: total, icon: Building2, color: 'text-blue-500' },
    { label: 'En attente', value: awaiting, icon: Mail, color: 'text-orange-500' },
    { label: 'Confirmés', value: confirmed, icon: CheckCircle, color: 'text-green-500' },
    { label: 'Conversion', value: conversionRate, icon: TrendingUp, color: 'text-primary', suffix: '%' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="relative overflow-hidden group">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="text-2xl lg:text-3xl font-bold mt-1">
                  <AnimatedCounter target={kpi.value} />
                  {kpi.suffix}
                </p>
              </div>
              <kpi.icon className={`h-8 w-8 ${kpi.color} opacity-60 group-hover:opacity-100 transition-opacity`} />
            </div>
          </CardContent>
          <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-current to-transparent ${kpi.color} opacity-30`} />
        </Card>
      ))}
    </div>
  );
}
