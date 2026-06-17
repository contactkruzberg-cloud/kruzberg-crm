'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { TourExpense } from '@/types/database';

export function useTourExpenses(tourId: string | null) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['tour_expenses', tourId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tour_expenses')
        .select('*')
        .eq('tour_id', tourId!)
        .order('expense_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as TourExpense[];
    },
    enabled: !!tourId,
  });
}

/** All expenses across every tour — used by the tour list to compute net per card. */
export function useAllTourExpenses() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['tour_expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tour_expenses')
        .select('*');
      if (error) throw error;
      return data as TourExpense[];
    },
  });
}

export function useCreateTourExpense() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (expense: Partial<TourExpense>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('tour_expenses')
        .insert({ ...expense, user_id: user.id })
        .select('*')
        .single();
      if (error) throw error;
      return data as TourExpense;
    },
    onSuccess: (expense) => {
      queryClient.invalidateQueries({ queryKey: ['tour_expenses', expense.tour_id] });
    },
  });
}

export function useDeleteTourExpense() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; tourId: string }) => {
      const { error } = await supabase.from('tour_expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, { tourId }) => {
      queryClient.invalidateQueries({ queryKey: ['tour_expenses', tourId] });
    },
  });
}
