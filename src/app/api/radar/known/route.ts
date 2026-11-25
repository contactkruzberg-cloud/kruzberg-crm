import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sentRecipientsCached } from '@/lib/email/sent';
import { knownEntities } from '@/lib/radar/known-source';
import type { KnownData, KnownSent } from '@/lib/radar/known';

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/**
 * Who booking@ already wrote to, from the mail already synced in the CRM
 * (table emails): a quick query instead of an IMAP scan of the Sent folder.
 * Null when the messaging is not set up or empty: the IMAP scan takes over.
 */
async function sentFromCrm(supabase: Supabase, userId: string): Promise<KnownSent[] | null> {
  const by = new Map<string, KnownSent>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('emails')
      .select('peers, subject, sent_at')
      .eq('user_id', userId)
      .eq('direction', 'out')
      .order('sent_at', { ascending: false })
      .range(from, from + 999);
    if (error) return null;
    for (const m of data ?? []) {
      for (const email of (m.peers as string[]) ?? []) {
        const cur = by.get(email);
        if (cur) cur.count++;
        else by.set(email, { email, lastAt: m.sent_at as string, subject: (m.subject as string) ?? '', count: 1 });
      }
    }
    if (!data || data.length < 1000) break;
  }
  return by.size ? [...by.values()] : null;
}

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
  const [venues, contacts, deals, synced] = await Promise.all([
    supabase.from('venues').select('id, name, city, email, website').eq('user_id', user.id),
    supabase.from('contacts').select('id, name, email, venue_id').eq('user_id', user.id),
    supabase.from('deals').select('id, title, stage, venue_id, contact_id').eq('user_id', user.id),
    sentFromCrm(supabase, user.id),
  ]);
  const sent = synced && !force ? { data: synced, error: undefined } : await sentRecipientsCached(force);
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
