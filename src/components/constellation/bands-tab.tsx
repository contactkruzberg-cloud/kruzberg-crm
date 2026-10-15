'use client';

import { useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Compass, Loader2, Play, Plus, Rocket, Trophy, Undo2, X } from 'lucide-react';
import { ANGLE_LABEL, ORIGIN_LABEL, type Band, type DiscoverAngle } from '@/lib/constellation/types';
import { Badge, Button, Empty, cn } from './ui';
import type { State } from './use-constellation';

const SCENE: Record<string, string> = { lyon: 'Lyon & région', france: 'France', europe: 'Europe' };
const ANGLES = Object.keys(ANGLE_LABEL) as DiscoverAngle[];

function group(b: Band): string {
  if (b.reference) return 'ref';
  return b.scene ?? (b.origin === 'lyon' ? 'lyon' : 'autre');
}

const GROUPS: { id: string; label: string; hint: string }[] = [
  { id: 'lyon', label: 'Lyon & région', hint: 'Notre terrain d’abord : leurs lieux, tremplins et contacts nous sont accessibles.' },
  { id: 'ref', label: 'Groupes à succès', hint: 'On étudie leurs débuts pour en tirer les patterns de réussite.' },
  { id: 'france', label: 'France', hint: '' },
  { id: 'europe', label: 'Europe', hint: '' },
  { id: 'autre', label: 'Origine à préciser', hint: '' },
];

