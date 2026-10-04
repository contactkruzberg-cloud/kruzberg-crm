'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { Tour } from '@/types/database';
import { archiveEntity, undoToast } from '@/lib/archive';
import { SAVE_META } from '@/lib/save-status';

export function useTours() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['tours'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tours')
        .select('*')
        .order('start_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Tour[];
    },
  });
}

export function useTour(id: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['tours', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tours')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Tour;
    },
    enabled: !!id,
  });
}

export function useCreateTour() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tour: Partial<Tour>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('tours')
        .insert({ ...tour, user_id: user.id })
        .select('*')
        .single();
      if (error) throw error;
      return data as Tour;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
    },
  });
}

export function useUpdateTour() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    meta: SAVE_META,
    mutationFn: async ({ id, ...updates }: Partial<Tour> & { id: string }) => {
      const { data, error } = await supabase
        .from('tours')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as Tour;
    },
    onSuccess: (tour) => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      queryClient.invalidateQueries({ queryKey: ['tours', tour.id] });
    },
  });
}

export function useDeleteTour() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    // Archive (restorable), never a hard delete: see src/lib/archive.ts.
    mutationFn: async (id: string) => archiveEntity(supabase, 'tour', id),
    onSuccess: (batch) => {
      queryClient.invalidateQueries();
      undoToast(supabase, queryClient, 'Tournée supprimée', batch);
    },
  });
}
