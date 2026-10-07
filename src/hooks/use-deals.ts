'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSupabase } from './use-supabase';
import type { Deal, RelanceMethod } from '@/types/database';
import { RELANCE_METHODS } from '@/types/database';
import { toast } from 'sonner';
import { archiveEntity, restoreBatch, undoToast } from '@/lib/archive';
import { SAVE_META } from '@/lib/save-status';

export function useDeals() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['deals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('*, venue:venues(*), contact:contacts(*)')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
      if (error) throw error;
      return data as Deal[];
    },
  });
}

export function useDeal(id: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['deals', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('*, venue:venues(*), contact:contacts(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Deal;
    },
    enabled: !!id,
  });
}

export function useCreateDeal() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (deal: Partial<Deal>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('deals')
        .insert({ ...deal, user_id: user.id })
        .select('*, venue:venues(*), contact:contacts(*)')
        .single();
      if (error) throw error;
      return data as Deal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

export function useUpdateDeal() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    meta: SAVE_META,
    mutationFn: async ({ id, ...updates }: Partial<Deal> & { id: string }) => {
      const { data, error } = await supabase
        .from('deals')
        .update(updates)
        .eq('id', id)
        .select('*, venue:venues(*), contact:contacts(*)')
        .single();
      if (error) throw error;
      return data as Deal;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: ['deals'] });
      const previousDeals = queryClient.getQueryData<Deal[]>(['deals']);
      queryClient.setQueryData<Deal[]>(['deals'], (old) =>
        old?.map((d) => (d.id === id ? { ...d, ...updates } : d))
      );
      return { previousDeals };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousDeals) {
        queryClient.setQueryData(['deals'], context.previousDeals);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

export function useDeleteDeal() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    // Archive (restorable), never a hard delete: see src/lib/archive.ts.
    mutationFn: async (id: string) => archiveEntity(supabase, 'deal', id),
    onSuccess: (batch) => {
      queryClient.invalidateQueries();
      undoToast(supabase, queryClient, 'Opportunité supprimée', batch);
    },
  });
}

const OPEN_STAGES_FOR_CONTACT = ['a_contacter', 'contacte', 'relance', 'repondu', 'a_suivre'];
const NEXT_STAGE: Partial<Record<Deal['stage'], Deal['stage']>> = { a_contacter: 'contacte', contacte: 'relance' };

/**
 * One-click "Contacté / Relancé" from the pipeline: logs the action (with its
 * channel) in the history, advances the stage (à contacter → contacté →
 * relancé), updates the last-contact dates and schedules the next follow-up
 * in 7 days.
 */
/**
 * Logs a contact / follow-up (with its channel) in the history, advances the
 * stage (à contacter → contacté → relancé), updates the last-contact dates and
 * schedules the next follow-up in 7 days.
 */
async function recordRelance(supabase: SupabaseClient, userId: string, deal: Deal, channel: RelanceMethod) {
  const now = new Date();
  const first = deal.stage === 'a_contacter' || !deal.first_contact_at;
  const channelLabel = RELANCE_METHODS.find((m) => m.key === channel)?.label ?? channel;
  const type = deal.stage === 'a_contacter' ? (channel === 'email' ? 'email_sent' : channel === 'phone' ? 'call' : 'message') : 'relance';
  const { error: actError } = await supabase.from('activities').insert({
    user_id: userId,
    deal_id: deal.id,
    venue_id: deal.venue_id,
    contact_id: deal.contact_id,
    type,
    channel,
    content: `${deal.stage === 'a_contacter' ? 'Premier contact' : 'Relance'} (${channelLabel})`,
  });
  if (actError) throw actError;
  const { error } = await supabase
    .from('deals')
    .update({
      stage: NEXT_STAGE[deal.stage] ?? deal.stage,
      last_message_at: now.toISOString(),
      ...(first && !deal.first_contact_at ? { first_contact_at: now.toISOString() } : {}),
      last_relance_method: channel,
      next_relance_at: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    })
    .eq('id', deal.id);
  if (error) throw error;
  return { first, channelLabel };
}

/** One-click "Contacté / Relancé" from the pipeline (see recordRelance). */
export function useQuickRelance() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deal, channel }: { deal: Deal; channel: RelanceMethod }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      return recordRelance(supabase, user.id, deal, channel);
    },
    onSuccess: ({ first, channelLabel }) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      toast.success(`${first ? 'Premier contact' : 'Relance'} noté (${channelLabel}) — prochaine relance dans 7 j`);
    },
    onError: () => toast.error("Impossible d'enregistrer la relance"),
  });
}

