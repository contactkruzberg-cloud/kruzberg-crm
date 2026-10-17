'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aggregate, type CrmKnown } from '@/lib/constellation/aggregate';
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
  const [raw, setRaw] = useState<Raw | null>(null);
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
      setRaw(d);
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
      setRaw((r) => (r ? { ...r, jobs: d.jobs, routine: d.routine } : r));
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

  const data = useMemo<State | null>(() => {
    if (!raw) return null;
    const db: Db = { version: 1, bands: raw.bands, findings: raw.findings, overrides: raw.overrides, watch: raw.watch, jobs: raw.jobs, synthesis: raw.synthesis };
    return {
      bands: raw.bands,
      entities: aggregate(db, raw.crm),
      hidden: aggregate(db, raw.crm, { includeHidden: true })
        .filter((e) => raw.overrides[e.key]?.hidden)
        .map((e) => ({ key: e.key, name: e.name, kind: e.kind })),
      jobs: raw.jobs,
      crmCount: Object.keys(raw.crm).length,
      synthesis: raw.synthesis,
      routine: raw.routine,
    };
  }, [raw]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await fetch('/api/constellation/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      await load();
      if (!r.ok) throw new Error(j.error ?? 'Erreur');
      return j;
    },
    [load],
  );

  return { data, error, act, reload: load };
}
