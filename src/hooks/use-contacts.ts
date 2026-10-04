'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { Contact } from '@/types/database';
import { archiveEntity, undoToast } from '@/lib/archive';
import { SAVE_META } from '@/lib/save-status';

export function useContacts() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*, venue:venues(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Contact[];
    },
  });
}

export function useCreateContact() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contact: Partial<Contact>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...contact, user_id: user.id })
        .select('*, venue:venues(*)')
        .single();
      if (error) throw error;
      return data as Contact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpdateContact() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    meta: SAVE_META,
    mutationFn: async ({ id, ...updates }: Partial<Contact> & { id: string }) => {
      const { data, error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', id)
        .select('*, venue:venues(*)')
        .single();
      if (error) throw error;
      return data as Contact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useDeleteContact() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    // Archive (restorable), never a hard delete: see src/lib/archive.ts.
    mutationFn: async (id: string) => archiveEntity(supabase, 'contact', id),
    onSuccess: (batch) => {
      queryClient.invalidateQueries();
      undoToast(supabase, queryClient, 'Contact supprimé', batch);
    },
  });
}
