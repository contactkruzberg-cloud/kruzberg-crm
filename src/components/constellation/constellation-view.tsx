'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link2, ListOrdered, Loader2, Orbit, Sparkles, Trophy, Users } from 'lucide-react';
import { bandLinks, entityLinks, entityPairs } from '@/lib/constellation/links';
import { BandsTab } from './bands-tab';
import { EntityPanel } from './entity-panel';
import { BandPanel } from './band-panel';
import { Graph } from './graph';
import { ImportButton } from './import-button';
import { JobsMenu } from './jobs-menu';
import { LinksTab } from './links-tab';
import { Patterns } from './patterns';
import { Ranking } from './ranking';
import { cn } from './ui';
import { useConstellation, type Routine } from './use-constellation';

type Tab = 'ranking' | 'links' | 'graph' | 'patterns' | 'bands';

export function ConstellationView() {
  const { data, error, act, reload } = useConstellation();
  const [tab, setTab] = useState<Tab>('ranking');
  const [entityKey, setEntityKey] = useState<string | null>(null);
  const [bandId, setBandId] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!data) return null;
    const active = data.bands.filter((b) => !['suggested', 'rejected'].includes(b.status));
    const explored = active.filter((b) => b.status === 'done').length;
    const signals = data.entities.filter((e) => e.bandIds.length >= 2).length;
    const suggested = data.bands.filter((b) => b.status === 'suggested').length;
    return { active: active.length, explored, signals, actors: data.entities.filter((e) => e.bandIds.length).length, suggested };
  }, [data]);

  const links = useMemo(() => {
    if (!data) return null;
    const pairs = entityPairs(data.entities);
    return { pairs, byEntity: entityLinks(pairs), byBand: bandLinks(data.entities, data.bands) };
  }, [data]);

  const entity = data?.entities.find((e) => e.key === entityKey) ?? null;
  const band = data?.bands.find((b) => b.id === bandId) ?? null;
  const running = data?.jobs.filter((j) => j.status === 'running') ?? [];
  const queued = data?.jobs.filter((j) => j.status === 'queued') ?? [];

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      setEntityKey(null);
      setBandId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openEntity = (k: string) => {
    setBandId(null);
    setEntityKey(k);
  };
  const openBand = (id: string) => {
    setEntityKey(null);
    setBandId(id);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            <Orbit className="size-3.5 text-primary" /> KRUZBERG · Réseau
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Constellation</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Les noms qui reviennent chez les groupes de notre niche post-punk. <span className="text-foreground/80">« Si on voit le nom d’un même tourneur écrit plusieurs fois chez les groupes de notre niche, c’est qu’il y a quelque chose à faire avec lui. »</span> — Francis
          </p>
        </div>
        <div className="flex items-center gap-2">
          {running.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Loader2 className="size-3.5 animate-spin" /> {running.length} recherche{running.length > 1 ? 's' : ''} en cours
              {queued.length > 0 && <span className="text-primary/70">· {queued.length} en attente</span>}
            </span>
          )}
          <ImportButton onDone={() => void reload()} />
          {data && <JobsMenu jobs={data.jobs} onCancel={(id) => act({ type: 'cancelJob', id })} />}
        </div>
      </header>

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Groupes explorés" value={`${stats.explored} / ${stats.active}`} />
          <Stat label="Acteurs relevés" value={stats.actors} />
          <Stat label="Signaux (≥ 2 groupes)" value={stats.signals} accent />
          <Stat label="Groupes suggérés à trier" value={stats.suggested} />
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        <TabBtn on={tab === 'ranking'} onClick={() => setTab('ranking')} icon={<ListOrdered className="size-4" />}>
          Classement
        </TabBtn>
        <TabBtn on={tab === 'links'} onClick={() => setTab('links')} icon={<Link2 className="size-4" />}>
          Liens
        </TabBtn>
        <TabBtn on={tab === 'graph'} onClick={() => setTab('graph')} icon={<Sparkles className="size-4" />}>
          Carte
        </TabBtn>
        <TabBtn on={tab === 'patterns'} onClick={() => setTab('patterns')} icon={<Trophy className="size-4" />}>
          Parcours de réussite
        </TabBtn>
        <TabBtn on={tab === 'bands'} onClick={() => setTab('bands')} icon={<Users className="size-4" />}>
          Groupes {stats?.suggested ? <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{stats.suggested}</span> : null}
        </TabBtn>
      </nav>

      {data && <RoutineNotice routine={data.routine} pending={queued.length + running.length} />}

      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">Serveur injoignable : {error}</p>}
      {!data || !links ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <main className="flex-1">
          {tab === 'ranking' && <Ranking data={data} onOpen={openEntity} onBand={openBand} selected={entityKey} goBands={() => setTab('bands')} />}
          {tab === 'links' && <LinksTab data={data} pairs={links.pairs} onEntity={openEntity} onBand={openBand} />}
          {tab === 'graph' && <Graph data={data} pairs={links.pairs} onEntity={openEntity} onBand={openBand} selected={entityKey ?? bandId} />}
          {tab === 'patterns' && <Patterns data={data} act={act} onBand={openBand} />}
          {tab === 'bands' && <BandsTab data={data} act={act} onOpen={openBand} />}
        </main>
      )}

      {entity && data && links && (
        <EntityPanel entity={entity} data={data} act={act} links={links.byEntity} onClose={() => setEntityKey(null)} onBand={openBand} onEntity={openEntity} />
      )}
      {band && data && links && (
        <BandPanel band={band} data={data} act={act} near={links.byBand.get(band.id) ?? []} onClose={() => setBandId(null)} onEntity={openEntity} onBand={openBand} />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-xl font-semibold tabular-nums', accent && 'text-primary')}>{value}</div>
    </div>
  );
}

function TabBtn({ on, children, icon, onClick }: { on: boolean; children: React.ReactNode; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
        on ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** Les recherches tournent dans une routine Claude réveillée par le CRM : on dit quand elle ne peut pas tourner. */
function RoutineNotice({ routine, pending }: { routine: Routine; pending: number }) {
  if (!pending && !routine.error) return null;
  if (!routine.configured)
    return (
      <p className="rounded-md border border-[hsl(var(--status-warning))]/40 bg-[hsl(var(--status-warning))]/10 px-3 py-2 text-sm">
        {pending} recherche{pending > 1 ? 's' : ''} en attente : la routine Constellation n’est pas encore configurée (CONSTELLATION_ROUTINE_ID / CONSTELLATION_ROUTINE_TOKEN).
      </p>
    );
  if (routine.error)
    return <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{routine.error}</p>;
  return routine.sessionUrl ? (
    <p className="text-xs text-muted-foreground">
      Les recherches tournent dans la routine Constellation (2 à 6 min par groupe).{' '}
      <a href={routine.sessionUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
        Suivre la dernière session
      </a>
    </p>
  ) : null;
}
