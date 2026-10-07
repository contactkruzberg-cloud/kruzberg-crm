import { NextRequest, NextResponse } from 'next/server';
import { generateText, Output } from 'ai';
import { GatewayError } from '@ai-sdk/gateway';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchLastSentTo } from '@/lib/email/sent';
import { buildRelancePrompt, relanceCount, RELANCE_INSTRUCTIONS } from '@/lib/relance/prompt';
import type { Deal } from '@/types/database';

// Claude through Vercel AI Gateway (OIDC auth on Vercel, no key to manage).
const MODEL = process.env.RELANCE_MODEL || 'anthropic/claude-sonnet-5.5';

export const maxDuration = 60;

/** { dealId } → { to, subject, body, basedOn } : a follow-up email drafted by Claude. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { dealId } = (await request.json().catch(() => ({}))) as { dealId?: string };
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

  const to = [d.contact?.email, d.venue?.email].find((e) => e && e.includes('@')) || '';
  const addresses = [d.contact?.email, d.venue?.email, typeof lead?.email === 'string' ? lead.email : null].filter(Boolean) as string[];
  // The mailbox is a bonus: never block the draft on it.
  const lastSent = await fetchLastSentTo(addresses).catch(() => null);

  const ctx = { deal: d, venue: d.venue, contact: d.contact, activities: activities ?? [], lastSent, lead, today: new Date().toISOString().slice(0, 10) };

  try {
    const { output } = await generateText({
      model: MODEL,
      instructions: RELANCE_INSTRUCTIONS,
      prompt: buildRelancePrompt(ctx),
      output: Output.object({
        schema: z.object({
          subject: z.string().describe("Objet du mail"),
          body: z.string().describe('Corps du mail en texte brut, avec salutation et signature'),
        }),
      }),
    });
    return NextResponse.json({
      to: lastSent?.to || to,
      subject: output.subject,
      body: output.body,
      basedOn: {
        lastSent: lastSent ? { subject: lastSent.subject, date: lastSent.date } : null,
        relances: relanceCount(ctx),
      },
    });
  } catch (err) {
    if (GatewayError.isInstance(err)) {
      const status = err.statusCode;
      const msg = /credit card/i.test(err.message)
        ? "L'IA de Vercel (AI Gateway) demande une carte bancaire enregistrée pour débloquer ses crédits gratuits : Vercel → onglet AI Gateway → « Add credit card »."
        : status === 401 || status === 403
          ? "Accès à l'IA refusé : active AI Gateway sur le projet Vercel."
          : status === 402
            ? "Plus de crédit IA sur Vercel (AI Gateway) : ajoute des crédits."
            : status === 429
              ? 'Trop de demandes à la fois, réessaie dans une minute.'
              : `Erreur IA : ${err.message}`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Rédaction impossible' }, { status: 500 });
  }
}
