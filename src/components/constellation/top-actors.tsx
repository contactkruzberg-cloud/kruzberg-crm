'use client';

import { useMemo, useState } from 'react';
import { MapPin, Trophy } from 'lucide-react';
import { KIND_COLOR, KIND_PLURAL, type Entity, type EntityKind } from '@/lib/constellation/types';
import { cn } from './ui';
import type { State } from './use-constellation';

// Le cœur de l'outil : pour chaque type d'acteur, les noms qui reviennent chez
// le plus de groupes de la niche (la « règle de Francis »), lisibles d'un coup d'œil.
const CARDS: EntityKind[] = ['tourneur', 'label', 'salle', 'festival', 'dispositif', 'organisateur', 'tete_affiche', 'media'];
const PER_CARD = 5;

type Zone = 'all' | 'france' | 'abroad';
const ZONES: { id: Zone; label: string }[] = [
  { id: 'all', label: 'Partout' },
  { id: 'france', label: 'En France' },
  { id: 'abroad', label: 'À l’étranger' },
];

// Un acteur sans pays connu (souvent un tourneur ou un média) reste visible partout.
function inZone(e: Entity, z: Zone) {
  if (z === 'all' || !e.country) return true;
  return z === 'france' ? e.country === 'France' : e.country !== 'France';
}

export function TopActors({ data, onOpen, onSeeAll }: { data: State; onOpen: (k: string) => void; onSeeAll: (k: EntityKind) => void }) {
  const [zone, setZone] = useState<Zone>('all');
  const bands = useMemo(() => new Map(data.bands.map((b) => [b.id, b])), [data.bands]);

  const { cards, max, total } = useMemo(() => {
    const sig = data.entities.filter((e) => e.bandIds.length >= 2 && inZone(e, zone));
    // Plus de groupes d'abord ; à égalité, le score (Lyonnais, groupes à succès, récent).
    const sorted = [...sig].sort((a, b) => b.bandIds.length - a.bandIds.length || b.score - a.score);
    const cards = CARDS.map((k) => ({ kind: k, rows: sorted.filter((e) => e.kind === k) })).filter((c) => c.rows.length);
    return { cards, max: Math.max(2, ...sig.map((e) => e.bandIds.length)), total: sig.length };
  }, [data.entities, zone]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Trophy className="size-4 text-primary" /> Ceux qui reviennent le plus
          </h2>
          <p className="text-sm text-muted-foreground">
            {total} acteurs retrouvés chez au moins 2 groupes de la niche, sur {data.bands.filter((b) => b.status === 'done').length} groupes explorés. Le chiffre = nombre de groupes chez qui on les retrouve.
          </p>
        </div>
        <div className="flex items-center rounded-md border border-border bg-card p-0.5 text-xs">
          {ZONES.map((z) => (
            <button key={z.id} onClick={() => setZone(z.id)} className={cn('rounded px-2.5 py-1.5', zone === z.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ kind, rows }) => (
          <div key={kind} className="flex flex-col rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="inline-block size-2.5 rounded-full" style={{ background: KIND_COLOR[kind] }} />
                {KIND_PLURAL[kind]}
              </span>
              <span className="text-xs text-muted-foreground">{rows.length} qui reviennent</span>
            </div>
            <ol className="flex-1 divide-y divide-border/50">
              {rows.slice(0, PER_CARD).map((e) => (
                <li key={e.key}>
                  <button onClick={() => onOpen(e.key)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent/50">
                    <span className="w-7 shrink-0 text-right text-lg font-bold tabular-nums" style={{ color: KIND_COLOR[kind] }}>
                      {e.bandIds.length}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{e.name}</span>
                        {e.lyonBands > 0 && <MapPin className="size-3 shrink-0 text-primary" aria-label="Vu chez un groupe lyonnais" />}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground" title={e.bandIds.map((id) => bands.get(id)?.name ?? id).join(', ')}>
                        {[e.city, e.bandIds.map((id) => bands.get(id)?.name ?? id).join(', ')].filter(Boolean).join(' · ')}
                      </span>
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-secondary">
                        <span className="block h-full rounded-full" style={{ width: `${(e.bandIds.length / max) * 100}%`, background: KIND_COLOR[kind] }} />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {rows.length > PER_CARD && (
              <button onClick={() => onSeeAll(kind)} className="border-t border-border px-4 py-2 text-left text-xs text-primary hover:underline">
                Voir les {rows.length} {KIND_PLURAL[kind].toLowerCase()} qui reviennent
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="size-3 text-primary" /> vu chez au moins un groupe lyonnais. Les noms vus chez un seul groupe sont dans le classement complet, plus bas.
      </p>
    </section>
  );
}
