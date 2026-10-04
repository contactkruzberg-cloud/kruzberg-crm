'use client';

import { useDeals } from '@/hooks/use-deals';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getRelanceUrgency, daysUntil, dealLabel } from '@/lib/utils';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePipelineFilters } from '@/components/pipeline/pipeline-filters';
import Link from 'next/link';
import { DealQuickActions } from '@/components/pipeline/deal-quick-actions';

export function RelanceAlerts() {
  const { data: deals, isLoading } = useDeals();
  const router = useRouter();
  const [filters, setFilters] = usePipelineFilters();

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

  const allAlerts = (deals || [])
    .filter((d) => d.next_relance_at && getRelanceUrgency(d.next_relance_at) !== 'ok' && !['confirme', 'termine', 'refuse'].includes(d.stage))
    .sort((a, b) => {
      const dA = daysUntil(a.next_relance_at!);
      const dB = daysUntil(b.next_relance_at!);
      return dA - dB;
    })
    ;
  const alerts = allAlerts.slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          Relances à faire
        </CardTitle>
        {allAlerts.length > 0 && (
          <Badge variant="destructive">{allAlerts.length}</Badge>
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
                <div
                  key={deal.id}
                  className={`flex items-center justify-between gap-2 p-3 rounded-lg border transition-all hover:shadow-md ${
                    urgency === 'overdue'
                      ? 'border-red-500/30 bg-red-500/5 animate-pulse-urgent'
                      : 'border-orange-500/30 bg-orange-500/5 animate-pulse-warning'
                  }`}
                >
                  <Link href={`/pipeline?deal=${deal.id}`} className="min-w-0 flex-1 group">
                    <p className="font-medium text-sm truncate group-hover:text-primary">
                      {dealLabel(deal, 'Lieu inconnu')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {urgency === 'overdue'
                        ? `${Math.abs(days)}j de retard`
                        : days === 0
                        ? "Aujourd'hui"
                        : `Dans ${days}j`}
                    </p>
                  </Link>
                  <DealQuickActions deal={deal} />
                </div>
              );
            })}
            {allAlerts.length > alerts.length && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-1.5 text-xs text-muted-foreground"
                onClick={() => {
                  setFilters({ ...filters, due: true });
                  router.push('/pipeline');
                }}
              >
                Voir les {allAlerts.length} relances dans le pipeline <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
