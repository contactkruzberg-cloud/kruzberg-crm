'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { TourStop } from '@/types/database';

const STOP_SELECT =
  '*, deal:deals(*, venue:venues(*), contact:contacts(*)), venue:venues(*)';

export function useTourStops(tourId: string | null) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['tour_stops', tourId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tour_stops')
        .select(STOP_SELECT)
        .eq('tour_id', tourId!)
        .order('order_index', { ascending: true })
        .order('stop_date', { ascending: true });
      if (error) throw error;
      return data as TourStop[];
    },
    enabled: !!tourId,
  });
}

/** All stops across every tour — used by the tour list to show km/dates per card. */
export function useAllTourStops() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['tour_stops'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tour_stops')
        .select(STOP_SELECT)
        .order('order_index', { ascending: true });
      if (error) throw error;
      return data as TourStop[];
    },
  });
}

export function useCreateTourStop() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (stop: Partial<TourStop>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('tour_stops')
        .insert({ ...stop, user_id: user.id })
        .select(STOP_SELECT)
        .single();
      if (error) throw error;
      return data as TourStop;
    },
    onSuccess: (stop) => {
      queryClient.invalidateQueries({ queryKey: ['tour_stops', stop.tour_id] });
    },
  });
}

export function useUpdateTourStop() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TourStop> & { id: string }) => {
      const { data, error } = await supabase
        .from('tour_stops')
        .update(updates)
        .eq('id', id)
        .select(STOP_SELECT)
        .single();
      if (error) throw error;
      return data as TourStop;
    },
    onMutate: async ({ id, ...updates }) => {
      // Optimistic update against whichever tour list holds this stop.
      const queries = queryClient.getQueriesData<TourStop[]>({ queryKey: ['tour_stops'] });
      const snapshots = queries.map(([key, value]) => [key, value] as const);
      queries.forEach(([key, value]) => {
        if (!value) return;
        queryClient.setQueryData<TourStop[]>(
          key,
          value.map((s) => (s.id === id ? { ...s, ...updates } : s))
        );
      });
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      context?.snapshots.forEach(([key, value]) => {
        queryClient.setQueryData(key, value);
      });
    },
    onSettled: (stop) => {
      if (stop) queryClient.invalidateQueries({ queryKey: ['tour_stops', stop.tour_id] });
      else queryClient.invalidateQueries({ queryKey: ['tour_stops'] });
    },
  });
}

export function useDeleteTourStop() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; tourId: string }) => {
      const { error } = await supabase.from('tour_stops').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { tourId }) => {
      queryClient.invalidateQueries({ queryKey: ['tour_stops', tourId] });
    },
  });
}

/** Persist a new ordering by writing order_index for each stop. */
export function useReorderTourStops() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderedIds }: { tourId: string; orderedIds: string[] }) => {
      await Promise.all(
        orderedIds.map((id, index) =>
          supabase.from('tour_stops').update({ order_index: index }).eq('id', id)
        )
      );
    },
    onMutate: async ({ tourId, orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tour_stops', tourId] });
      const previous = queryClient.getQueryData<TourStop[]>(['tour_stops', tourId]);
      if (previous) {
        const byId = new Map(previous.map((s) => [s.id, s]));
        const reordered = orderedIds
          .map((id, index) => {
            const s = byId.get(id);
            return s ? { ...s, order_index: index } : null;
          })
          .filter(Boolean) as TourStop[];
        queryClient.setQueryData<TourStop[]>(['tour_stops', tourId], reordered);
      }
      return { previous, tourId };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tour_stops', context.tourId], context.previous);
      }
    },
    onSettled: (_data, _err, { tourId }) => {
      queryClient.invalidateQueries({ queryKey: ['tour_stops', tourId] });
    },
  });
}
