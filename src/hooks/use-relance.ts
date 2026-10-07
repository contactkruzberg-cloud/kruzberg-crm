'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { relanceDocId, type RelanceDoc } from '@/lib/relance/prompt';

// Follow-up requests / drafts (radar outbox, kind "relance"), shared by every
// "Relancer" button: one query, polled fast while Claude is writing one.

interface Doc {
  id: string;
  data: Record<string, unknown>;
  version: number;
}

const KEY = ['relances'];

export function useRelanceDocs() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch('/api/radar/docs?collection=outbox');
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const { docs } = (await res.json()) as { docs: Doc[] };
      return new Map(docs.filter((d) => d.data.kind === 'relance').map((d) => [d.data.dealId as string, d.data as unknown as RelanceDoc]));
    },
    refetchInterval: (q) => ([...(q.state.data?.values() ?? [])].some((d) => d.state === 'requested') ? 5_000 : 60_000),
  });
}

export function useRelanceDoc(dealId: string) {
  return useRelanceDocs().data?.get(dealId);
}

/** Ask Claude for a (new) follow-up: the CRM gathers the context, the routine writes it. */
export function useRequestRelance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, note }: { dealId: string; note?: string }) => {
      const res = await fetch('/api/relance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dealId, note }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Erreur ${res.status}`);
      return body as RelanceDoc & { woke: boolean };
    },
    onSuccess: (doc) => qc.setQueryData<Map<string, RelanceDoc>>(KEY, (m) => new Map(m ?? []).set(doc.dealId, doc)),
  });
}

/** Mark the draft as sent (it stops showing as "Relance prête"). */
export function useMarkRelanceSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dealId: string) => {
      const res = await fetch('/api/radar/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'update', collection: 'outbox', id: relanceDocId(dealId), data: { state: 'sent', sentAt: new Date().toISOString() } }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
