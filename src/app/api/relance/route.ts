import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchLastSentTo } from '@/lib/email/sent';
import { buildRelancePrompt, relanceCount, relanceDocId, RELANCE_INSTRUCTIONS, type RelanceDoc } from '@/lib/relance/prompt';
import { wakeRelanceWorker } from '@/lib/relance/wake';
import type { Deal } from '@/types/database';

// "Relancer": the CRM gathers everything (deal, history, radar lead, the email
// sent from booking@) into a request, stored in the radar outbox
// (outbox/relance-<dealId>, kind "relance"). A Claude routine, on Greg's
// subscription, writes the email and puts it back (state "ready").

export const maxDuration = 30;

/** { dealId } → the request document (state "requested"). */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { dealId, note } = (await request.json().catch(() => ({}))) as { dealId?: string; note?: string };
  if (!dealId) return NextResponse.json({ error: 'dealId manquant' }, { status: 400 });

  const { data: deal, error } = await supabase.from('deals').select('*, venue:venues(*), contact:contacts(*)').eq('id', dealId).single();
  if (error || !deal) return NextResponse.json({ error: 'Opportunité introuvable' }, { status: 404 });
  const d = deal as Deal & { external_source?: string | null; external_id?: string | null };

  const [{ data: activities }, lead] = await Promise.all([
    supabase.from('activities').select('type, channel, content, created_at').eq('deal_id', dealId).order('created_at', { ascending: false }).limit(20),
    d.external_source === 'radar' && d.external_id
      ? supabase
          .from('radar_docs')
          .select('data')
          .eq('collection', 'leads')
          .eq('id', d.external_id)
          .maybeSingle()
          .then((r) => (r.data?.data as Record<string, unknown>) ?? null)
      : Promise.resolve(null),
  ]);

  const addresses = [d.contact?.email, d.venue?.email, typeof lead?.email === 'string' ? lead.email : null].filter(Boolean) as string[];
  // The mailbox is a bonus: never block the request on it.
  const lastSent = await fetchLastSentTo(addresses).catch(() => null);
  const ctx = { deal: d, venue: d.venue, contact: d.contact, activities: activities ?? [], lastSent, lead, today: new Date().toISOString().slice(0, 10) };

  const doc: RelanceDoc = {
    kind: 'relance',
    state: 'requested',
    dealId,
    label: d.title || d.venue?.name || d.contact?.name || 'Opportunité',
    to: lastSent?.to || [d.contact?.email, d.venue?.email].find((e) => e && e.includes('@')) || '',
    instructions: RELANCE_INSTRUCTIONS,
    prompt: buildRelancePrompt(ctx) + (note?.trim() ? `\n\nCONSIGNE DE GREG POUR CETTE VERSION : ${note.trim().slice(0, 500)}` : ''),
    basedOn: { lastSent: lastSent ? { subject: lastSent.subject, date: lastSent.date } : null, relances: relanceCount(ctx) },
    requestedAt: new Date().toISOString(),
  };
  const { error: wErr } = await supabase
    .from('radar_docs')
    .upsert({ user_id: user.id, collection: 'outbox', id: relanceDocId(dealId), data: doc }, { onConflict: 'user_id,collection,id' });
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

  const woke = await wakeRelanceWorker().catch(() => false);
  return NextResponse.json({ ...doc, woke });
}
