'use client';

import { useMemo, useRef, useState } from 'react';
import { Database, MapPin, Search, Star, Trophy } from 'lucide-react';
import { KIND_COLOR, KIND_PLURAL, type Entity, type EntityKind } from '@/lib/constellation/types';
import { Badge, Button, Dot, Empty, KindBadge, cn } from './ui';
import type { State } from './use-constellation';
import { TopActors } from './top-actors';
import { Upcoming } from './upcoming';

const KINDS: EntityKind[] = ['tourneur', 'label', 'salle', 'festival', 'organisateur', 'tete_affiche', 'plateau', 'media', 'dispositif'];

/** Une salle de plus de 600 places ou un tourneur international, c'est trop gros pour nous aujourd'hui (comme Alias, selon Francis). */
export function reachable(e: Entity) {
  if (e.capacity && e.capacity > 600) return false;
  if (e.kind === 'tourneur' && e.scale === 'international') return false;
  return true;
}

export function Ranking({ data, onOpen, onBand, selected, goBands }: { data: State; onOpen: (key: string) => void; onBand: (id: string) => void; selected: string | null; goBands: () => void }) {
  const [kind, setKind] = useState<EntityKind | 'all'>('all');
  // Par défaut, seulement les noms qui reviennent : les 600+ vus une seule fois noyaient le classement.
  const [min, setMin] = useState(2);
  const tableRef = useRef<HTMLHeadingElement>(null);
  const [q, setQ] = useState('');
  const [onlyLyon, setOnlyLyon] = useState(false);
  const [onlyRef, setOnlyRef] = useState(false);
  const [onlyReach, setOnlyReach] = useState(false);
  const [hideCrm, setHideCrm] = useState(false);

  const bandName = useMemo(() => new Map(data.bands.map((b) => [b.id, b])), [data.bands]);

  const base = data.entities.filter((e) => e.bandIds.length >= min || (min <= 1 && e.watch));
  const counts = useMemo(() => {
    const c: Partial<Record<EntityKind, number>> = {};
    for (const e of base) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [base]);

  const needle = q.trim().toLowerCase();
  const rows = base.filter(
    (e) =>
      (kind === 'all' || e.kind === kind) &&
      (!onlyLyon || e.lyonBands > 0) &&
      (!onlyRef || e.refBands > 0) &&
      (!onlyReach || reachable(e)) &&
      (!hideCrm || !e.inCrm) &&
      (!needle || `${e.name} ${e.city ?? ''} ${e.country ?? ''}`.toLowerCase().includes(needle)),
  );
  const maxBands = Math.max(1, ...data.entities.map((e) => e.bandIds.length));
  const explored = data.bands.some((b) => b.status === 'done');

  if (!explored)
    return (
      <div className="space-y-4">
        <Empty icon={<Star className="size-6" />} title="Aucun groupe exploré pour l’instant">
          Lance l’exploration des groupes de départ : la recherche relève pour chacun tourneur, label, salles, festivals et premières parties, puis le classement fait ressortir les noms qui reviennent.
          <div className="mt-4">
            <Button variant="primary" onClick={goBands}>
              Aller aux groupes de départ
            </Button>
          </div>
        </Empty>
        <WatchList data={data} onOpen={onOpen} />
      </div>
    );

  return (
    <div className="space-y-4">
      <TopActors
        data={data}
        onOpen={onOpen}
        onSeeAll={(k) => {
          setKind(k);
          setMin(2);
          tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />
      <Upcoming data={data} onBand={onBand} onEntity={onOpen} />
      <h2 ref={tableRef} className="scroll-mt-4 pt-2 text-base font-semibold">
        Classement complet
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <Chip on={kind === 'all'} onClick={() => setKind('all')}>
          Tous <span className="text-muted-foreground">{base.length}</span>
        </Chip>
        {KINDS.filter((k) => counts[k]).map((k) => (
          <Chip key={k} on={kind === k} onClick={() => setKind(k)}>
            <Dot color={KIND_COLOR[k]} /> {KIND_PLURAL[k]} <span className="text-muted-foreground">{counts[k]}</span>
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher un nom, une ville…"
            className="h-9 w-64 rounded-md border border-input bg-card pr-3 pl-8 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div className="flex items-center rounded-md border border-border bg-card p-0.5 text-xs">
          {[1, 2, 3].map((n) => (
            <button key={n} onClick={() => setMin(n)} className={cn('rounded px-2.5 py-1.5', min === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {n === 1 ? 'Tous' : `≥ ${n} groupes`}
            </button>
          ))}
        </div>
        <Toggle on={onlyLyon} onClick={() => setOnlyLyon(!onlyLyon)}>
          <MapPin className="size-3.5" /> Chez les Lyonnais
        </Toggle>
        <Toggle on={onlyRef} onClick={() => setOnlyRef(!onlyRef)}>
          <Trophy className="size-3.5" /> Chez les groupes à succès
        </Toggle>
        <Toggle on={onlyReach} onClick={() => setOnlyReach(!onlyReach)}>
          À notre portée
        </Toggle>
        {data.crmCount > 0 && (
          <Toggle on={hideCrm} onClick={() => setHideCrm(!hideCrm)}>
            <Database className="size-3.5" /> Pas encore dans le CRM
          </Toggle>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty title="Rien avec ces filtres" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Acteur</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Vu chez</th>
                <th className="w-40 px-3 py-2 font-medium">Récurrence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr
                  key={e.key}
                  onClick={() => onOpen(e.key)}
                  className={cn('cursor-pointer border-b border-border/60 last:border-0 hover:bg-accent/50', selected === e.key && 'bg-primary/5')}
                >
                  <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.name}</span>
                      <KindBadge kind={e.kind} />
                      {e.watch && (
                        <Badge className="border-primary/40 text-primary" title={e.watch.note}>
                          <Star className="size-3" /> Francis
                        </Badge>
                      )}
                      {e.refBands > 0 && (
                        <Badge className="border-primary/40 text-primary" title="Groupes à succès passés par là">
                          <Trophy className="size-3" /> {e.refBands}
                        </Badge>
                      )}
                      {e.inCrm && (
                        <Badge className="border-border text-muted-foreground" title={`Dans le CRM : ${e.inCrm.name}`}>
                          <Database className="size-3" /> CRM
                        </Badge>
                      )}
                      {!reachable(e) && <Badge className="border-border text-muted-foreground">Gros</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[e.city, e.country].filter(Boolean).join(', ')}
                      {e.capacity ? ` · ~${e.capacity} pl.` : ''}
                      {e.scale && (e.kind === 'tourneur' || e.kind === 'label') ? ` · ${e.scale}` : ''}
                      {e.lastYear ? ` · dernière trace ${e.lastYear}` : ''}
                    </div>
                  </td>
                  <td className="hidden px-3 py-2.5 md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {e.bandIds.slice(0, 5).map((id) => {
                        const b = bandName.get(id);
                        return (
                          <span key={id} className={cn('rounded bg-secondary px-1.5 py-0.5 text-xs', b?.scene === 'lyon' && 'text-primary')}>
                            {b?.name ?? id}
                          </span>
                        );
                      })}
                      {e.bandIds.length > 5 && <span className="text-xs text-muted-foreground">+{e.bandIds.length - 5}</span>}
                      {!e.bandIds.length && <span className="text-xs text-muted-foreground italic">pas encore croisé</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full" style={{ width: `${(e.bandIds.length / maxBands) * 100}%`, background: KIND_COLOR[e.kind] }} />
                      </div>
                      <span className={cn('w-16 text-right text-xs tabular-nums', e.bandIds.length >= 2 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                        {e.bandIds.length} groupe{e.bandIds.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WatchList({ data, onOpen }: { data: State; onOpen: (k: string) => void }) {
  const w = data.entities.filter((e) => e.watch);
  if (!w.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Notés en séance avec Francis</h3>
      <p className="mb-3 text-xs text-muted-foreground">Ils remonteront dans le classement s’ils apparaissent chez les groupes explorés. Ouvre un tourneur pour explorer son catalogue.</p>
      <div className="flex flex-wrap gap-2">
        {w.map((e) => (
          <button key={e.key} onClick={() => onOpen(e.key)} className="rounded-md border border-border px-2.5 py-1.5 text-left text-sm hover:bg-accent">
            {e.name} <span className="text-xs text-muted-foreground">· {e.watch!.scale}</span>
          </button>
        ))}
      </div>
    </div>
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
