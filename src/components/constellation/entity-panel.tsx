'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Database, EyeOff, ExternalLink, Library, Loader2, Merge, Star, X } from 'lucide-react';
import { relationOrder, relationTitle, type EntityLink } from '@/lib/constellation/links';
import type { Entity, Finding } from '@/lib/constellation/types';
import { Badge, Button, KindBadge, cn, host } from './ui';
import { useDetail, type State } from './use-constellation';

function year(f: Finding) {
  return f.when?.slice(0, 4);
}

function list(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
}

/**
 * La phrase de personnalisation du premier mail (conseil de Francis : « montrer
 * qu'on connaît le lieu : j'ai vu que vous aviez accueilli tel artiste… »).
 */
export function hook(e: Entity, bandName: (id: string) => string): string | null {
  if (!e.bandIds.length) return null;
  const byBand = e.bandIds
    .map((id) => {
      const fs = e.findings.filter((f) => f.bandId === id);
      const y = fs.map(year).filter(Boolean).sort().at(-1);
      return { name: bandName(id), y };
    })
    .sort((a, b) => (b.y ?? '').localeCompare(a.y ?? ''))
    .slice(0, 2);
  const names = list(byBand.map((b) => (b.y ? `${b.name} (${b.y})` : b.name)));
  switch (e.kind) {
    case 'salle':
    case 'festival':
    case 'organisateur':
      return `J’ai vu que vous aviez accueilli ${names} : c’est exactement la scène dans laquelle on joue avec KRUZBERG, un quatuor post-punk lyonnais.`;
    case 'tourneur':
      return `Vous accompagnez ${names}, des groupes dont on se sent très proches : KRUZBERG est un quatuor post-punk lyonnais, chant en anglais, dans la même veine.`;
    case 'label':
      return `Vous avez sorti ${names}, des disques qui comptent pour nous : KRUZBERG est un quatuor post-punk lyonnais dans la même veine.`;
    case 'media':
      return `Vous avez parlé de ${names} : KRUZBERG est un quatuor post-punk lyonnais dans la même veine, et votre avis sur notre live session nous intéresse.`;
    case 'tete_affiche':
      return `Vous avez emmené ${names} en première partie : on serait ravis d’ouvrir pour vous lors de votre passage près de Lyon.`;
    case 'plateau':
      return `Vous avez partagé la scène avec ${names} : on joue dans la même niche à Lyon, et on serait partants pour un plateau commun ou un échange de dates.`;
    case 'dispositif':
      return `${names} sont passés par votre dispositif : c’est un parcours qui ressemble à celui que l’on vise.`;
  }
}

