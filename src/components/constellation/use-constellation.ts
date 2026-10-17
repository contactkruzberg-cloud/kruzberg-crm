'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aggregate, type CrmKnown } from '@/lib/constellation/aggregate';
import type { Band, Db, Entity, EntityKind, EntityOverride, Finding, Job, Synthesis, Watch } from '@/lib/constellation/types';
import { unpackFindings, unslimBand, type BandExtra, type Facts, type PackedFindings, type SlimBand } from '@/lib/constellation/wire';

export interface Routine {
  configured: boolean;
  error?: string;
  sessionUrl?: string;
  activeAt?: string;
}

export interface State {
  /** Change à chaque modification de la constellation. */
  stamp: string;
  bands: Band[];
  entities: Entity[];
  hidden: { key: string; name: string; kind: EntityKind }[];
  jobs: Job[];
  crmCount: number;
  synthesis?: Synthesis;
  routine: Routine;
}

interface Wire {
  stamp: string;
  bands: SlimBand[];
  findings: PackedFindings;
  overrides: Record<string, EntityOverride>;
  watch: Watch[];
  jobs: Job[];
  crm: CrmKnown;
  synthesis?: Synthesis;
  routine: Routine;
}

type Raw = Omit<Wire, 'bands' | 'findings'> & { bands: Band[]; findings: Finding[] };

const URL = '/api/constellation/state';

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Erreur ${r.status}`);
  return j as T;
}

// Le serveur envoie les données allégées (wire.ts) ; le classement est calculé ici. Pendant
// les recherches, on n'interroge que la file (léger) et on ne recharge tout
// que si quelque chose a changé.
export function useConstellation() {
  const [raw, setRaw] = useState<Raw | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stamp = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const w = await fetchJson<Wire>(URL);
      const d: Raw = { ...w, bands: w.bands.map(unslimBand), findings: unpackFindings(w.findings) };
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
      stamp: raw.stamp,
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

export interface Detail {
  /** Résumé, leçon et étapes sourcées (fiche d'un groupe). */
  band?: BandExtra;
  /** Contexte et source des faits, par id de fait. */
  facts: Facts;
}

/**
 * Ce que la fiche d'un groupe (?band=) ou d'un acteur (?entity=) charge à son
 * ouverture, rechargé quand la constellation change (stamp).
 */
export function useDetail(query: { band: string } | { entity: string }, stamp: string) {
  const qs = new URLSearchParams(query).toString();
  const [got, setGot] = useState<{ qs: string; stamp: string; detail?: Detail; error?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchJson<Detail>(`/api/constellation/detail?${qs}`).then(
      (detail) => alive && setGot({ qs, stamp, detail }),
      (e) => alive && setGot({ qs, stamp, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [qs, stamp]);
  // L'ancienne fiche reste affichée pendant le rechargement, pas celle d'un autre groupe.
  const mine = got?.qs === qs ? got : null;
  return { detail: mine?.detail, error: mine?.error, loading: !mine || mine.stamp !== stamp };
}
