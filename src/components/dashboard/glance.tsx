'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useDeals } from '@/hooks/use-deals';
import { useAllTourStops } from '@/hooks/use-tour-stops';
import { useTours } from '@/hooks/use-tours';
import { buildEvents } from '@/lib/calendar/events';
import { STAGES } from '@/types/database';

const today = () => new Date().toISOString().slice(0, 10);

function SectionTitle({ children, href, more }: { children: React.ReactNode; href?: string; more?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-display text-[20px] font-semibold">{children}</h2>
      {href && (
        <Link href={href} className="text-[13px] text-primary hover:underline">
          {more ?? 'Tout voir'}
        </Link>
      )}
    </div>
  );
}

/** The next concerts and tour days (confirmed only). */
export function NextDates() {
  const { data: deals } = useDeals();
  const { data: stops } = useAllTourStops();
  const { data: tours } = useTours();
  const next = useMemo(() => {
    const t = today();
    return buildEvents({ deals, stops, tours })
      .filter((e) => e.date >= t && (e.kind === 'concert' || (e.kind === 'tour' && !e.title.startsWith('Route') && e.title !== 'Jour off')))
      .slice(0, 5);
  }, [deals, stops, tours]);

  return (
    <section>
      <SectionTitle href="/calendrier" more="Calendrier">
        Prochaines dates
      </SectionTitle>
      <div className="mt-2 divide-y border-y">
        {next.length === 0 && <p className="py-4 text-[15px] text-muted-foreground">Aucune date confirmée.</p>}
        {next.map((e) => {
          const d = new Date(`${e.date}T12:00:00`);
          return (
            <Link key={e.id} href={e.href} className="-mx-3 flex items-center gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary">
              <span className="w-10 shrink-0 text-center leading-none">
                <span className="block text-[11px] font-semibold uppercase text-[hsl(var(--status-urgent))]">
                  {d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}
                </span>
                <span className="font-display nums block text-[22px] font-semibold">{d.getDate()}</span>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px]">{e.title}</span>
                <span className="block truncate text-[13px] text-muted-foreground">
                  {[d.toLocaleDateString('fr-FR', { weekday: 'long' }), e.sub, e.time && `set ${e.time}`].filter(Boolean).join(' · ')}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** Where the booking stands: three figures and the split by stage. */
export function PipelineGlance() {
  const { data: deals } = useDeals();
  const all = deals || [];
  const by = Object.fromEntries(STAGES.map((s) => [s.key, all.filter((d) => d.stage === s.key).length]));
  const written = all.length - by.a_contacter;
  const answered = by.repondu + by.a_suivre + by.confirme + by.termine + by.refuse;
  const won = by.confirme + by.termine;
  const waiting = by.contacte + by.relance;
  const figures = [
    { label: 'en attente', value: waiting },
    { label: 'réponses', value: written ? `${Math.round((answered / written) * 100)} %` : '—' },
    { label: won > 1 ? 'dates' : 'date', value: won },
  ];

  return (
    <section>
      <SectionTitle href="/pipeline" more="Pipeline">
        Booking
      </SectionTitle>
      <div className="mt-3 grid grid-cols-3 gap-4">
        {figures.map((f) => (
          <div key={f.label}>
            <div className="font-display nums text-[28px] font-semibold leading-none">{f.value}</div>
            <div className="mt-1 text-[13px] text-muted-foreground">{f.label}</div>
          </div>
        ))}
      </div>
      {all.length > 0 && (
        <div className="mt-4 flex h-1.5 gap-px overflow-hidden rounded-full" aria-label="Répartition par étape">
          {STAGES.filter((s) => by[s.key]).map((s) => (
            <div key={s.key} title={`${s.label} : ${by[s.key]}`} style={{ flexGrow: by[s.key], backgroundColor: `hsl(var(--${s.color}))` }} />
          ))}
        </div>
      )}
      <p className="mt-2 text-[13px] text-muted-foreground">
        {all.length} lieu{all.length > 1 ? 'x' : ''} dans le pipeline, dont {by.a_contacter} à contacter.
      </p>
    </section>
  );
}
