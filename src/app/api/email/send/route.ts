import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/smtp';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const { to, subject, emailBody, dealId, contactId, venueId, templateId } = body;

    if (!to || !subject || !emailBody) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    // Send via SMTP
    const { messageId } = await sendEmail({
      to,
      subject,
      body: emailBody,
    });

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
      type: 'email_sent',
      content: `À : ${to}\nObjet : ${subject}\n\n${emailBody}`,
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
      };

      // Auto-advance stage
      if (deal?.stage === 'a_contacter') {
        updates.stage = 'contacte';
        updates.first_contact_at = now;
      } else if (deal?.stage === 'contacte') {
        updates.stage = 'relance';
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
