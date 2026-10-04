import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// "Supprimer" in the app archives (soft delete, same rules as the MCP
// connector): the item and its dependents share a deleted_batch, so the undo
// toast and the Corbeille (Réglages) can bring everything back.

export type ArchivableEntity =
  | 'venue'
  | 'contact'
  | 'deal'
  | 'task'
  | 'activity'
  | 'tour'
  | 'tour_stop'
  | 'tour_expense'
  | 'template'
  | 'band';

export async function archiveEntity(supabase: SupabaseClient, entity: ArchivableEntity, id: string): Promise<string> {
  const { data, error } = await supabase.rpc('app_archive', { p_entity: entity, p_id: id });
  if (error) throw error;
  return data as string;
}

export async function restoreBatch(supabase: SupabaseClient, batch: string): Promise<number> {
  const { data, error } = await supabase.rpc('app_restore', { p_batch: batch });
  if (error) throw error;
  return data as number;
}

/** Toast "« X » supprimé — Annuler" (10 s). Undo restores the whole batch. */
export function undoToast(supabase: SupabaseClient, queryClient: QueryClient, message: string, batch: string) {
  toast.success(message, {
    duration: 10_000,
    description: 'Récupérable aussi dans Réglages → Corbeille.',
    action: {
      label: 'Annuler',
      onClick: async () => {
        try {
          await restoreBatch(supabase, batch);
          await queryClient.invalidateQueries();
          toast.success('Restauré');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Restauration impossible');
        }
      },
    },
  });
}