/** "Contacté / Relancé via…" for several deals at once (selection in the pipeline). */
export function useBulkQuickRelance() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deals, channel }: { deals: Deal[]; channel: RelanceMethod }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      let done = 0;
      for (const deal of deals.filter(canQuickRelance)) {
        await recordRelance(supabase, user.id, deal, channel);
        done++;
      }
      return { done, skipped: deals.length - done, channel };
    },
    onSuccess: ({ done, skipped, channel }) => {
      const label = RELANCE_METHODS.find((m) => m.key === channel)?.label ?? channel;
      toast.success(`${done} contact${done > 1 ? 's' : ''} noté${done > 1 ? 's' : ''} (${label}) — prochaine relance dans 7 j`, {
        description: skipped ? `${skipped} ignorée${skipped > 1 ? 's' : ''} (étape confirmé / terminé / refusé).` : undefined,
      });
    },
    onError: () => toast.error("Impossible d'enregistrer tous les contacts"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

type DealPatch = Partial<Omit<Deal, 'id' | 'venue' | 'contact'>>;

/** Sends one UPDATE per distinct patch (deals sharing the same patch go together). */
async function applyPatches(supabase: SupabaseClient, patches: { id: string; patch: DealPatch }[]) {
  const groups = new Map<string, { patch: DealPatch; ids: string[] }>();
  for (const { id, patch } of patches) {
    const key = JSON.stringify(patch);
    const g = groups.get(key) ?? { patch, ids: [] };
    g.ids.push(id);
    groups.set(key, g);
  }
  for (const { patch, ids } of groups.values()) {
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from('deals').update(patch).in('id', ids.slice(i, i + 100));
      if (error) throw error;
    }
  }
}

/**
 * Mass update from the pipeline selection. `patch` is either the same change
 * for every deal, or computed per deal (e.g. adding a tag). The toast offers
 * "Annuler", which puts back the previous values of the changed fields.
 */
export function useBulkUpdateDeals() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    meta: SAVE_META,
    mutationFn: async ({ deals, patch }: { deals: Deal[]; patch: DealPatch | ((deal: Deal) => DealPatch | null); message: string }) => {
      const changes = deals
        .map((deal) => ({ deal, patch: typeof patch === 'function' ? patch(deal) : patch }))
        .filter((c): c is { deal: Deal; patch: DealPatch } => !!c.patch && Object.keys(c.patch).length > 0);
      // The relance date can be recomputed by a DB trigger when the stage changes: keep it for the undo.
      const undo = changes.map(({ deal, patch: p }) => {
        const keys = [...Object.keys(p), ...('stage' in p ? ['next_relance_at'] : [])] as (keyof DealPatch)[];
        return { id: deal.id, patch: Object.fromEntries(keys.map((k) => [k, deal[k] ?? null])) as DealPatch };
      });
      await applyPatches(supabase, changes.map(({ deal, patch: p }) => ({ id: deal.id, patch: p })));
      return { count: changes.length, undo };
    },
    onMutate: async ({ deals, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['deals'] });
      const previousDeals = queryClient.getQueryData<Deal[]>(['deals']);
      const byId = new Map(deals.map((d) => [d.id, d]));
      queryClient.setQueryData<Deal[]>(['deals'], (old) =>
        old?.map((d) => {
          if (!byId.has(d.id)) return d;
          const p = typeof patch === 'function' ? patch(d) : patch;
          return p ? { ...d, ...p } : d;
        })
      );
      return { previousDeals };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousDeals) queryClient.setQueryData(['deals'], context.previousDeals);
      toast.error('Impossible de modifier les opportunités sélectionnées');
    },
    onSuccess: ({ count, undo }, { message }) => {
      toast.success(`${message} — ${count} opportunité${count > 1 ? 's' : ''}`, {
        duration: 10_000,
        action: {
          label: 'Annuler',
          onClick: async () => {
            try {
              await applyPatches(supabase, undo);
              await queryClient.invalidateQueries({ queryKey: ['deals'] });
              queryClient.invalidateQueries({ queryKey: ['activities'] });
              toast.success('Modification annulée');
            } catch {
              toast.error("Impossible d'annuler");
            }
          },
        },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Archive several deals (restorable); one undo restores them all. */
export function useBulkArchiveDeals() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const batches: string[] = [];
      for (const id of ids) batches.push(await archiveEntity(supabase, 'deal', id));
      return batches;
    },
    onSuccess: (batches) => {
      toast.success(`${batches.length} opportunité${batches.length > 1 ? 's' : ''} supprimée${batches.length > 1 ? 's' : ''}`, {
        duration: 10_000,
        description: 'Récupérables aussi dans Réglages → Corbeille.',
        action: {
          label: 'Annuler',
          onClick: async () => {
            try {
              for (const b of batches) await restoreBatch(supabase, b);
              await queryClient.invalidateQueries();
              toast.success('Restauré');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Restauration impossible');
            }
          },
        },
      });
    },
    onError: () => toast.error('Impossible de supprimer toutes les opportunités'),
    onSettled: () => queryClient.invalidateQueries(),
  });
}

/** Push the next follow-up back by N days from today. */
export function useSnoozeRelance() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, days }: { dealId: string; days: number }) => {
      const { error } = await supabase
        .from('deals')
        .update({ next_relance_at: new Date(Date.now() + days * 86_400_000).toISOString() })
        .eq('id', dealId);
      if (error) throw error;
      return days;
    },
    onSuccess: (days) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success(`Relance reportée de ${days} jours`);
    },
    onError: () => toast.error('Impossible de reporter la relance'),
  });
}

export const canQuickRelance = (deal: Deal) => OPEN_STAGES_FOR_CONTACT.includes(deal.stage);
