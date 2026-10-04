'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { Band, BandRole, DealBand } from '@/types/database';
import { archiveEntity, undoToast } from '@/lib/archive';
import { SAVE_META } from '@/lib/save-status';

export function useBands() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['bands'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bands').select('*').order('name');
      if (error) throw error;
      return data as Band[];
    },
  });
}

export function useCreateBand() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (band: Partial<Band>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase.from('bands').insert({ ...band, user_id: user.id }).select().single();
      if (error) throw error;
      return data as Band;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bands'] }),
  });
}

export function useUpdateBand() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    meta: SAVE_META,
    mutationFn: async ({ id, ...updates }: Partial<Band> & { id: string }) => {
      const { data, error } = await supabase.from('bands').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data as Band;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bands'] }),
  });
}

export function useDeleteBand() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    // Archive (restorable), never a hard delete: see src/lib/archive.ts.
    mutationFn: async (id: string) => archiveEntity(supabase, 'band', id),
    onSuccess: (batch) => {
      queryClient.invalidateQueries();
      undoToast(supabase, queryClient, 'Groupe supprimé', batch);
    },
  });
}

/** Bands on a deal's bill, or (bandId) deals played with a band. */
export function useDealBands(filter: { dealId?: string; bandId?: string }) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['deal_bands', filter],
    queryFn: async () => {
      let q = supabase
        .from('deal_bands')
        .select('*, band:bands(*), deal:deals(*, venue:venues(*), contact:contacts(*))')
        .is('deleted_at', null);
      if (filter.dealId) q = q.eq('deal_id', filter.dealId);
      if (filter.bandId) q = q.eq('band_id', filter.bandId);
      const { data, error } = await q.order('created_at');
      if (error) throw error;
      // Archived bands/deals come back as null through RLS: hide those links.
      return (data as DealBand[]).filter((l) => l.band && l.deal);
    },
    enabled: !!(filter.dealId || filter.bandId),
  });
}

export function useLinkBand() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, bandId, role }: { dealId: string; bandId: string; role: BandRole }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('deal_bands')
        .upsert({ deal_id: dealId, band_id: bandId, role, user_id: user.id, deleted_at: null }, { onConflict: 'deal_id,band_id' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deal_bands'] }),
  });
}

export function useUnlinkBand() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from('deal_bands').delete().eq('id', linkId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deal_bands'] }),
  });
}