export function BandsTab({ data, act, onOpen }: { data: State; act: (b: Record<string, unknown>) => Promise<unknown>; onOpen: (id: string) => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [ref, setRef] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = data.bands.filter((b) => !['suggested', 'rejected'].includes(b.status));
  const suggested = data.bands.filter((b) => b.status === 'suggested').sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0));
  const rejected = data.bands.filter((b) => b.status === 'rejected');
  const todo = active.filter((b) => b.status === 'idle' || b.status === 'error').length;
  const pending = (angle: DiscoverAngle) => data.jobs.find((j) => j.kind === 'discover' && j.target === angle && (j.status === 'queued' || j.status === 'running'));
  const lastDone = (angle: DiscoverAngle) => data.jobs.find((j) => j.kind === 'discover' && j.target === angle && j.status === 'done');

  const add = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setErr(null);
    try {
      await act({ type: 'addBand', name, city, reference: ref });
      setName('');
      setCity('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Groupes explorés ou à explorer · {active.length}</h2>
            <p className="text-xs text-muted-foreground">Chaque exploration relève tourneurs, labels, salles, festivals, tremplins, premières parties et médias, plus la trajectoire datée. 3 à 8 min par groupe, 4 en parallèle, les Lyonnais en premier.</p>
          </div>
          <Button variant="primary" disabled={!todo} onClick={() => act({ type: 'exploreAll' })}>
            <Play className="size-4" /> Explorer {todo ? `les ${todo} restants` : 'tout'}
          </Button>
        </div>

        {GROUPS.map((g) => {
          const bs = active.filter((b) => group(b) === g.id).sort((a, b) => a.name.localeCompare(b.name));
          if (!bs.length) return null;
          return (
            <div key={g.id}>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                {g.id === 'ref' && <Trophy className="size-4 text-primary" />}
                {g.label} <span className="font-normal text-muted-foreground">· {bs.length}</span>
              </h3>
              {g.hint && <p className="mb-2 text-xs text-muted-foreground">{g.hint}</p>}
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                {bs.map((b) => (
                  <BandRow key={b.id} b={b} data={data} onOpen={onOpen} act={act} />
                ))}
              </ul>
            </div>
          );
        })}

        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ajouter un groupe" className="h-9 min-w-40 flex-1 rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville" className="h-9 w-32 rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={ref} onChange={(e) => setRef(e.target.checked)} /> Groupe à succès
          </label>
          <Button type="submit" disabled={!name.trim()}>
            <Plus className="size-4" /> Ajouter
          </Button>
        </form>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </section>

      <section className="space-y-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Compass className="size-4 text-primary" /> Découvrir des groupes
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            L’« espionnage industriel » de Francis : trouver les groupes auxquels on peut s’identifier. Ceux qui sont très proches de nous (4 ou 5 sur 5) sont retenus d’office ; les autres arrivent en suggestions.
          </p>
          <ul className="mt-3 space-y-1.5">
            {ANGLES.map((a) => {
              const p = pending(a);
              const d = lastDone(a);
              return (
                <li key={a} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    {ANGLE_LABEL[a]}
                    {d && !p && <span className="ml-1.5 text-xs text-muted-foreground">· {d.added ?? 0} trouvés</span>}
                  </span>
                  <Button size="sm" disabled={!!p} onClick={() => act({ type: 'discover', angle: a, autoExplore: true })}>
                    {p ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {p ? (p.status === 'running' ? 'En cours' : 'En attente') : d ? 'Relancer' : 'Lancer'}
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button className="mt-3 w-full" variant="primary" disabled={ANGLES.every((a) => pending(a))} onClick={() => act({ type: 'discoverAll', autoExplore: true })}>
            <Rocket className="size-4" /> Recherche massive (5 angles + exploration des groupes retenus)
          </Button>
        </div>

        <h2 className="pt-2 font-semibold">Suggestions à trier · {suggested.length}</h2>
        {suggested.length === 0 ? (
          <Empty title="Aucune suggestion">Elles viennent des découvertes et des catalogues de tourneurs ou labels (ouvre un tourneur dans le classement).</Empty>
        ) : (
          <ul className="space-y-2">
            {suggested.map((b) => (
              <li key={b.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {b.name} {b.fit ? <span className="text-xs font-normal text-muted-foreground">· {b.fit}/5</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[b.genre, b.city].filter(Boolean).join(' · ')} · {ORIGIN_LABEL[b.origin]}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="primary"
                      title="Retenir et explorer"
                      onClick={async () => {
                        await act({ type: 'setBandStatus', id: b.id, status: 'idle' });
                        await act({ type: 'exploreBand', id: b.id });
                      }}
                    >
                      <Check className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Écarter" onClick={() => act({ type: 'setBandStatus', id: b.id, status: 'rejected' })}>
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {b.why && <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">{b.why}</p>}
                {b.links?.website && (
                  <a href={b.links.website} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary hover:underline">
                    source
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {rejected.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Écartés · {rejected.length}</summary>
            <ul className="mt-2 space-y-1">
              {rejected.map((b) => (
                <li key={b.id} className="flex items-center justify-between text-muted-foreground">
                  {b.name}
                  <Button size="sm" variant="ghost" onClick={() => act({ type: 'setBandStatus', id: b.id, status: 'idle' })}>
                    <Undo2 className="size-3.5" /> Reprendre
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

function BandRow({ b, data, onOpen, act }: { b: Band; data: State; onOpen: (id: string) => void; act: (x: Record<string, unknown>) => Promise<unknown> }) {
  const facts = data.entities.reduce((n, e) => n + e.findings.filter((f) => f.bandId === b.id).length, 0);
  const busy = b.status === 'queued' || b.status === 'running';
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
      <span className="w-5">
        {b.status === 'done' && <CheckCircle2 className="size-4 text-primary" />}
        {b.status === 'running' && <Loader2 className="size-4 animate-spin text-primary" />}
        {b.status === 'queued' && <Loader2 className="size-4 text-muted-foreground" />}
        {b.status === 'error' && <AlertTriangle className="size-4 text-destructive" />}
      </span>
      <button onClick={() => onOpen(b.id)} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{b.name}</span>
          {b.city && <span className="text-xs text-muted-foreground">{b.city}</span>}
          {b.reference && b.scene && <Badge className={cn(b.scene === 'lyon' ? 'border-primary/40 text-primary' : 'text-muted-foreground')}>{SCENE[b.scene]}</Badge>}
          {b.fit && <span className="text-xs text-muted-foreground">· {b.fit}/5</span>}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {b.status === 'done'
            ? `${facts} faits · ${b.milestones?.length ?? 0} étapes de trajectoire`
            : b.status === 'error'
              ? b.error
              : b.status === 'running'
                ? 'Recherche en cours…'
                : b.status === 'queued'
                  ? 'En file d’attente'
                  : b.why}
        </div>
      </button>
      <Button size="sm" variant={b.status === 'done' ? 'ghost' : 'default'} disabled={busy} onClick={() => act({ type: 'exploreBand', id: b.id })}>
        {b.status === 'done' ? 'Relancer' : 'Explorer'}
      </Button>
    </li>
  );
}
