'use client';

import { useMemo, useState } from 'react';
import { Link2, Search } from 'lucide-react';
import type { Pair } from '@/lib/constellation/links';
import { KIND_PLURAL, type Entity, type EntityKind } from '@/lib/constellation/types';
import { reachable } from './ranking';
import { Badge, Empty, KindBadge, cn } from './ui';
import type { State } from './use-constellation';

const ORDER: EntityKind[] = ['tourneur', 'label', 'salle', 'festival', 'organisateur', 'dispositif', 'tete_affiche', 'plateau', 'media'];
// Les liens qui mènent à des dates passent en premier.
const PRIORITY = ['tourneur|salle', 'tourneur|festival', 'label|salle', 'salle|salle', 'salle|festival', 'tourneur|label', 'festival|festival', 'label|festival', 'tourneur|organisateur', 'salle|organisateur'];

interface Row {
  id: string;
  a: Entity;
  b: Entity;
  bands: string[];
  cat: string;
}

/** Les paires d'acteurs qui partagent le plus de groupes : les circuits de la niche. */
export function LinksTab({ data, pairs, onEntity, onBand }: { data: State; pairs: Pair[]; onEntity: (k: string) => void; onBand: (id: string) => void }) {
  const [cat, setCat] = useState<string>('all');
  const [min, setMin] = useState(2);
  const [q, setQ] = useState('');
  const [onlyReach, setOnlyReach] = useState(false);
  const [onlyLyon, setOnlyLyon] = useState(false);

  const bands = useMemo(() => new Map(data.bands.map((b) => [b.id, b])), [data.bands]);
  const rows = useMemo(() => {
    const ents = new Map(data.entities.map((e) => [e.key, e]));
    const out: Row[] = [];
    for (const p of pairs) {
      if (p.bands.length < 2) break; // triées du plus fort au plus faible
      let a = ents.get(p.a);
      let b = ents.get(p.b);
      if (!a || !b) continue;
      if (ORDER.indexOf(a.kind) > ORDER.indexOf(b.kind)) [a, b] = [b, a];
      out.push({ id: `${p.a}|${p.b}`, a, b, bands: p.bands, cat: `${a.kind}|${b.kind}` });
    }
    return out;
  }, [pairs, data.entities]);

  const cats = useMemo(() => {
    const c = new Map<string, number>();
    // Seules les combinaisons qui mènent à des dates ont leur filtre ; les autres restent dans « Tous ».
    for (const r of rows) if (r.bands.length >= min && PRIORITY.includes(r.cat)) c.set(r.cat, (c.get(r.cat) ?? 0) + 1);
    return [...c].sort((x, y) => PRIORITY.indexOf(x[0]) - PRIORITY.indexOf(y[0]));
  }, [rows, min]);

  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      r.bands.length >= min &&
      (cat === 'all' ? r.a.kind !== 'media' && r.b.kind !== 'media' : r.cat === cat) &&
      (!onlyReach || (reachable(r.a) && reachable(r.b))) &&
      (!onlyLyon || r.bands.some((id) => bands.get(id)?.scene === 'lyon')) &&
      (!needle || `${r.a.name} ${r.a.city ?? ''} ${r.b.name} ${r.b.city ?? ''}`.toLowerCase().includes(needle)),
  );

  if (!rows.length)
    return (
      <Empty icon={<Link2 className="size-6" />} title="Pas encore de liens">
        Deux acteurs sont reliés quand au moins deux groupes explorés passent par les deux. Explore plus de groupes pour voir les circuits apparaître.
      </Empty>
    );

  const label = (c: string) => {
    const [x, y] = c.split('|') as EntityKind[];
    return x === y ? `${KIND_PLURAL[x]} entre eux` : `${KIND_PLURAL[x]} ↔ ${KIND_PLURAL[y]}`;
  };

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Deux acteurs sont reliés quand les mêmes groupes passent par les deux. Si plusieurs groupes d’un tourneur jouent dans la même salle, cette salle fait partie de son circuit : on peut citer le tourneur en écrivant à la salle, ou la salle en écrivant au tourneur.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Chip on={cat === 'all'} onClick={() => setCat('all')}>
          Tous <span className="text-muted-foreground">(hors médias)</span>
        </Chip>
        {cats.map(([c, n]) => (
          <Chip key={c} on={cat === c} onClick={() => setCat(c)}>
            {label(c)} <span className="text-muted-foreground">{n}</span>
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher une salle, un tourneur…"
            className="h-9 w-64 rounded-md border border-input bg-card pr-3 pl-8 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div className="flex items-center rounded-md border border-border bg-card p-0.5 text-xs">
          {[2, 3].map((n) => (
            <button key={n} onClick={() => setMin(n)} className={cn('rounded px-2.5 py-1.5', min === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              ≥ {n} groupes en commun
            </button>
          ))}
        </div>
        <Toggle on={onlyLyon} onClick={() => setOnlyLyon(!onlyLyon)}>
          Via un groupe lyonnais
        </Toggle>
        <Toggle on={onlyReach} onClick={() => setOnlyReach(!onlyReach)}>
          À notre portée
        </Toggle>
      </div>

      {shown.length === 0 ? (
        <Empty title="Rien avec ces filtres" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border/60">
            {shown.slice(0, 200).map((r) => (
              <li key={r.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1.2fr)] md:items-center">
                <Actor e={r.a} onOpen={onEntity} />
                <Badge className="w-fit border-primary/40 text-primary" title="Groupes en commun">
                  {r.bands.length} groupes
                </Badge>
                <Actor e={r.b} onOpen={onEntity} />
                <div className="flex flex-wrap gap-1">
                  {r.bands.map((id) => (
                    <button key={id} onClick={() => onBand(id)} className={cn('rounded bg-secondary px-1.5 py-0.5 text-xs hover:underline', bands.get(id)?.scene === 'lyon' && 'text-primary')}>
                      {bands.get(id)?.name ?? id}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {shown.length > 200 && <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">200 premiers liens sur {shown.length} : affine avec les filtres.</p>}
        </div>
      )}
    </div>
  );
}

function Actor({ e, onOpen }: { e: Entity; onOpen: (k: string) => void }) {
  return (
    <button onClick={() => onOpen(e.key)} className="min-w-0 text-left">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium hover:underline">{e.name}</span>
        <KindBadge kind={e.kind} />
      </div>
      <div className="text-xs text-muted-foreground">
        {[e.city, e.capacity ? `~${e.capacity} pl.` : null, `${e.bandIds.length} groupe${e.bandIds.length > 1 ? 's' : ''} en tout`].filter(Boolean).join(' · ')}
      </div>
    </button>
  );
}

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium', on ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
    >
      {children}
    </button>
  );
}

function Toggle({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn('inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium', on ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground')}
    >
      {children}
    </button>
  );
}
