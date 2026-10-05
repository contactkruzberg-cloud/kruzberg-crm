'use client';

import { useEffect, useRef } from 'react';
import { Archive, Briefcase, CopyCheck, FileText, Globe, Kanban, Layers, ListTodo, MapPin, Mic2, Newspaper, Tent, Trophy, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TabId } from '@/lib/radar/logic';

// Radar views, grouped: what to do now, leads by type, follow-up.
// Sticky side menu on desktop, sticky scrollable chips on mobile.

export interface NavItem {
  id: TabId;
  label: string;
  short: string;
  icon: LucideIcon;
  hint: string;
}
export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Travail',
    items: [
      { id: 'todo', label: 'À faire', short: 'À faire', icon: ListTodo, hint: 'Ce qui demande une action maintenant, le plus urgent en premier.' },
      { id: 'all', label: 'Toutes les pistes', short: 'Toutes', icon: Layers, hint: 'Toutes les pistes actives, tous types confondus.' },
    ],
  },
  {
    title: 'Par type',
    items: [
      { id: 'booking_fr', label: 'Booking France', short: 'Booking FR', icon: MapPin, hint: 'Salles, bars et assos en France. Les lieux déjà dans le CRM ou déjà écrits sont masqués.' },
      { id: 'booking_eu', label: 'Booking Europe', short: 'Booking EU', icon: Globe, hint: 'Salles et assos hors de France. Les lieux déjà dans le CRM ou déjà écrits sont masqués.' },
      { id: 'support', label: 'Premières parties', short: '1res parties', icon: Mic2, hint: 'Concerts de groupes proches où demander la première partie.' },
      { id: 'festivals', label: 'Festivals', short: 'Festivals', icon: Tent, hint: 'Festivals à démarcher ou à qui candidater.' },
      { id: 'tremplins', label: 'Tremplins & concours', short: 'Tremplins', icon: Trophy, hint: 'Tremplins et concours, avec leur date limite de candidature.' },
      { id: 'pros', label: 'Labels · bookers', short: 'Pros', icon: Briefcase, hint: 'Labels, bookers, tourneurs et promoteurs.' },
      { id: 'presse', label: 'Presse', short: 'Presse', icon: Newspaper, hint: 'Médias, webzines, radios et blogs.' },
    ],
  },
  {
    title: 'Suivi',
    items: [
      { id: 'drafts', label: 'Brouillons', short: 'Brouillons', icon: FileText, hint: 'Mails préparés : envoie-les puis marque-les « contacté ».' },
      { id: 'crm', label: 'Dans le pipeline', short: 'Pipeline', icon: Kanban, hint: 'Pistes passées au pipeline : la suite se gère dans le pipeline.' },
      { id: 'known', label: 'Déjà connues', short: 'Déjà connues', icon: CopyCheck, hint: 'Pistes booking masquées car déjà dans le CRM ou déjà écrites depuis booking@.' },
      { id: 'trash', label: 'Archives', short: 'Archives', icon: Archive, hint: 'Pistes écartées ou périmées. Restaurables.' },
    ],
  },
];
export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

interface Props {
  tab: TabId;
  counts: Record<string, number>;
  fresh: Record<string, number>;
  onSelect: (id: TabId) => void;
}

function Count({ id, n, active }: { id: TabId; n: number; active: boolean }) {
  if (id === 'todo' && n > 0) return <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-semibold tabular-nums text-white">{n}</span>;
  return <span className={cn('text-xs tabular-nums', active ? 'text-primary' : 'text-muted-foreground')}>{n}</span>;
}

export function RadarNav({ tab, counts, fresh, onSelect }: Props) {
  return (
    <nav aria-label="Vues du radar" className="sticky top-[4.5rem] hidden w-56 shrink-0 self-start space-y-4 lg:block">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <h3 className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.title}</h3>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = tab === it.id;
              const n = counts[it.id] ?? 0;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    title={it.hint}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onSelect(it.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                      active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      !n && !active && 'opacity-60',
                    )}
                  >
                    <it.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{it.label}</span>
                    {fresh[it.id] > 0 && <span className="rounded bg-primary px-1 text-[10px] font-semibold text-primary-foreground">+{fresh[it.id]}</span>}
                    <Count id={it.id} n={n} active={active} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function RadarNavMobile({ tab, counts, fresh, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [tab]);
  return (
    <div ref={ref} className="sticky top-14 z-20 -mx-3 flex gap-1.5 overflow-x-auto border-b bg-background/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4 lg:hidden">
      {NAV_GROUPS.map((g, gi) => (
        <div key={g.title} className="flex shrink-0 items-center gap-1.5">
          {gi > 0 && <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />}
          {g.items.map((it) => {
            const active = tab === it.id;
            return (
              <button
                key={it.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelect(it.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground',
                )}
              >
                <it.icon className="h-3.5 w-3.5" />
                {it.short}
                {it.id === 'todo' && (counts.todo ?? 0) > 0 && !active ? (
                  <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{counts.todo}</span>
                ) : (
                  <span className={cn('tabular-nums', active ? 'opacity-80' : 'opacity-70')}>{counts[it.id] ?? 0}</span>
                )}
                {fresh[it.id] > 0 && !active && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label={`${fresh[it.id]} nouvelles`} />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
