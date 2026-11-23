'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { useDeals } from '@/hooks/use-deals';
import { useAllTourStops } from '@/hooks/use-tour-stops';
import { useTours } from '@/hooks/use-tours';
import { useVenues } from '@/hooks/use-venues';
import { usePersistentState } from '@/lib/persistent-state';
import { buildEvents, CAL_KINDS, type CalEvent, type CalKind } from '@/lib/calendar/events';
import { cn } from '@/lib/utils';
import { SubscribeButton } from './subscribe-button';

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const dot = (k: CalKind) => CAL_KINDS.find((c) => c.key === k)!.dot;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The 6 weeks (Monday first) shown for a month. */
function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function EventChip({ e }: { e: CalEvent }) {
  return (
    <Link
      href={e.href}
      title={[e.title, e.sub, e.time && `set ${e.time}`].filter(Boolean).join(' · ')}
      className={cn(
        'flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] leading-tight hover:brightness-125',
        e.kind === 'concert' || e.kind === 'tour' ? 'font-medium text-foreground' : 'text-muted-foreground',
      )}
      style={{ backgroundColor: `color-mix(in srgb, ${dot(e.kind)} 18%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot(e.kind) }} />
      {e.time && <span className="tabular-nums">{e.time}</span>}
      <span className="truncate">{e.title}</span>
    </Link>
  );
}

/** Concerts, options, tour days and application windows, month by month. */
export function CalendarView() {
  const deals = useDeals();
  const stops = useAllTourStops();
  const tours = useTours();
  const venues = useVenues();
  const today = iso(new Date());
  const [cursor, setCursor] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [hidden, setHidden] = usePersistentState<CalKind[]>('cal:hidden', ['opening']);

  const events = useMemo(
    () => buildEvents({ deals: deals.data, stops: stops.data, tours: tours.data, venues: venues.data }),
    [deals.data, stops.data, tours.data, venues.data],
  );
  const shown = events.filter((e) => !hidden.includes(e.kind));
  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of shown) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [shown]);

  const days = monthGrid(cursor.y, cursor.m);
  const monthKey = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`;
  const monthEvents = shown.filter((e) => e.date.startsWith(monthKey));
  const title = new Date(cursor.y, cursor.m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const move = (n: number) => setCursor(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));
  const upcoming = shown.filter((e) => e.date >= today && (e.kind === 'concert' || e.kind === 'tour'));

  const loading = deals.isLoading || stops.isLoading || tours.isLoading || venues.isLoading;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={CalendarDays}
        title="Calendrier"
        description={
          upcoming.length
            ? `Prochain concert : ${upcoming[0].title}, le ${new Date(`${upcoming[0].date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}.`
            : 'Concerts, options, tournées et candidatures sur une seule vue.'
        }
        actions={<SubscribeButton />}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => move(-1)} title="Mois précédent">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => move(1)} title="Mois suivant">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="ml-2 text-lg font-semibold capitalize">{title}</h2>
          <Button variant="ghost" size="sm" className="ml-1 h-8 text-xs" onClick={() => setCursor({ y: new Date().getFullYear(), m: new Date().getMonth() })}>
            Aujourd’hui
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CAL_KINDS.map((k) => {
            const on = !hidden.includes(k.key);
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => setHidden(on ? [...hidden, k.key] : hidden.filter((h) => h !== k.key))}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-opacity',
                  on ? 'border-border bg-card text-foreground' : 'border-dashed text-muted-foreground opacity-60',
                )}
                aria-pressed={on}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: k.dot }} />
                {k.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[560px] rounded-xl" />
      ) : (
        <>
          {/* Month grid (desktop / tablet) */}
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <div className="grid grid-cols-7 border-b bg-muted/40">
              {WEEKDAYS.map((w) => (
                <div key={w} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d, i) => {
                const key = iso(d);
                const list = byDay.get(key) ?? [];
                const inMonth = d.getMonth() === cursor.m;
                return (
                  <div
                    key={key}
                    className={cn(
                      'min-h-[104px] space-y-1 border-b border-r p-1.5',
                      i % 7 === 6 && 'border-r-0',
                      i >= 35 && 'border-b-0',
                      !inMonth && 'bg-muted/20',
                      (i % 7 === 5 || i % 7 === 6) && inMonth && 'bg-muted/10',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums',
                        key === today ? 'bg-primary font-semibold text-primary-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground/50',
                      )}
                    >
                      {d.getDate()}
                    </div>
                    {list.slice(0, 3).map((e) => (
                      <EventChip key={e.id} e={e} />
                    ))}
                    {list.length > 3 && <p className="px-1.5 text-[11px] text-muted-foreground">+{list.length - 3} autre{list.length > 4 ? 's' : ''}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agenda list (mobile, and a recap under the grid) */}
          <div className="space-y-2 md:hidden">
            {!monthEvents.length && <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">Rien ce mois-ci.</p>}
            {monthEvents.map((e) => (
              <Link key={e.id} href={e.href} className={cn('flex items-center gap-3 rounded-lg border bg-card p-3', e.date < today && 'opacity-60')}>
                <div className="w-10 shrink-0 text-center">
                  <div className="text-lg font-bold leading-none tabular-nums">{Number(e.date.slice(8))}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">
                    {new Date(`${e.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' })}
                  </div>
                </div>
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: dot(e.kind) }} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {e.title}
                    {e.time && <span className="ml-1.5 text-xs font-normal text-muted-foreground">set {e.time}</span>}
                  </p>
                  {e.sub && <p className="truncate text-xs text-muted-foreground">{e.sub}</p>}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
