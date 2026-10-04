'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from './use-supabase';
import type { Template, TemplateSend } from '@/types/database';
import { archiveEntity, undoToast } from '@/lib/archive';
import { SAVE_META } from '@/lib/save-status';

export function useTemplates() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('category', { ascending: true });
      if (error) throw error;
      return data as Template[];
    },
  });
}

export function useCreateTemplate() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (template: Partial<Template>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('templates')
        .insert({ ...template, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as Template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useUpdateTemplate() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    meta: SAVE_META,
    mutationFn: async ({ id, ...updates }: Partial<Template> & { id: string }) => {
      const { data, error } = await supabase
        .from('templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useDeleteTemplate() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    // Archive (restorable), never a hard delete: see src/lib/archive.ts.
    mutationFn: async (id: string) => archiveEntity(supabase, 'template', id),
    onSuccess: (batch) => {
      queryClient.invalidateQueries();
      undoToast(supabase, queryClient, 'Template supprimé', batch);
    },
  });
}

export function useTemplateSends() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['template_sends'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_sends')
        .select('*, template:templates(*), contact:contacts(id, name, email), deal:deals(id, venue_id, stage, venue:venues(id, name, city))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as TemplateSend[];
    },
  });
}

export function useCreateTemplateSend() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (send: Partial<TemplateSend>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('template_sends')
        .insert({ ...send, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as TemplateSend;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template_sends'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}
