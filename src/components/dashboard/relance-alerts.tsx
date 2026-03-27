'use client';

import { useDeals } from '@/hooks/use-deals';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getRelanceUrgency, daysUntil } from '@/lib/utils';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function RelanceAlerts() {
  const { data: deals, isLoading } = useDeals();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const alerts = (deals || [])
    .filter((d) => d.next_relance_at && getRelanceUrgency(d.next_relance_at) !== 'ok' && !['confirme', 'refuse'].includes(d.stage))
    .sort((a, b) => {
      const dA = daysUntil(a.next_relance_at!);
      const dB = daysUntil(b.next_relance_at!);
      return dA - dB;
    })
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          Relances à faire
        </CardTitle>
        {alerts.length > 0 && (
          <Badge variant="destructive">{alerts.length}</Badge>
        )}
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucune relance urgente</p>
            <p className="text-xs mt-1">Tout est sous contrôle !</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((deal) => {
              const urgency = getRelanceUrgency(deal.next_relance_at);
              const days = daysUntil(deal.next_relance_at!);
              return (
                <Link
                  key={deal.id}
                  href={`/pipeline?deal=${deal.id}`}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all hover:shadow-md ${
                    urgency === 'overdue'
                      ? 'border-red-500/30 bg-red-500/5 animate-pulse-urgent'
                      : 'border-orange-500/30 bg-orange-500/5 animate-pulse-warning'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {deal.venue?.name || 'Lieu inconnu'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {urgency === 'overdue'
                        ? `${Math.abs(days)}j de retard`
                        : days === 0
                        ? "Aujourd'hui"
                        : `Dans ${days}j`}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
