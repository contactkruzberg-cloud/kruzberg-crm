'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useVenues } from '@/hooks/use-venues';
import { useDeals } from '@/hooks/use-deals';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin } from 'lucide-react';
import dynamic from 'next/dynamic';

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
  confirme: '#22c55e',
  refuse: '#ef4444',
};

export function VenueMap() {
  const { data: venues, isLoading: venuesLoading } = useVenues();
  const { data: deals, isLoading: dealsLoading } = useDeals();
  const isLoading = venuesLoading || dealsLoading;

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

  const venuesWithCoords = (venues || []).filter((v) => v.latitude && v.longitude);
  const dealsByVenue = new Map((deals || []).map((d) => [d.venue_id, d]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Carte des lieux
        </CardTitle>
      </CardHeader>
      <CardContent>
        {venuesWithCoords.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucun lieu avec coordonnées</p>
            <p className="text-xs mt-1">
              Ajoutez des coordonnées GPS à vos lieux pour les voir ici
            </p>
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
              {venuesWithCoords.map((venue) => {
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
