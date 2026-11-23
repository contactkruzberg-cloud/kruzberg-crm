import { NextResponse } from 'next/server';
import { syncMailbox } from '@/lib/email/mailbox';
import { buildConversations, type EmailRow } from '@/lib/email/messages';
import { emailContext, isMissingTable, SETUP_MESSAGE } from '@/lib/email/server-context';

// Copies new mail from booking@ into the CRM (all useful folders), then marks
// as « Répondu » the opportunities whose venue / contact just wrote back.
// Called by the app (button, every few minutes) and by Vercel Cron.

export const maxDuration = 60;

export async function GET(request: Request) {
  const ctx = await emailContext(request);
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { db, userId } = ctx;

  try {
    const r = await syncMailbox(db, userId);

    // Reply detection on what just came in (last 14 days only).
    let newReplies = 0;
    const recent = r.newInbound.filter((e) => Date.now() - Date.parse(e.sent_at) < 14 * 864e5);
    if (recent.length) {
      const [{ data: venues }, { data: contacts }] = await Promise.all([
        db.from('venues').select('id, name, city, email, website').eq('user_id', userId),
        db.from('contacts').select('id, name, email, venue_id').eq('user_id', userId),
      ]);
      const conv = buildConversations(recent.map((e, i) => ({ ...e, id: String(i), direction: 'in', seen: false }) as unknown as EmailRow), venues ?? [], contacts ?? []);
      for (const c of conv) {
        if (c.kind === 'address') continue;
        const venueId = c.kind === 'venue' ? c.ref : (contacts ?? []).find((x) => x.id === c.ref)?.venue_id;
        const q = db.from('deals').select('id, stage').eq('user_id', userId).not('stage', 'in', '("confirme","termine","refuse")').order('updated_at', { ascending: false }).limit(1);
        const { data: deals } = venueId ? await q.eq('venue_id', venueId) : await q.eq('contact_id', c.ref);
        const deal = deals?.[0];
        if (!deal) continue;
        const when = c.last.sent_at;
        const update: Record<string, string> = { last_message_at: when };
        if (['contacte', 'relance'].includes(deal.stage)) {
          update.stage = 'repondu';
          update.response = `Réponse reçue le ${new Date(when).toLocaleDateString('fr-FR')}`;
          newReplies++;
        }
        await db.from('deals').update(update).eq('id', deal.id);
        await db.from('activities').insert({
          user_id: userId,
          deal_id: deal.id,
          venue_id: venueId ?? null,
          contact_id: c.kind === 'contact' ? c.ref : null,
          type: 'reply_received',
          content: `Réponse reçue de ${c.last.from_name || c.last.from_addr} : "${c.last.subject}"`,
        });
      }
    }

    return NextResponse.json({ inserted: r.inserted, remaining: r.remaining, newReplies, folders: r.folders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('Email sync error:', error);
    if (isMissingTable(message)) return NextResponse.json({ error: SETUP_MESSAGE, setup: true }, { status: 503 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
