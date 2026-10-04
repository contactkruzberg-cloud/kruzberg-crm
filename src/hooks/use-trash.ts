'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import { restoreBatch } from '@/lib/archive';

export interface TrashRow {
  entity: string;
  id: string;
  name: string;
  deleted_at: string;
  batch: string | null;
}

/** Archived items grouped by deletion (one group = one "Supprimer" and its dependents). */
export function useTrash(enabled: boolean) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['trash'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('app_trash');
      if (error) throw error;
      return data as TrashRow[];
    },
  });
}

export function useRestoreBatch() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batch: string) => restoreBatch(supabase, batch),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function usePurgeBatch() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (batch: string) => {
      const { error } = await supabase.rpc('app_purge', { p_batch: batch });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trash'] }),
  });
}
