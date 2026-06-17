'use client';

import Link from 'next/link';
import type { Tour, TourStop, TourExpense } from '@/types/database';
import { TOUR_STATUSES } from '@/types/database';
import { tourBudget, formatKm } from '@/lib/tour-math';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, MapPin, Route, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TourCardProps {
  tour: Tour;
  stops: TourStop[];
  expenses: TourExpense[];
}

function dateRange(tour: Tour, stops: TourStop[]): string {
  const dates = stops.map((s) => s.stop_date).filter(Boolean).sort();
  const start = tour.start_date || dates[0];
  const end = tour.end_date || dates[dates.length - 1];
  if (!start) return 'Dates à définir';
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  if (!end || start === end) return fmt(start);
  return `${fmt(start)} → ${fmt(end)}`;
}

export function TourCard({ tour, stops, expenses }: TourCardProps) {
  const status = TOUR_STATUSES.find((s) => s.key === tour.status);
  const budget = tourBudget(tour, stops, expenses);
  const showCount = stops.filter((s) => s.type === 'show').length;

  return (
    <Link href={`/tours/${tour.id}`}>
      <Card className="p-4 h-full hover:border-primary/50 hover:shadow-md transition-all cursor-pointer space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight">{tour.name}</h3>
          <Badge variant="outline" className={cn('text-[10px] shrink-0', status?.color)}>
            {status?.label}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          {dateRange(tour, stops)}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {showCount} date{showCount > 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Route className="h-3.5 w-3.5" />
            {formatKm(budget.km)}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {tour.members_count}
          </span>
        </div>

        <div className="flex items-baseline justify-between border-t pt-2">
          <span className="text-xs text-muted-foreground">Net estimé</span>
          <span
            className={cn(
              'text-sm font-bold',
              budget.net >= 0 ? 'text-green-500' : 'text-red-500'
            )}
          >
            {budget.net >= 0 ? '+' : ''}
            {Math.round(budget.net).toLocaleString('fr-FR')} €
          </span>
        </div>
      </Card>
    </Link>
  );
}
