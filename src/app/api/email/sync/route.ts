import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchNewEmails } from '@/lib/email/imap';

// This route can be called by Vercel Cron or manually
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret or auth
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    let userId: string | null = null;

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      // Called by cron — get the first user (single-user app)
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase.from('venues').select('user_id').limit(1).single();
      userId = data?.user_id || null;
    } else {
      // Called by authenticated user
      const supabase = await createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    // Fetch emails from the last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const emails = await fetchNewEmails(since);

    // Get all contacts with emails for matching
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email, venue_id, name')
      .eq('user_id', userId)
      .not('email', 'is', null);

    // Get all venues with emails for matching
    const { data: venues } = await supabase
      .from('venues')
      .select('id, email, name')
      .eq('user_id', userId)
      .not('email', 'is', null);

    // Get existing activities to avoid duplicates
    const { data: existingActivities } = await supabase
      .from('activities')
      .select('content')
      .eq('user_id', userId)
      .eq('type', 'reply_received')
      .gte('created_at', since.toISOString());

    const existingContents = new Set(
      existingActivities?.map((a) => a.content) || []
    );

    let newReplies = 0;

    for (const email of emails) {
      const senderEmail = email.from.toLowerCase();

      // Match sender to a contact
      const matchedContact = contacts?.find(
        (c) => c.email?.toLowerCase() === senderEmail
      );

      // Match sender to a venue
      const matchedVenue = venues?.find(
        (v) => v.email?.toLowerCase() === senderEmail
      );

      const venueId = matchedContact?.venue_id || matchedVenue?.id || null;
      const contactId = matchedContact?.id || null;
      const senderName = email.fromName || senderEmail;

      if (!matchedContact && !matchedVenue) continue; // Unknown sender, skip

      // Check for duplicate
      const activityContent = `Réponse reçue de ${senderName} : "${email.subject}"`;
      if (existingContents.has(activityContent)) continue;

      // Find linked deal
      let dealId: string | null = null;
      if (venueId) {
        const { data: deals } = await supabase
          .from('deals')
          .select('id, stage')
          .eq('user_id', userId)
          .eq('venue_id', venueId)
          .not('stage', 'in', '("confirme","refuse")')
          .order('updated_at', { ascending: false })
          .limit(1);

        if (deals && deals.length > 0) {
          dealId = deals[0].id;

          // Auto-update deal to "repondu" if currently contacte or relance
          if (['contacte', 'relance'].includes(deals[0].stage)) {
            await supabase
              .from('deals')
              .update({
                stage: 'repondu',
                response: `Réponse reçue le ${email.date.toLocaleDateString('fr-FR')}`,
              })
              .eq('id', dealId);
          }
        }
      }

      // Log activity
      await supabase.from('activities').insert({
        user_id: userId,
        deal_id: dealId,
        venue_id: venueId,
        contact_id: contactId,
        type: 'reply_received',
        content: activityContent,
      });

      existingContents.add(activityContent);
      newReplies++;
    }

    return NextResponse.json({
      success: true,
      emailsChecked: emails.length,
      newReplies,
    });
  } catch (error) {
    console.error('Email sync error:', error);
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
