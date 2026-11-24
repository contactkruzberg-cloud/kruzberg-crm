import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/smtp';
import { addressesIn, domainOf, peersOf } from '@/lib/email/messages';
import { ownText } from '@/lib/email/sent';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const { to, cc, subject, emailBody, dealId, contactId, venueId, templateId, inReplyTo, references, relance } = body;

    if (!to || !subject || !emailBody) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    // Send via SMTP
    const { messageId, body: sentBody } = await sendEmail({ to, cc, subject, body: emailBody, inReplyTo, references });

    // The message shows up in its conversation right away (the Sent copy has the same Message-ID).
    const own = (process.env.SMTP_USER || 'booking@kruzberg.com').toLowerCase();
    const toList = addressesIn(to);
    const ccList = addressesIn(cc);
    const { peers, domains } = peersOf({ from: own, to: toList, cc: ccList }, domainOf(own));
    const { error: mailErr } = await supabase.from('emails').upsert(
      {
        user_id: user.id,
        message_key: messageId,
        message_id: messageId,
        folder: 'CRM',
        direction: 'out',
        from_addr: own,
        from_name: 'KRUZBERG',
        to_addrs: toList,
        cc_addrs: ccList,
        peers,
        peer_domains: domains,
        subject,
        sent_at: new Date().toISOString(),
        body_text: ownText(sentBody),
        full_text: sentBody,
        in_reply_to: inReplyTo || null,
        refs: references || null,
        seen: true,
      },
      { onConflict: 'user_id,message_key', ignoreDuplicates: true },
    );
    if (mailErr) console.error('emails insert after send failed (migration 020 ?)', mailErr.message);

    // Log template send (template_id is required by DB constraint)
    if (templateId) {
      await supabase.from('template_sends').insert({
        user_id: user.id,
        template_id: templateId,
        deal_id: dealId || null,
        contact_id: contactId || null,
        generated_body: `À : ${to}\nObjet : ${subject}\n\n${emailBody}`,
      });
    }

    // Log activity
    await supabase.from('activities').insert({
      user_id: user.id,
      deal_id: dealId || null,
      venue_id: venueId || null,
      contact_id: contactId || null,
      type: relance ? 'relance' : 'email_sent',
      channel: 'email',
      content: `${relance ? 'Relance envoyée depuis le CRM\n' : ''}À : ${to}\nObjet : ${subject}\n\n${emailBody}`,
    });

    // Update deal if linked
    if (dealId) {
      const now = new Date().toISOString();
      const { data: deal } = await supabase
        .from('deals')
        .select('stage')
        .eq('id', dealId)
        .single();

      const updates: Record<string, string> = {
        last_message_at: now,
        last_relance_method: 'email',
      };

      // Auto-advance stage
      if (deal?.stage === 'a_contacter') {
        updates.stage = 'contacte';
        updates.first_contact_at = now;
      } else if (deal?.stage === 'contacte') {
        updates.stage = 'relance';
      }
      // Waiting for an answer: next follow-up in 7 days (the relance queue picks it up then).
      if (['a_contacter', 'contacte', 'relance'].includes(deal?.stage ?? '') || relance) {
        updates.next_relance_at = new Date(Date.now() + 7 * 86_400_000).toISOString();
      }

      await supabase
        .from('deals')
        .update(updates)
        .eq('id', dealId);
    }

    return NextResponse.json({ success: true, messageId });
  } catch (error) {
    console.error('Send email error:', error);
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
