'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { Activity } from '@/types/database';

export function useActivities(limit = 15) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['activities', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*, venue:venues(id, name), deal:deals(id, stage), contact:contacts(id, name)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as Activity[];
    },
  });
}

export function useVenueActivities(venueId: string | null | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['activities', 'venue', venueId],
    queryFn: async () => {
      if (!venueId) return [] as Activity[];
      const { data, error } = await supabase
        .from('activities')
        .select('*, contact:contacts(id, name)')
        .eq('venue_id', venueId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Activity[];
    },
    enabled: !!venueId,
  });
}

export function useCreateActivity() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (activity: Partial<Activity>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('activities')
        .insert({ ...activity, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as Activity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}
