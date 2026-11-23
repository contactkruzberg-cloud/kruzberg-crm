import { isCalendarToken } from '@/lib/calendar/feed-token';
import { buildEvents, toIcs, type CalDeal, type CalStop, type CalTour, type CalVenue } from '@/lib/calendar/events';
import { notConfigured, publicBaseUrl, storeFromEnv } from '@/lib/mcp/context';
import { selectAll } from '@/lib/mcp/store';

// iCal feed of the calendar (concerts, options, tour days, application windows),
// for Apple Calendar / Google Agenda subscriptions. Read-only; a wrong token
// gets a 404.

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isCalendarToken(token.replace(/\.ics$/, ''))) return new Response('Not Found', { status: 404 });
  const store = storeFromEnv();
  if (!store) return notConfigured();

  const [deals, stops, tours, venues] = await Promise.all([
    selectAll(store, 'deals', { filters: [{ col: 'concert_date', op: 'not_null' }] }),
    selectAll(store, 'tour_stops'),
    selectAll(store, 'tours'),
    selectAll(store, 'venues'),
  ]);
  const venueById = new Map(venues.map((v) => [v.id as string, v as unknown as CalVenue]));
  const withVenue = <T extends { venue_id?: unknown }>(r: T) => ({ ...r, venue: r.venue_id ? venueById.get(r.venue_id as string) : null });

  const events = buildEvents({
    deals: deals.map(withVenue) as unknown as CalDeal[],
    stops: stops.map(withVenue) as unknown as CalStop[],
    tours: tours as unknown as CalTour[],
    venues: venues as unknown as CalVenue[],
  });
  return new Response(toIcs(events, publicBaseUrl(request)), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="kruzberg.ics"',
      'cache-control': 'no-store',
    },
  });
}
