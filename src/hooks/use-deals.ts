'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { Deal, RelanceMethod } from '@/types/database';
import { RELANCE_METHODS } from '@/types/database';
import { toast } from 'sonner';
import { archiveEntity, undoToast } from '@/lib/archive';
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
export function useQuickRelance() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deal, channel }: { deal: Deal; channel: RelanceMethod }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const now = new Date();
      const first = deal.stage === 'a_contacter' || !deal.first_contact_at;
      const channelLabel = RELANCE_METHODS.find((m) => m.key === channel)?.label ?? channel;
      const type = deal.stage === 'a_contacter' ? (channel === 'email' ? 'email_sent' : channel === 'phone' ? 'call' : 'message') : 'relance';
      const { error: actError } = await supabase.from('activities').insert({
        user_id: user.id,
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
    },
    onSuccess: ({ first, channelLabel }) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      toast.success(`${first ? 'Premier contact' : 'Relance'} noté (${channelLabel}) — prochaine relance dans 7 j`);
    },
    onError: () => toast.error("Impossible d'enregistrer la relance"),
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
