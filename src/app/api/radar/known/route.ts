import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sentRecipientsCached } from '@/lib/email/sent';
import { knownEntities } from '@/lib/radar/known-source';
import type { KnownData } from '@/lib/radar/known';

// Anti-doublon du radar : tout ce qui est déjà connu (salles, contacts,
// opportunités du CRM, non archivés) + les destinataires de tous les mails
// envoyés depuis booking@kruzberg.com (scan IMAP gardé 10 min en mémoire).

export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ code: 'needs_reauth', message: 'Session expirée : reconnecte-toi au CRM.' }, { status: 401 });

  const force = new URL(request.url).searchParams.has('refresh');
  const [venues, contacts, deals, sent] = await Promise.all([
    supabase.from('venues').select('id, name, city, email, website').eq('user_id', user.id),
    supabase.from('contacts').select('id, name, email, venue_id').eq('user_id', user.id),
    supabase.from('deals').select('id, title, stage, venue_id, contact_id').eq('user_id', user.id),
    sentRecipientsCached(force),
  ]);
  const dbError = venues.error || contacts.error || deals.error;
  if (dbError) return Response.json({ code: 'upstream_error', message: dbError.message }, { status: 500 });

  const body: KnownData = {
    entities: knownEntities(venues.data ?? [], contacts.data ?? [], deals.data ?? []),
    sent: sent.data,
    sentError: sent.error,
    scannedAt: new Date().toISOString(),
  };
  return Response.json(body);
}
