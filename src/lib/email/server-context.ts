import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Who is calling and with which database client: the signed-in user (RLS), or
 * the cron job (CRON_SECRET) acting for the owner with the service role.
 */
export async function emailContext(request: Request): Promise<{ db: SupabaseClient; userId: string } | null> {
  const cron = process.env.CRON_SECRET;
  if (cron && request.headers.get('authorization') === `Bearer ${cron}`) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const owner = process.env.MCP_OWNER_ID;
    if (!url || !key || !owner) return null;
    return { db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), userId: owner };
  }
  const db = await createServerSupabaseClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return user ? { db: db as unknown as SupabaseClient, userId: user.id } : null;
}

/** The emails table is missing until migration 020 has been run. */
export function isMissingTable(message: string) {
  return /emails|email_sync_state/.test(message) && /does not exist|could not find|schema cache/i.test(message);
}

export const SETUP_MESSAGE =
  'La messagerie n’est pas encore activée : exécute le fichier supabase/migrations/020_emails.sql dans Supabase → SQL Editor.';
