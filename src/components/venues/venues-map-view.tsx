'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { Venue, Deal } from '@/types/database';
import { MapPin } from 'lucide-react';

const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then((m) => m.CircleMarker), { ssr: false });
const LeafletTooltip = dynamic(() => import('react-leaflet').then((m) => m.Tooltip), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then((m) => m.Popup), { ssr: false });

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

interface VenuesMapViewProps {
  venues: Venue[];
  deals?: Deal[];
  onSelect?: (venueId: string) => void;
}

export function VenuesMapView({ venues, deals, onSelect }: VenuesMapViewProps) {
  const venuesWithCoords = useMemo(
    () => venues.filter((v) => v.latitude != null && v.longitude != null),
    [venues]
  );
  const venuesWithoutCoords = venues.length - venuesWithCoords.length;
  const dealsByVenue = useMemo(
    () => new Map((deals || []).map((d) => [d.venue_id, d])),
    [deals]
  );

  // Compute initial center: average of coords, fallback France center.
  const { center, zoom } = useMemo(() => {
    if (venuesWithCoords.length === 0) {
      return { center: [46.6, 2.3] as [number, number], zoom: 5 };
    }
    const lat =
      venuesWithCoords.reduce((s, v) => s + (v.latitude || 0), 0) / venuesWithCoords.length;
    const lng =
      venuesWithCoords.reduce((s, v) => s + (v.longitude || 0), 0) / venuesWithCoords.length;
    return { center: [lat, lng] as [number, number], zoom: venuesWithCoords.length === 1 ? 13 : 6 };
  }, [venuesWithCoords]);

  return (
    <div className="space-y-2">
      {venuesWithoutCoords > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {venuesWithoutCoords} lieu{venuesWithoutCoords > 1 ? 'x' : ''} sans coordonnées GPS (ouvre la fiche du lieu et clique « Localiser sur la carte »)
        </div>
      )}
      <div className="h-[600px] rounded-xl overflow-hidden border">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
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
                radius={7}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.75,
                  weight: 2,
                }}
                eventHandlers={onSelect ? { click: () => onSelect(venue.id) } : undefined}
              >
                <LeafletTooltip>
                  <div className="text-xs">
                    <strong>{venue.name}</strong>
                    {venue.city && (
                      <>
                        <br />
                        {venue.city}
                      </>
                    )}
                  </div>
                </LeafletTooltip>
                <Popup>
                  <div className="text-xs space-y-1">
                    <strong className="text-sm">{venue.name}</strong>
                    {venue.address && <div>{venue.address}</div>}
                    {(venue.postal_code || venue.city) && (
                      <div>
                        {[venue.postal_code, venue.city].filter(Boolean).join(' ')}
                      </div>
                    )}
                    {venue.email && <div className="text-muted-foreground">{venue.email}</div>}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
