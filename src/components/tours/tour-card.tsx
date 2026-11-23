'use client';

import Link from 'next/link';
import type { Tour, TourStop, TourExpense } from '@/types/database';
import { TOUR_STATUSES } from '@/types/database';
import { tourBudget, formatKm } from '@/lib/tour-math';
import { ChevronRight } from 'lucide-react';
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
    <Link href={`/tours/${tour.id}`} className="-mx-3 flex items-center gap-4 rounded-lg px-3 py-3.5 transition-colors hover:bg-secondary">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[16px] font-semibold">{tour.name}</span>
          <span className="shrink-0 text-[13px] text-muted-foreground">{status?.label}</span>
        </div>
        <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {[dateRange(tour, stops), `${showCount} date${showCount > 1 ? 's' : ''}`, formatKm(budget.km), `${tour.members_count} pers.`].join(' · ')}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={cn('nums text-[15px] font-semibold', budget.net >= 0 ? 'text-[hsl(var(--status-success))]' : 'text-[hsl(var(--status-urgent))]')}>
          {budget.net >= 0 ? '+' : ''}
          {Math.round(budget.net).toLocaleString('fr-FR')} €
        </div>
        <div className="text-[12px] text-muted-foreground">net estimé</div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    </Link>
  );
}
