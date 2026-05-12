'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { Deal } from '@/types/database';
import { RELANCE_METHODS, STAGES } from '@/types/database';

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
    mutationFn: async (id: string) => {
      // Capture deal-level data as a final note activity before deletion,
      // so the venue/contact still has a record of the relationship.
      const { data: deal } = await supabase
        .from('deals')
        .select('*')
        .eq('id', id)
        .single();

      if (deal) {
        const stageLabel = STAGES.find((s) => s.key === deal.stage)?.label || deal.stage;
        const lines: string[] = [`Opportunité supprimée (stage final : ${stageLabel})`];

        if (deal.last_message_at) {
          const dateStr = new Date(deal.last_message_at).toLocaleDateString('fr-FR');
          const methodLabel = deal.last_relance_method
            ? RELANCE_METHODS.find((m) => m.key === deal.last_relance_method)?.label
            : null;
          lines.push(`Dernière relance : ${dateStr}${methodLabel ? ` (${methodLabel})` : ''}`);
        }
        if (deal.concert_date) {
          lines.push(`Date de concert : ${new Date(deal.concert_date).toLocaleDateString('fr-FR')}`);
        }
        if (deal.fee != null) {
          lines.push(`Cachet : ${deal.fee}€`);
        }
        if (deal.notes) {
          lines.push(`Notes : ${deal.notes}`);
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('activities').insert({
            user_id: user.id,
            deal_id: null,
            venue_id: deal.venue_id,
            contact_id: deal.contact_id,
            type: 'note',
            content: lines.join('\n'),
          });
        }
      }

      const { error } = await supabase.from('deals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}
