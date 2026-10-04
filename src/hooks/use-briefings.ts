'use client';

import { useQuery } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { Briefing } from '@/types/database';

/** Most recent weekly briefing written by Claude (save_briefing). */
export function useLatestBriefing() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['briefings', 'latest'],
    queryFn: async () => {
      const { data, error } = await supabase.from('briefings').select('*').order('week_start', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as Briefing | null;
    },
  });
}
