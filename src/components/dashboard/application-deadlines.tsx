'use client';

import Link from 'next/link';
import { CalendarClock, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useVenues } from '@/hooks/use-venues';
import { useDeals } from '@/hooks/use-deals';
import { applicationWindow } from '@/lib/application-dates';
import { formatDate } from '@/lib/utils';

const WITHIN_DAYS = 45;

/** Festivals / tremplins whose annual application closes soon (reminder ~1 month ahead). */
export function ApplicationDeadlines() {
  const { data: venues } = useVenues();
  const { data: deals } = useDeals();
  const openDealVenues = new Set(
    (deals || []).filter((d) => !['confirme', 'termine', 'refuse'].includes(d.stage)).map((d) => d.venue_id),
  );
  const items = (venues || [])
    .map((v) => ({ venue: v, w: applicationWindow(v.application_opens, v.application_deadline) }))
    .filter((x) => x.w && x.w.days_left <= WITHIN_DAYS && x.venue.style_fit !== 'no')
    .sort((a, b) => a.w!.days_left - b.w!.days_left);

  if (!items.length) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-orange-500" />
          Candidatures à envoyer
        </CardTitle>
        <Badge variant="warning">{items.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.slice(0, 6).map(({ venue, w }) => (
          <div key={venue.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{venue.name}</p>
              <p className="text-xs text-muted-foreground">
                {venue.city}
                {' · '}
                {w!.status === 'open' ? `clôture le ${formatDate(w!.deadline)}` : `ouverture le ${formatDate(w!.opens!)}`}
                {openDealVenues.has(venue.id) ? ' · déjà dans le pipeline' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {venue.application_url && (
                <a href={venue.application_url} target="_blank" rel="noreferrer" title="Formulaire de candidature" className="text-muted-foreground hover:text-primary">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <Badge variant={w!.days_left <= 14 ? 'destructive' : 'secondary'}>J-{w!.days_left}</Badge>
            </div>
          </div>
        ))}
        {items.length > 6 && (
          <Link href="/venues" className="block text-xs text-muted-foreground hover:text-primary">
            + {items.length - 6} autres
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
