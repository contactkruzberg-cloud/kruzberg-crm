import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { saveReplyDraft } from '@/lib/email/drafts';
import { relanceDocId, type RelanceDoc } from '@/lib/relance/prompt';

export const maxDuration = 30;

/**
 * { dealId, to, subject, body } → saves the follow-up as a reply draft in
 * booking@'s Drafts (threaded on the first email), returns its Message-ID.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { dealId, to, subject, body } = (await request.json().catch(() => ({}))) as { dealId?: string; to?: string; subject?: string; body?: string };
  if (!dealId || !subject?.trim() || !body?.trim()) return NextResponse.json({ error: 'Objet et message requis' }, { status: 400 });
  const recipients = String(to || '')
    .split(/[,;\s]+/)
    .map((a) => a.trim())
    .filter((a) => a.includes('@'));
  if (!recipients.length) return NextResponse.json({ error: 'Ajoute au moins une adresse email' }, { status: 400 });

  const { data: row } = await supabase.from('radar_docs').select('data').eq('collection', 'outbox').eq('id', relanceDocId(dealId)).maybeSingle();
  const doc = (row?.data ?? null) as RelanceDoc | null;
  const t = doc?.thread;
  const cc = (t?.cc ?? []).filter((a) => !recipients.includes(a));

  try {
    const saved = await saveReplyDraft({ to: recipients, cc, subject: subject.trim(), body: body.trim(), replyTo: t ?? null });
    const draft = { messageId: saved.messageId, savedAt: new Date().toISOString() };
    if (row) {
      await supabase
        .from('radar_docs')
        .update({ data: { ...doc, draft, to: recipients.join(', '), subject, body } })
        .eq('collection', 'outbox')
        .eq('id', relanceDocId(dealId));
    }
    return NextResponse.json({ ...draft, folder: saved.folder, threaded: !!t?.messageId });
  } catch (err) {
    console.error('relance: brouillon impossible', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Brouillon impossible' }, { status: 500 });
  }
}
