'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTours } from '@/hooks/use-tours';
import { useAllTourStops } from '@/hooks/use-tour-stops';
import { useAllTourExpenses } from '@/hooks/use-tour-expenses';
import { tourBudget, formatKm } from '@/lib/tour-math';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Route, CalendarDays, MapPin, ChevronRight } from 'lucide-react';
import { TOUR_STATUSES } from '@/types/database';
import { cn } from '@/lib/utils';

export function NextTour() {
  const { data: tours } = useTours();
  const { data: stops } = useAllTourStops();
  const { data: expenses } = useAllTourExpenses();

  const stopsByTour = useMemo(() => {
    const map = new Map<string, NonNullable<typeof stops>>();
    (stops || []).forEach((s) => {
      const arr = map.get(s.tour_id) || [];
      arr.push(s);
      map.set(s.tour_id, arr);
    });
    return map;
  }, [stops]);

  // Pick the soonest tour that isn't finished/cancelled and has an upcoming or
  // undated stop; fall back to the most recent active tour.
  const next = useMemo(() => {
    const active = (tours || []).filter((t) => t.status === 'brouillon' || t.status === 'confirmee');
    if (active.length === 0) return null;
    const today = new Date().toISOString().slice(0, 10);
    const withDate = active
      .map((t) => {
        const ts = stopsByTour.get(t.id) || [];
        const dates = ts.map((s) => s.stop_date).filter(Boolean).sort();
        const start = t.start_date || dates[0] || null;
        return { tour: t, start };
      })
      .sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999'));
    return withDate.find((x) => x.start && x.start >= today) || withDate[0];
  }, [tours, stopsByTour]);

  if (!next) return null;

  const { tour } = next;
  const tStops = stopsByTour.get(tour.id) || [];
  const tExpenses = (expenses || []).filter((e) => e.tour_id === tour.id);
  const budget = tourBudget(tour, tStops, tExpenses);
  const showCount = tStops.filter((s) => s.type === 'show').length;
  const status = TOUR_STATUSES.find((s) => s.key === tour.status);

  const dates = tStops.map((s) => s.stop_date).filter(Boolean).sort();
  const start = tour.start_date || dates[0];
  const end = tour.end_date || dates[dates.length - 1];
  const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const range = start ? `${fmt(start)}${end && end !== start ? ' → ' + fmt(end) : ''}` : 'Dates à définir';

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Route className="h-4 w-4 text-primary" />
          Prochaine tournée
        </h3>
        <Badge variant="outline" className={cn('text-[10px]', status?.color)}>
          {status?.label}
        </Badge>
      </div>

      <Link href={`/tours/${tour.id}`} className="block group">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium group-hover:text-primary transition-colors">{tour.name}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {range}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {showCount} date{showCount > 1 ? 's' : ''}
          </span>
          <span>{formatKm(budget.km)}</span>
        </div>
        <div className="flex items-baseline justify-between border-t mt-3 pt-2">
          <span className="text-xs text-muted-foreground">Net estimé</span>
          <span className={cn('text-sm font-bold', budget.net >= 0 ? 'text-green-500' : 'text-red-500')}>
            {budget.net >= 0 ? '+' : ''}
            {Math.round(budget.net).toLocaleString('fr-FR')} €
          </span>
        </div>
      </Link>
    </Card>
  );
}
