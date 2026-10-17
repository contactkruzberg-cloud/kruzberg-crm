'use client';

import { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import type { Finding } from '@/lib/constellation/types';
import { host } from './ui';
import type { State } from './use-constellation';

// Conseil de Francis pour Johnnie Carwash : « aller les voir et les contacter ».
// Les dates à venir des groupes de la niche près de Lyon sont l'occasion de
// rencontrer le groupe, le programmateur et parfois le tourneur.
const NEAR = /lyon|villeurbanne|vaulx|vénissieux|venissieux|saint-?étienne|saint-?etienne|grenoble|chambéry|chambery|annecy|valence|vienne|bourg-en-bresse|mâcon|macon|clermont|genève|geneve|dijon|annemasse/i;

export function Upcoming({ data, onBand, onEntity }: { data: State; onBand: (id: string) => void; onEntity: (k: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: { f: Finding; key: string }[] = [];
    for (const e of data.entities)
      for (const f of e.findings) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.when ?? '') || f.when! < today) continue;
        if (!NEAR.test(`${f.city ?? ''} ${e.city ?? ''}`)) continue;
        if (!['salle', 'festival', 'organisateur'].includes(f.kind)) continue;
        const id = `${f.bandId}|${f.when}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ f, key: e.key });
      }
    return out.sort((a, b) => a.f.when!.localeCompare(b.f.when!));
  }, [data.entities, today]);
  const bands = new Map(data.bands.map((b) => [b.id, b.name]));
  if (!rows.length) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarDays className="size-4 text-primary" /> À aller voir près de Lyon
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">Dates à venir des groupes de la niche : l’occasion de rencontrer le groupe, le programmateur et, parfois, le tourneur.</p>
      <ul className="space-y-1.5">
        {rows.map(({ f, key }) => (
          <li key={f.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="w-24 shrink-0 font-medium tabular-nums">{new Date(f.when!).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <button onClick={() => onBand(f.bandId)} className="font-medium hover:underline">
              {bands.get(f.bandId)}
            </button>
            <span className="text-muted-foreground">à</span>
            <button onClick={() => onEntity(key)} className="hover:underline">
              {f.name}
            </button>
            <span className="text-xs text-muted-foreground">
              {f.city}
              {f.detail ? ` · ${f.detail}` : ''} ·{' '}
              <a href={f.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                {host(f.sourceUrl)}
              </a>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
