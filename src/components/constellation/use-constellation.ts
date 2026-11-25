'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aggregate, type CrmKnown } from '@/lib/constellation/aggregate';
import { emergingOnly } from '@/lib/constellation/tier';
import type { Band, Db, Entity, EntityKind, EntityOverride, Finding, Job, Synthesis, Watch } from '@/lib/constellation/types';

export interface Routine {
  configured: boolean;
  error?: string;
  sessionUrl?: string;
  activeAt?: string;
}

export interface State {
  bands: Band[];
  entities: Entity[];
  /** Le même classement, calculé seulement sur les groupes émergents. */
  entitiesEmerging: Entity[];
  hidden: { key: string; name: string; kind: EntityKind }[];
  jobs: Job[];
  crmCount: number;
  synthesis?: Synthesis;
  routine: Routine;
}

interface Raw {
  stamp: string;
  bands: Band[];
  findings: Finding[];
  overrides: Record<string, EntityOverride>;
  watch: Watch[];
  jobs: Job[];
  crm: CrmKnown;
  synthesis?: Synthesis;
  routine: Routine;
}

const URL = '/api/constellation/state';

// Le serveur envoie les données brutes ; le classement est calculé ici. Pendant
// les recherches, on n'interroge que la file (léger) et on ne recharge tout
// que si quelque chose a changé.
export function useConstellation() {
  const [raw, setRaw] = useState<Omit<Raw, 'jobs' | 'routine'> | null>(null);
  // The queue changes often: kept apart so the ranking is not recomputed each time.
  const [queue, setQueue] = useState<Pick<Raw, 'jobs' | 'routine'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stamp = useRef<string | null>(null);

  const fetchJson = async <T>(url: string): Promise<T> => {
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { error?: string }).error ?? `Erreur ${r.status}`);
    return j as T;
  };

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<Raw>(URL);
      stamp.current = d.stamp;
      const { jobs, routine, ...core } = d;
      setRaw(core);
      setQueue({ jobs, routine });
      setError(null);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const poll = useCallback(async () => {
    if (!stamp.current) return load();
    try {
      const d = await fetchJson<Pick<Raw, 'stamp' | 'jobs' | 'routine'>>(`${URL}?light=1`);
      if (d.stamp !== stamp.current) return load();
      setQueue({ jobs: d.jobs, routine: d.routine });
      setError(null);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [load]);

  // Rafraîchit souvent pendant une recherche, rarement sinon.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const d = await poll();
      if (!alive) return;
      const busy = d?.jobs.some((j) => j.status === 'queued' || j.status === 'running');
      timer.current = setTimeout(tick, busy ? 8000 : 30000);
    };
    void tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  // The ranking: computed once per change of the network, not of the queue.
  const core = useMemo(() => {
    if (!raw) return null;
    const db: Db = { version: 1, bands: raw.bands, findings: raw.findings, overrides: raw.overrides, watch: raw.watch, jobs: [], synthesis: raw.synthesis };
    const withHidden = aggregate(db, raw.crm, { includeHidden: true });
    return {
      bands: raw.bands,
      entities: withHidden.filter((e) => !raw.overrides[e.key]?.hidden),
      entitiesEmerging: aggregate(emergingOnly(db), raw.crm),
      hidden: withHidden.filter((e) => raw.overrides[e.key]?.hidden).map((e) => ({ key: e.key, name: e.name, kind: e.kind })),
      crmCount: Object.keys(raw.crm).length,
      synthesis: raw.synthesis,
    };
  }, [raw]);
  const data = useMemo<State | null>(() => (core && queue ? { ...core, jobs: queue.jobs, routine: queue.routine } : null), [core, queue]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await fetch('/api/constellation/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      // Reloads everything only if the network changed (a queued search just updates the queue).
      await poll();
      if (!r.ok) throw new Error(j.error ?? 'Erreur');
      return j;
    },
    [poll],
  );

  return { data, error, act, reload: load };
}
