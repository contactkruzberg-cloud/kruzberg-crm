'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useVenues } from '@/hooks/use-venues';
import { useDeals } from '@/hooks/use-deals';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import('react-leaflet').then((mod) => mod.CircleMarker),
  { ssr: false }
);
const LeafletTooltip = dynamic(
  () => import('react-leaflet').then((mod) => mod.Tooltip),
  { ssr: false }
);

const STAGE_COLORS: Record<string, string> = {
  a_contacter: '#3b82f6',
  contacte: '#8b5cf6',
  relance: '#f97316',
  repondu: '#eab308',
  a_suivre: '#84cc16',
  confirme: '#22c55e',
  termine: '#64748b',
  refuse: '#ef4444',
};

type MapFilter = 'upcoming' | 'past' | 'both' | 'all';

const FILTER_OPTIONS: { key: MapFilter; label: string }[] = [
  { key: 'upcoming', label: 'Prochains concerts' },
  { key: 'past', label: 'Concerts passés' },
  { key: 'both', label: 'Passés + à venir' },
  { key: 'all', label: 'Tous les lieux' },
];

export function VenueMap() {
  const { data: venues, isLoading: venuesLoading } = useVenues();
  const { data: deals, isLoading: dealsLoading } = useDeals();
  const isLoading = venuesLoading || dealsLoading;
  const [filter, setFilter] = useState<MapFilter>('upcoming');

  // Today as YYYY-MM-DD in local time, to compare with concert_date (DATE).
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Bucket venues by past vs upcoming concerts.
  // - Upcoming: stage "Confirmé" with no concert_date yet OR a date today/future.
  // - Past: stage "Terminé" with a concert_date, OR stage "Confirmé" with a past date.
  // "Terminé" without a date = closed opportunity (sans suite), not counted.
  const { upcomingIds, pastIds } = useMemo(() => {
    const upcoming = new Set<string>();
    const past = new Set<string>();
    (deals || []).forEach((d) => {
      if (d.stage === 'confirme') {
        if (d.concert_date && d.concert_date < today) past.add(d.venue_id);
        else upcoming.add(d.venue_id);
      } else if (d.stage === 'termine' && d.concert_date) {
        past.add(d.venue_id);
      }
    });
    return { upcomingIds: upcoming, pastIds: past };
  }, [deals, today]);

  const counts = useMemo(() => {
    const venuesWithCoords = (venues || []).filter(
      (v) => v.latitude != null && v.longitude != null
    );
    return {
      upcoming: venuesWithCoords.filter((v) => upcomingIds.has(v.id)).length,
      past: venuesWithCoords.filter((v) => pastIds.has(v.id)).length,
      both: venuesWithCoords.filter((v) => upcomingIds.has(v.id) || pastIds.has(v.id)).length,
      all: venuesWithCoords.length,
    };
  }, [venues, upcomingIds, pastIds]);

  const filteredVenues = useMemo(() => {
    const withCoords = (venues || []).filter(
      (v) => v.latitude != null && v.longitude != null
    );
    switch (filter) {
      case 'upcoming':
        return withCoords.filter((v) => upcomingIds.has(v.id));
      case 'past':
        return withCoords.filter((v) => pastIds.has(v.id));
      case 'both':
        return withCoords.filter((v) => upcomingIds.has(v.id) || pastIds.has(v.id));
      case 'all':
      default:
        return withCoords;
    }
  }, [venues, filter, upcomingIds, pastIds]);

  const dealsByVenue = useMemo(() => new Map((deals || []).map((d) => [d.venue_id, d])), [deals]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Carte des lieux
          </CardTitle>
          <div className="flex gap-1 flex-wrap">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setFilter(opt.key)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-all border',
                  filter === opt.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                )}
              >
                {opt.label} ({counts[opt.key]})
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredVenues.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {filter === 'upcoming' && 'Aucun concert à venir géolocalisé'}
              {filter === 'past' && 'Aucun concert passé géolocalisé'}
              {filter === 'both' && 'Aucun concert géolocalisé'}
              {filter === 'all' && 'Aucun lieu avec coordonnées'}
            </p>
            {filter === 'all' && (
              <p className="text-xs mt-1">
                Ajoutez des coordonnées GPS à vos lieux pour les voir ici
              </p>
            )}
          </div>
        ) : (
          <div className="h-64 rounded-lg overflow-hidden border">
            <link
              rel="stylesheet"
              href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
            />
            <MapContainer
              center={[46.6, 2.3]}
              zoom={5}
              className="h-full w-full"
              scrollWheelZoom={false}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              />
              {filteredVenues.map((venue) => {
                const deal = dealsByVenue.get(venue.id);
                const color = deal ? STAGE_COLORS[deal.stage] || '#22d3ee' : '#22d3ee';
                return (
                  <CircleMarker
                    key={venue.id}
                    center={[venue.latitude!, venue.longitude!]}
                    radius={6}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: 0.7,
                      weight: 2,
                    }}
                  >
                    <LeafletTooltip>
                      <div className="text-xs">
                        <strong>{venue.name}</strong>
                        <br />
                        {venue.city}
                        {deal && (
                          <>
                            <br />
                            <span className="capitalize">{deal.stage.replace('_', ' ')}</span>
                          </>
                        )}
                      </div>
                    </LeafletTooltip>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
