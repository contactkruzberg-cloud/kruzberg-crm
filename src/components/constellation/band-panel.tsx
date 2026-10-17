'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Lightbulb, Loader2, RefreshCw, Trophy, X } from 'lucide-react';
import { entityKey } from '@/lib/constellation/normalize';
import type { BandLink } from '@/lib/constellation/links';
import { KIND_COLOR, ORIGIN_LABEL, STAGE_COLOR, STAGE_LABEL, type Band, type EntityKind } from '@/lib/constellation/types';
import { Badge, Button, Dot, KindBadge, cn, host } from './ui';
import { useDetail, type State } from './use-constellation';

const ORDER: EntityKind[] = ['tourneur', 'label', 'festival', 'salle', 'organisateur', 'tete_affiche', 'plateau', 'media', 'dispositif'];

export function BandPanel({
  band: slim,
  data,
  act,
  near,
  onClose,
  onEntity,
  onBand,
}: {
  band: Band;
  data: State;
  act: (x: Record<string, unknown>) => Promise<unknown>;
  near: BandLink[];
  onClose: () => void;
  onEntity: (key: string) => void;
  onBand: (id: string) => void;
}) {
  // Résumé, leçon, sources des étapes et contexte des faits : chargés à l'ouverture de la fiche.
  const { detail, loading } = useDetail({ band: slim.id }, data.stamp);
  const b: Band = detail?.band ? { ...slim, ...detail.band } : slim;
  const facts = detail?.facts;
  // Les faits du groupe, retrouvés dans les acteurs agrégés (fusions comprises).
  const rows = useMemo(() => {
    const out: { entityKey: string; entityName: string; recurrence: number; kind: EntityKind; when?: string; detail?: string; city?: string; src: string; id: string }[] = [];
    for (const e of data.entities)
      for (const f of e.findings)
        if (f.bandId === b.id)
          out.push({
            entityKey: e.key,
            entityName: e.name,
            recurrence: e.bandIds.length,
            kind: f.kind,
            when: f.when,
            detail: facts?.[f.id]?.detail ?? f.detail,
            city: f.city,
            src: facts?.[f.id]?.sourceUrl ?? f.sourceUrl,
            id: f.id,
          });
    return out;
  }, [data.entities, b.id, facts]);
  const busy = b.status === 'queued' || b.status === 'running';

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-border p-5">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge className="text-muted-foreground">{ORIGIN_LABEL[b.origin]}</Badge>
            {b.reference && (
              <Badge className="border-primary/40 text-primary">
                <Trophy className="size-3" /> Groupe à succès
              </Badge>
            )}
            {b.fit && <Badge className="text-muted-foreground" title="Proximité avec KRUZBERG estimée par la découverte">proximité {b.fit}/5</Badge>}
          </div>
          <h2 className="mt-2 text-lg font-semibold">{b.name}</h2>
          <p className="text-sm text-muted-foreground">{[b.genre, b.city, b.country, b.formedYear ? `formé en ${b.formedYear}` : null].filter(Boolean).join(' · ')}</p>
          <div className="mt-1 flex flex-wrap gap-3 text-sm">
            {Object.entries(b.links ?? {})
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <a key={k} href={v} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  {host(v)} <ExternalLink className="size-3" />
                </a>
              ))}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fermer">
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {b.why && <p className="text-sm text-muted-foreground">{b.why}</p>}
        {loading && !detail && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Chargement du parcours…
          </p>
        )}
        {b.summary && (
          <section>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Parcours</h3>
            <p className="text-sm leading-relaxed">{b.summary}</p>
          </section>
        )}
        {b.lesson && (
          <section className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
              <Lightbulb className="size-4" /> Pour KRUZBERG
            </div>
            {b.lesson}
          </section>
        )}
        {b.error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">{b.error}</p>}

        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => act({ type: 'exploreBand', id: b.id })}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {busy ? (b.status === 'running' ? 'Recherche en cours…' : 'En file d’attente') : b.exploredAt ? 'Relancer la recherche' : 'Explorer'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act({ type: 'setReference', id: b.id, reference: !b.reference })}>
            <Trophy className="size-3.5" /> {b.reference ? 'Retirer des groupes à succès' : 'Groupe à succès'}
          </Button>
        </div>
        {b.exploredAt && <p className="-mt-3 text-xs text-muted-foreground">Exploré le {new Date(b.exploredAt).toLocaleDateString('fr-FR')}</p>}

        {b.milestones && b.milestones.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Trajectoire</h3>
            <ol className="relative space-y-2 border-l border-border pl-4">
              {b.milestones.map((m, i) => (
                <li key={i} className="text-sm">
                  <Dot color={STAGE_COLOR[m.stage]} className="absolute -left-[4.5px] mt-1.5" />
                  <span className="font-medium tabular-nums">{m.when ?? m.year}</span> <span className="text-xs text-muted-foreground">· {STAGE_LABEL[m.stage]}</span>
                  <div className="text-foreground/85">
                    {m.title}
                    {m.actor ? <span className="text-muted-foreground"> ({m.actor})</span> : null}{' '}
                    {m.sourceUrl && (
                      <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                        {host(m.sourceUrl)}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <NearBands near={near} data={data} onBand={onBand} onEntity={onEntity} />

        {ORDER.map((k) => {
          const rs = rows.filter((r) => r.kind === k).sort((a, b2) => b2.recurrence - a.recurrence || (b2.when ?? '').localeCompare(a.when ?? ''));
          if (!rs.length) return null;
          return (
            <section key={k}>
              <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <KindBadge kind={k} /> {rs.length}
              </h3>
              <ul className="divide-y divide-border/60 rounded-lg border border-border">
                {rs.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <button onClick={() => onEntity(r.entityKey)} className={cn('text-left font-medium hover:underline', r.recurrence >= 2 && 'text-primary')}>
                        {r.entityName}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        {[r.when, r.city, r.detail].filter(Boolean).join(' · ')}{' '}
                        {r.src && (
                          <a href={r.src} target="_blank" rel="noreferrer" className="hover:underline">
                            ({host(r.src)})
                          </a>
                        )}
                      </div>
                    </div>
                    {r.recurrence >= 2 && <Badge className="border-primary/40 text-primary" title="Nombre de groupes de la niche chez qui on le retrouve">×{r.recurrence}</Badge>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {b.exploredAt && rows.length === 0 && <p className="text-sm text-muted-foreground">Aucun fait relevé (ou tous écartés).</p>}
        <p className="text-[11px] text-muted-foreground">×N = acteur retrouvé chez N groupes de la niche.</p>
      </div>
    </aside>
  );
}

// Utilisé par le graphe pour relier un groupe exploré qui apparaît lui-même en
// co-plateau / tête d'affiche chez un autre groupe.
export const bandEntityKey = (b: Band) => entityKey('plateau', b.name);

/** Les groupes qui ont le plus d'acteurs en commun avec celui-ci (même tourneur, mêmes salles…). */
function NearBands({ near, data, onBand, onEntity }: { near: BandLink[]; data: State; onBand: (id: string) => void; onEntity: (key: string) => void }) {
  const [more, setMore] = useState(false);
  const bands = useMemo(() => new Map(data.bands.map((b) => [b.id, b])), [data.bands]);
  const entities = useMemo(() => new Map(data.entities.map((e) => [e.key, e])), [data.entities]);
  const rows = near.filter((l) => l.keys.length >= 2);
  if (!rows.length) return null;
  const rank = (k: string) => ORDER.indexOf(entities.get(k)?.kind ?? 'media');
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Groupes au parcours proche</h3>
      <p className="mb-2 text-xs text-muted-foreground">Ils partagent au moins deux acteurs avec ce groupe : mêmes salles, même tourneur, mêmes festivals.</p>
      <ul className="divide-y divide-border/60 rounded-lg border border-border">
        {rows.slice(0, more ? undefined : 6).map((l) => {
          const b = bands.get(l.id);
          return (
            <li key={l.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => onBand(l.id)} className={cn('text-left text-sm font-medium hover:underline', b?.scene === 'lyon' && 'text-primary')}>
                  {b?.name ?? l.id}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">{b?.city}</span>
                </button>
                <Badge className="border-primary/40 text-primary">{l.keys.length} en commun</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {[...l.keys]
                  .sort((x, y) => rank(x) - rank(y))
                  .map((k) => {
                    const e = entities.get(k);
                    if (!e) return null;
                    return (
                      <button key={k} onClick={() => onEntity(k)} className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs hover:underline">
                        <Dot color={KIND_COLOR[e.kind]} /> {e.name}
                      </button>
                    );
                  })}
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length > 6 && (
        <button onClick={() => setMore(!more)} className="mt-1 text-xs text-primary hover:underline">
          {more ? 'Réduire' : `Voir les ${rows.length - 6} autres`}
        </button>
      )}
    </section>
  );
}