export function EntityPanel({
  entity: e,
  data,
  act,
  links,
  onClose,
  onBand,
  onEntity,
}: {
  entity: Entity;
  data: State;
  act: (b: Record<string, unknown>) => Promise<unknown>;
  links: Map<string, EntityLink[]>;
  onClose: () => void;
  onBand: (id: string) => void;
  onEntity: (key: string) => void;
}) {
  const bands = useMemo(() => new Map(data.bands.map((b) => [b.id, b])), [data.bands]);
  const name = (id: string) => bands.get(id)?.name ?? id;
  const sentence = hook(e, name);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState(e.note ?? '');
  const [mergeTo, setMergeTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const family = e.key.split(':')[0];
  const mergeOptions = data.entities.filter((x) => x.key !== e.key && x.key.startsWith(`${family}:`)).sort((a, b) => a.name.localeCompare(b.name));
  const rosterJob = data.jobs.find((j) => j.kind === 'roster' && j.target === e.key && (j.status === 'queued' || j.status === 'running'));
  const rosterDone = data.jobs.find((j) => j.kind === 'roster' && j.target === e.key && j.status === 'done');

  const run = async (label: string, body: Record<string, unknown>) => {
    setBusy(label);
    try {
      await act(body);
    } finally {
      setBusy(null);
    }
  };

  // Contexte et source des preuves : chargés à l'ouverture de la fiche.
  const { detail, loading } = useDetail({ entity: e.key }, data.stamp);
  const byBand = e.bandIds.map((id) => ({ id, fs: e.findings.filter((f) => f.bandId === id).sort((a, b) => (b.when ?? '').localeCompare(a.when ?? '')) }));

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-border p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={e.kind} />
            {e.watch && (
              <Badge className="border-primary/40 text-primary">
                <Star className="size-3" /> Cité par Francis
              </Badge>
            )}
            {e.inCrm && (
              <Badge className="text-muted-foreground">
                <Database className="size-3" /> Déjà dans le CRM
              </Badge>
            )}
          </div>
          <h2 className="mt-2 text-lg font-semibold">{e.name}</h2>
          <p className="text-sm text-muted-foreground">
            {[e.city, e.country].filter(Boolean).join(', ')}
            {e.capacity ? ` · ~${e.capacity} places` : ''}
            {e.scale && (e.kind === 'tourneur' || e.kind === 'label') ? ` · ${e.scale}` : ''}
          </p>
          {e.website && (
            <a href={e.website} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline">
              {host(e.website)} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fermer">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className={cn('rounded-lg border p-3 text-sm', e.bandIds.length >= 2 ? 'border-primary/40 bg-primary/5' : 'border-border')}>
          {e.bandIds.length >= 2 ? (
            <>
              <strong className="text-primary">Signal.</strong> Vu chez {e.bandIds.length} groupes de la niche
              {e.lyonBands ? `, dont ${e.lyonBands} lyonnais` : ''}. Selon la règle de Francis, il y a quelque chose à faire ici.
            </>
          ) : e.bandIds.length === 1 ? (
            <>Vu chez un seul groupe pour l’instant. Explore d’autres groupes pour confirmer.</>
          ) : (
            <>Pas encore croisé chez les groupes explorés.</>
          )}
          {e.watch && <p className="mt-2 text-muted-foreground">Note de séance : {e.watch.note}</p>}
          {e.inCrm && <p className="mt-2 text-muted-foreground">Dans le CRM sous « {e.inCrm.name} »{e.inCrm.city ? ` (${e.inCrm.city})` : ''}.</p>}
        </div>

        {sentence && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phrase de personnalisation</h3>
            <div className="rounded-lg border border-border bg-background p-3 text-sm leading-relaxed">
              {sentence}
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(sentence);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? 'Copiée' : 'Copier'}
                </Button>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Point de départ à retoucher : vérifie la date dans la source avant d’envoyer.</p>
          </section>
        )}

        <EntityLinks entity={e} links={links.get(e.key) ?? []} data={data} onEntity={onEntity} onBand={onBand} />

        {(e.kind === 'tourneur' || e.kind === 'label') && (
          <section className="rounded-lg border border-border p-3">
            <h3 className="text-sm font-semibold">Catalogue</h3>
            <p className="mb-2 text-xs text-muted-foreground">
              Chercher dans le roster de {e.name} les groupes de notre niche : ils arrivent en suggestions dans « Groupes de départ ».
            </p>
            <Button size="sm" disabled={!!rosterJob || busy === 'roster'} onClick={() => run('roster', { type: 'roster', key: e.key, name: e.name })}>
              {rosterJob ? <Loader2 className="size-3.5 animate-spin" /> : <Library className="size-3.5" />}
              {rosterJob ? 'Exploration en cours…' : rosterDone ? 'Explorer à nouveau le catalogue' : 'Explorer le catalogue'}
            </Button>
            {rosterDone && !rosterJob && <span className="ml-2 text-xs text-muted-foreground">{rosterDone.added ?? 0} groupe(s) suggéré(s)</span>}
          </section>
        )}

        {byBand.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Preuves, groupe par groupe {loading && <Loader2 className="size-3 animate-spin" />}
            </h3>
            <div className="space-y-3">
              {byBand.map(({ id, fs }) => (
                <div key={id} className="rounded-lg border border-border">
                  <button onClick={() => onBand(id)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-accent/50">
                    <span className={cn(bands.get(id)?.scene === 'lyon' && 'text-primary')}>{name(id)}</span>
                    <span className="text-xs text-muted-foreground">{bands.get(id)?.city}</span>
                  </button>
                  <ul className="space-y-1.5 border-t border-border px-3 py-2">
                    {fs.map((f) => {
                      const full = { ...f, ...detail?.facts[f.id] };
                      return (
                        <li key={f.id} className="text-xs">
                          <span className="text-foreground/90">{[full.when, full.detail, full.kind !== e.kind ? full.name : null].filter(Boolean).join(' · ') || 'Mention'}</span>{' '}
                          {full.sourceUrl && (
                            <a href={full.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              {host(full.sourceUrl)}
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3 border-t border-border pt-4">
          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Note</span>
            <textarea
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
              onBlur={() => note !== (e.note ?? '') && act({ type: 'entity', key: e.key, note })}
              rows={2}
              placeholder="Contact trouvé, qui connaît qui, à demander à Francis…"
              className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          {mergeOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <select value={mergeTo} onChange={(ev) => setMergeTo(ev.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">Même acteur que…</option>
                {mergeOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                    {o.city ? ` (${o.city})` : ''}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={!mergeTo || !!busy}
                onClick={async () => {
                  await run('merge', { type: 'entity', key: e.key, mergedInto: mergeTo });
                  onClose();
                }}
              >
                <Merge className="size-3.5" /> Fusionner
              </Button>
            </div>
          )}
          <Button
            variant="danger"
            size="sm"
            disabled={!!busy}
            onClick={async () => {
              await run('hide', { type: 'entity', key: e.key, hidden: true });
              onClose();
            }}
          >
            <EyeOff className="size-3.5" /> Écarter du classement (homonyme, hors sujet…)
          </Button>
        </section>
      </div>
    </aside>
  );
}

/** Les autres acteurs qui partagent des groupes avec celui-ci : le circuit autour de lui. */
function EntityLinks({
  entity: e,
  links,
  data,
  onEntity,
  onBand,
}: {
  entity: Entity;
  links: EntityLink[];
  data: State;
  onEntity: (key: string) => void;
  onBand: (id: string) => void;
}) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const entities = useMemo(() => new Map(data.entities.map((x) => [x.key, x])), [data.entities]);
  const bands = useMemo(() => new Map(data.bands.map((b) => [b.id, b])), [data.bands]);
  if (!links.length) return null;

  const strong = links.filter((l) => l.bands.length >= 2);
  // Sans lien fort, on montre quand même les liens à un groupe (le tourneur du seul groupe passé ici…).
  const showAll = all || strong.length === 0;
  const shown = showAll ? links : strong;
  const groups = relationOrder(e.kind)
    .map((k) => ({
      kind: k,
      rows: shown
        .map((l) => ({ ...l, ent: entities.get(l.key)! }))
        .filter((l) => l.ent?.kind === k)
        .sort((a, b) => b.bands.length - a.bands.length || b.ent.bandIds.length - a.ent.bandIds.length),
    }))
    .filter((g) => g.rows.length);

  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Liens</h3>
      <p className="mb-2 text-xs text-muted-foreground">
        Les acteurs chez qui on retrouve les mêmes groupes{showAll ? '' : ' (au moins 2 en commun)'}. Un nom ici, c’est une porte d’entrée ou une référence à citer.
      </p>
      <div className="space-y-3">
        {groups.map(({ kind, rows }) => {
          const more = open.has(kind);
          return (
            <div key={kind} className="rounded-lg border border-border">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <span className="text-sm font-medium">{relationTitle(e.kind, kind)}</span>
                <KindBadge kind={kind} />
              </div>
              <ul className="divide-y divide-border/60">
                {rows.slice(0, more ? undefined : 6).map((l) => (
                  <li key={l.key} className="px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => onEntity(l.key)} className="min-w-0 text-left text-sm font-medium hover:underline">
                        {l.ent.name}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {[l.ent.city, l.ent.capacity ? `~${l.ent.capacity} pl.` : null].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                      <Badge
                        className={cn(l.bands.length >= 2 ? 'border-primary/40 text-primary' : 'text-muted-foreground')}
                        title="Groupes en commun"
                      >
                        {l.bands.length} en commun
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.bands.map((id) => (
                        <button
                          key={id}
                          onClick={() => onBand(id)}
                          className={cn('rounded bg-secondary px-1.5 py-0.5 text-xs hover:underline', bands.get(id)?.scene === 'lyon' && 'text-primary')}
                        >
                          {bands.get(id)?.name ?? id}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              {rows.length > 6 && (
                <button
                  onClick={() => {
                    const s = new Set(open);
                    if (more) s.delete(kind);
                    else s.add(kind);
                    setOpen(s);
                  }}
                  className="w-full border-t border-border px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
                >
                  {more ? 'Réduire' : `Voir les ${rows.length - 6} autres`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {strong.length > 0 && links.length > strong.length && (
        <button onClick={() => setAll(!all)} className="mt-2 text-xs text-primary hover:underline">
          {all ? 'Seulement les liens forts (≥ 2 groupes)' : `Afficher aussi les liens à 1 groupe (${links.length - strong.length})`}
        </button>
      )}
    </section>
  );
}
