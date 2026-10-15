'use client';

import { useMemo, useState } from 'react';
import { Loader2, Route, Sparkles, Trophy } from 'lucide-react';
import { STAGE_COLOR, STAGE_LABEL, type Band, type Milestone, type Stage } from '@/lib/constellation/types';
import { Button, Dot, Empty, cn } from './ui';
import type { State } from './use-constellation';

// Les étapes qui comptent pour comparer les débuts (la formation, le premier
// concert et les sorties servent de repères mais ne sont pas des « portes »).
const KEY_STAGES: Stage[] = [
  'tremplin',
  'accompagnement',
  'residence',
  'premiere_partie',
  'festival',
  'media',
  'session_live',
  'premier_tourneur',
  'signature_label',
  'tournee_france',
  'tournee_europe',
  'premiere_sortie',
  'premier_album',
];

function start(b: Band) {
  return b.formedYear ?? Math.min(...(b.milestones ?? []).map((m) => m.year));
}

function median(xs: number[]) {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function Patterns({ data, act, onBand }: { data: State; act: (b: Record<string, unknown>) => Promise<unknown>; onBand: (id: string) => void }) {
  const [group, setGroup] = useState<'ref' | 'niche'>('ref');
  const [stage, setStage] = useState<Stage | null>(null);
  const withPath = data.bands.filter((b) => b.milestones?.length && b.status !== 'rejected');
  const refs = withPath.filter((b) => b.reference);
  const niche = withPath.filter((b) => !b.reference);
  const shown = group === 'ref' ? refs : niche;
  const synthJob = data.jobs.find((j) => j.kind === 'synthesis' && (j.status === 'queued' || j.status === 'running'));
  const synth = data.synthesis;

  const table = useMemo(
    () =>
      KEY_STAGES.map((st) => {
        const hits = shown
          .map((b) => {
            const ms = b.milestones!.filter((m) => m.stage === st);
            if (!ms.length) return null;
            return { b, first: ms[0], offset: ms[0].year - start(b), ms };
          })
          .filter((x): x is { b: Band; first: Milestone; offset: number; ms: Milestone[] } => !!x);
        const actors = new Map<string, number>();
        for (const h of hits) for (const m of h.ms) if (m.actor) actors.set(m.actor, (actors.get(m.actor) ?? 0) + 1);
        return {
          stage: st,
          hits,
          med: median(hits.map((h) => h.offset).filter((x) => x >= 0)),
          actors: [...actors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
        };
      }).filter((r) => r.hits.length),
    [shown],
  );

  const span = Math.max(8, ...shown.map((b) => Math.max(...b.milestones!.map((m) => m.year)) - start(b) + 1));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-4 text-primary" /> Patterns de réussite
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Ce que les débuts des groupes qui ont percé ont en commun, comparé à notre niche, et ce que KRUZBERG peut en faire. Synthèse rédigée à partir des trajectoires datées et des acteurs ci-dessous.
            </p>
          </div>
          <Button variant={synth ? 'default' : 'primary'} disabled={!!synthJob || refs.length < 2} onClick={() => act({ type: 'synthesis' })}>
            {synthJob ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {synthJob ? 'Synthèse en cours…' : synth ? 'Mettre à jour la synthèse' : 'Générer la synthèse'}
          </Button>
        </div>
        {refs.length < 2 && <p className="mt-3 text-sm text-muted-foreground">Il faut au moins deux groupes à succès explorés.</p>}
        {synth && (
          <div className="mt-4 space-y-5">
            <p className="text-sm leading-relaxed">{synth.summary}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {synth.patterns.map((p, i) => (
                <article key={i} className="rounded-lg border border-border bg-background p-4">
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{p.evidence}</p>
                  <p className="mt-2 rounded-md bg-primary/10 p-2 text-sm text-foreground">
                    <span className="font-semibold text-primary">Pour KRUZBERG : </span>
                    {p.forKruzberg}
                  </p>
                  {p.actors.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Acteurs : {p.actors.join(' · ')}</p>}
                </article>
              ))}
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-2 font-semibold">
                <Route className="size-4 text-primary" /> Feuille de route
              </h3>
              <ol className="space-y-2">
                {synth.roadmap.map((r, i) => (
                  <li key={i} className="flex gap-3 rounded-lg border border-border bg-background p-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                    <div className="text-sm">
                      <div className="font-medium">
                        {r.step} <span className="font-normal text-muted-foreground">· {r.horizon}</span>
                      </div>
                      <p className="mt-0.5 text-foreground/85">{r.actions}</p>
                      {r.actors.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{r.actors.join(' · ')}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <p className="text-[11px] text-muted-foreground">Générée le {new Date(synth.generatedAt).toLocaleString('fr-FR')}. À relire : la synthèse ne cite que le dossier, mais une source peut se tromper.</p>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border border-border bg-card p-0.5 text-xs">
          <button onClick={() => setGroup('ref')} className={cn('inline-flex items-center gap-1.5 rounded px-3 py-1.5', group === 'ref' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
            <Trophy className="size-3.5" /> Groupes à succès · {refs.length}
          </button>
          <button onClick={() => setGroup('niche')} className={cn('rounded px-3 py-1.5', group === 'niche' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
            Notre niche · {niche.length}
          </button>
        </div>
        {stage && (
          <Button size="sm" variant="ghost" onClick={() => setStage(null)}>
            Toutes les étapes
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <Empty title="Pas encore de trajectoire">Les trajectoires arrivent au fil des explorations (une à six minutes par groupe).</Empty>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">Étapes communes</h3>
            <p className="mb-3 text-xs text-muted-foreground">Pour chaque étape : combien de groupes y sont passés, au bout de combien d’années après leur formation, et par quels acteurs. Clique une ligne pour la repérer sur les frises.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Étape</th>
                    <th className="py-1.5 pr-3 font-medium">Groupes</th>
                    <th className="py-1.5 pr-3 font-medium">Délai médian</th>
                    <th className="py-1.5 font-medium">Acteurs qui reviennent</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((r) => (
                    <tr key={r.stage} onClick={() => setStage(stage === r.stage ? null : r.stage)} className={cn('cursor-pointer border-t border-border/60 hover:bg-accent/40', stage === r.stage && 'bg-primary/5')}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Dot color={STAGE_COLOR[r.stage]} className="mr-2" />
                        {STAGE_LABEL[r.stage]}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                        {r.hits.length} / {shown.length}
                        <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full" style={{ width: `${(r.hits.length / shown.length) * 100}%`, background: STAGE_COLOR[r.stage] }} />
                        </div>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{r.med !== undefined ? `${r.med === 0 ? 'l’année de formation' : `${r.med} an${r.med > 1 ? 's' : ''}`}` : '—'}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {r.actors.length ? r.actors.map(([a, n]) => (n > 1 ? `${a} ×${n}` : a)).join(' · ') : r.hits.map((h) => h.b.name).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">Frises : années depuis la formation</h3>
            <p className="mb-3 text-xs text-muted-foreground">Chaque point est une étape datée (survol pour le détail). Clique un nom pour ouvrir le parcours complet et ses sources.</p>
            <div className="mb-2 ml-40 flex justify-between text-[10px] text-muted-foreground tabular-nums">
              {Array.from({ length: span + 1 }, (_, i) => (
                <span key={i}>{i === 0 ? 'an 0' : i}</span>
              ))}
            </div>
            <div className="space-y-1">
              {shown
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((b) => {
                  const s0 = start(b);
                  return (
                    <div key={b.id} className="flex items-center gap-2">
                      <button onClick={() => onBand(b.id)} className="w-38 shrink-0 truncate text-left text-sm hover:underline" title={b.name}>
                        {b.name} <span className="text-[10px] text-muted-foreground">{s0}</span>
                      </button>
                      <div className="relative h-6 flex-1 rounded bg-secondary/50">
                        {b.milestones!.map((m, i) => {
                          const x = ((m.year - s0 + (monthOf(m) - 0.5) / 12) / (span + 1)) * 100;
                          const dim = stage && m.stage !== stage;
                          return (
                            <span
                              key={i}
                              title={`${m.when ?? m.year} · ${STAGE_LABEL[m.stage]} · ${m.title}${m.actor ? ` (${m.actor})` : ''}`}
                              className={cn('absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background transition-opacity', dim && 'opacity-10')}
                              style={{ left: `${Math.max(0, Math.min(100, x))}%`, background: STAGE_COLOR[m.stage] }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {(Object.keys(STAGE_LABEL) as Stage[]).map((st) => (
                <span key={st} className="inline-flex items-center gap-1">
                  <Dot color={STAGE_COLOR[st]} /> {STAGE_LABEL[st]}
                </span>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function monthOf(m: Milestone) {
  const mo = Number(m.when?.slice(5, 7));
  return mo >= 1 && mo <= 12 ? mo : 6.5;
}
