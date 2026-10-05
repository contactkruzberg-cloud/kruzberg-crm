import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchSentRecipients, type SentRecipient } from '@/lib/email/sent';
import { emailsOf } from '@/lib/radar/mail-templates';
import type { KnownData, KnownEntity } from '@/lib/radar/known';

// Anti-doublon du radar : tout ce qui est déjà connu (salles, contacts,
// opportunités du CRM, non archivés) + les destinataires de tous les mails
// envoyés depuis booking@kruzberg.com. Le scan IMAP est gardé 10 min en mémoire.

export const maxDuration = 60;

let sentCache: { at: number; data: SentRecipient[] } | null = null;
const SENT_TTL = 10 * 60_000;

async function sentRecipients(force: boolean): Promise<{ data: SentRecipient[]; error?: string }> {
  if (!force && sentCache && Date.now() - sentCache.at < SENT_TTL) return { data: sentCache.data };
  try {
    const data = await fetchSentRecipients();
    sentCache = { at: Date.now(), data };
    return { data };
  } catch (err) {
    console.error('[radar] sent scan failed', err);
    return { data: sentCache?.data ?? [], error: err instanceof Error ? err.message : 'échec IMAP' };
  }
}

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
    sentRecipients(force),
  ]);
  const dbError = venues.error || contacts.error || deals.error;
  if (dbError) return Response.json({ code: 'upstream_error', message: dbError.message }, { status: 500 });

  const venueById = new Map((venues.data ?? []).map((v) => [v.id, v]));
  const entities: KnownEntity[] = [];
  for (const v of venues.data ?? []) {
    entities.push({ kind: 'venue', id: v.id, name: v.name, city: v.city || undefined, emails: emailsOf(v.email), websites: v.website ? [v.website] : [], path: `/venues?id=${v.id}` });
  }
  for (const c of contacts.data ?? []) {
    const v = c.venue_id ? venueById.get(c.venue_id) : undefined;
    entities.push({ kind: 'contact', id: c.id, name: c.name, city: v?.city || undefined, emails: emailsOf(c.email), websites: [], path: `/venues?contact=${c.id}` });
  }
  for (const d of deals.data ?? []) {
    if (!d.title) continue; // deals with a venue are already covered by the venue itself
    const v = d.venue_id ? venueById.get(d.venue_id) : undefined;
    entities.push({ kind: 'deal', id: d.id, name: d.title, city: v?.city || undefined, emails: [], websites: [], path: `/pipeline?deal=${d.id}`, stage: d.stage });
  }

  const body: KnownData = { entities, sent: sent.data, sentError: sent.error, scannedAt: new Date().toISOString() };
  return Response.json(body);
}
