import { isCalendarToken } from '@/lib/calendar/feed-token';
import { buildEvents, toIcs, type CalDeal, type CalStop, type CalTour, type CalVenue } from '@/lib/calendar/events';
import { notConfigured, publicBaseUrl, storeFromEnv } from '@/lib/mcp/context';
import { selectAll } from '@/lib/mcp/store';
import { createClient } from '@supabase/supabase-js';
import type { CalPlan } from '@/lib/calendar/events';

/** Plan de route (migration 021): absent tables just mean no plan events. */
async function loadPlan(): Promise<CalPlan | undefined> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const owner = process.env.MCP_OWNER_ID;
  if (!url || !key || !owner) return undefined;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const [p, s] = await Promise.all([
    db.from('plan_projects').select('id,title,target_date,archived_at').eq('user_id', owner).is('archived_at', null),
    db.from('plan_steps').select('id,project_id,title,offset_days,done_at').eq('user_id', owner),
  ]);
  if (p.error || s.error) return undefined;
  return { projects: p.data ?? [], steps: s.data ?? [] };
}

// iCal feed of the calendar (concerts, options, tour days, application windows),
// for Apple Calendar / Google Agenda subscriptions. Read-only; a wrong token
// gets a 404.

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isCalendarToken(token.replace(/\.ics$/, ''))) return new Response('Not Found', { status: 404 });
  const store = storeFromEnv();
  if (!store) return notConfigured();

  const [deals, stops, tours, venues, plan] = await Promise.all([
    selectAll(store, 'deals', { filters: [{ col: 'concert_date', op: 'not_null' }] }),
    selectAll(store, 'tour_stops'),
    selectAll(store, 'tours'),
    selectAll(store, 'venues'),
    loadPlan(),
  ]);
  const venueById = new Map(venues.map((v) => [v.id as string, v as unknown as CalVenue]));
  const withVenue = <T extends { venue_id?: unknown }>(r: T) => ({ ...r, venue: r.venue_id ? venueById.get(r.venue_id as string) : null });

  const events = buildEvents({
    deals: deals.map(withVenue) as unknown as CalDeal[],
    stops: stops.map(withVenue) as unknown as CalStop[],
    tours: tours as unknown as CalTour[],
    venues: venues as unknown as CalVenue[],
    plan,
  });
  return new Response(toIcs(events, publicBaseUrl(request)), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="kruzberg.ics"',
      'cache-control': 'no-store',
    },
  });
}
