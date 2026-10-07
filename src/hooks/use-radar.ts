'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { crmInput, STATUS_TO_STAGE, today } from '@/lib/radar/logic';
import { markKnown, type KnownData } from '@/lib/radar/known';
import type { GeoCache } from '@/lib/radar/geo';
import type { Lead, OutboxItem, RadarLearned, RadarMeta, RadarRun, RadarScope } from '@/lib/radar/types';

// Booking Radar data (table radar_docs via /api/radar/*). Refreshed every 30 s:
// the hourly sync with the claude.ai artifact and the daily search write too.

type Collection = 'leads' | 'config' | 'runs' | 'outbox';
interface Doc {
  id: string;
  data: Record<string, unknown>;
  version: number;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && (body.message || body.error)) || `Erreur ${res.status}`);
  return body as T;
}

function useCollection(collection: Collection) {
  return useQuery({
    queryKey: ['radar', collection],
    queryFn: async () => (await api<{ docs: Doc[] }>(`/api/radar/docs?collection=${collection}`)).docs,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** Anti-duplicate scan (CRM + booking@ sent mail), refreshed every 10 min. */
export function useRadarKnown() {
  return useQuery({
    queryKey: ['radar', 'known'],
    queryFn: () => api<KnownData>('/api/radar/known'),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

export function useRadar() {
  const leads = useCollection('leads');
  const known = useRadarKnown();
  const config = useCollection('config');
  const runs = useCollection('runs');
  const outbox = useCollection('outbox');
  const configById = new Map((config.data ?? []).map((d) => [d.id, d.data]));
  return {
    isLoading: leads.isLoading,
    error: leads.error,
    leads: markKnown(
      (leads.data ?? []).map((d) => ({ ...(d.data as Omit<Lead, 'id'>), id: d.id }) as Lead),
      known.data,
    ),
    known: known.data,
    knownError: known.error,
    meta: (configById.get('meta') ?? {}) as RadarMeta,
    scope: (configById.get('scope') ?? {}) as RadarScope,
    learned: (configById.get('learned') ?? {}) as RadarLearned,
    /** City coordinates for the map (see src/lib/radar/geo.ts). */
    geo: (configById.get('geo') ?? {}) as GeoCache,
    geoExists: configById.has('geo'),
    runs: ((runs.data ?? []).map((d) => ({ ...d.data, id: d.id })) as unknown as (RadarRun & { id: string })[])
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id.localeCompare(a.id))
      .slice(0, 90),
    outbox: (outbox.data ?? []).map((d) => ({ ...(d.data as Omit<OutboxItem, 'id'>), id: d.id }) as OutboxItem).filter((o) => o.state === 'pending' && (o as { kind?: string }).kind !== 'relance'),
  };
}

/** Writes to the radar store, applied to the cache immediately (no waiting on the network). */
export function useRadarWrite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (w: { op: 'update' | 'set' | 'add'; collection: Collection; id?: string; data: Record<string, unknown> }) =>
      api<{ id: string; version: number }>('/api/radar/docs', { method: 'POST', body: JSON.stringify(w) }),
    onMutate: async (w) => {
      if (w.op === 'add' || !w.id) return;
      await qc.cancelQueries({ queryKey: ['radar', w.collection] });
      qc.setQueryData<Doc[]>(['radar', w.collection], (docs = []) => {
        const exists = docs.some((d) => d.id === w.id);
        if (!exists) return [...docs, { id: w.id!, data: w.data, version: 1 }];
        return docs.map((d) => (d.id === w.id ? { ...d, data: w.op === 'set' ? w.data : { ...d.data, ...w.data } } : d));
      });
    },
    onError: (err) => toast.error(`Échec de l'enregistrement : ${err instanceof Error ? err.message : ''}`),
    onSettled: (_r, _e, w) => qc.invalidateQueries({ queryKey: ['radar', w.collection] }),
  });
}

interface CrmResult {
  id: string;
  created?: boolean;
  stage: string;
  url: string;
}

/**
 * Radar → pipeline. With a deal already linked: update_stage; otherwise
 * add_to_pipeline (idempotent on the radar id). Then stores the CRM link on the lead.
 */
export function useRadarCrm() {
  const write = useRadarWrite();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lead, stage, note, statusLabel }: { lead: Lead; stage?: string; note?: string; statusLabel?: string }) => {
      let res: CrmResult;
      if (lead.crmId && stage) {
        res = await api<CrmResult>('/api/radar/crm', {
          method: 'POST',
          body: JSON.stringify({ tool: 'update_stage', args: { id: lead.crmId, stage, ...(note ? { note: note.slice(0, 2000) } : {}) } }),
        });
        res = { ...res, url: lead.crmUrl || res.url };
      } else {
        const input = crmInput(statusLabel ? { ...lead, status: statusLabel } : lead);
        if (stage) input.stage = stage;
        if (note) input.radar_status = note.slice(0, 100);
        res = await api<CrmResult>('/api/radar/crm', { method: 'POST', body: JSON.stringify({ tool: 'add_to_pipeline', args: input }) });
      }
      await write.mutateAsync({
        op: 'update',
        collection: 'leads',
        id: lead.id,
        data: { crmId: res.id || lead.crmId || '', crmUrl: res.url || lead.crmUrl || '', crmStage: res.stage || stage || '', crmAt: today() },
      });
      return res;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['deals'] });
      void qc.invalidateQueries({ queryKey: ['radar', 'known'] });
    },
  });
}

export const stageForStatus = (status: string) => STATUS_TO_STAGE[status];
