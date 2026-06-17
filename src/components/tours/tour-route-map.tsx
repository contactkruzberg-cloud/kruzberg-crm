'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { TourStop } from '@/types/database';
import { STOP_TYPES } from '@/types/database';

const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then((m) => m.CircleMarker), { ssr: false });
const LeafletTooltip = dynamic(() => import('react-leaflet').then((m) => m.Tooltip), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then((m) => m.Polyline), { ssr: false });

interface TourRouteMapProps {
  stops: TourStop[];
}

function stopColor(type: TourStop['type']) {
  return STOP_TYPES.find((t) => t.key === type)?.color || '#22d3ee';
}

export function TourRouteMap({ stops }: TourRouteMapProps) {
  const located = useMemo(
    () => stops.filter((s) => s.latitude != null && s.longitude != null),
    [stops]
  );

  const path = useMemo(
    () => located.map((s) => [s.latitude!, s.longitude!] as [number, number]),
    [located]
  );

  const { center, zoom } = useMemo(() => {
    if (located.length === 0) {
      return { center: [46.6, 2.3] as [number, number], zoom: 5 };
    }
    const lat = located.reduce((s, v) => s + v.latitude!, 0) / located.length;
    const lng = located.reduce((s, v) => s + v.longitude!, 0) / located.length;
    return { center: [lat, lng] as [number, number], zoom: located.length === 1 ? 11 : 6 };
  }, [located]);

  if (located.length === 0) {
    return (
      <div className="h-[420px] rounded-xl border border-dashed flex items-center justify-center text-sm text-muted-foreground">
        Ajoute des dates géolocalisées pour voir l&apos;itinéraire sur la carte.
      </div>
    );
  }

  return (
    <div className="h-[420px] rounded-xl overflow-hidden border">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        />
        {path.length > 1 && (
          <Polyline
            positions={path}
            pathOptions={{ color: '#22d3ee', weight: 3, opacity: 0.7, dashArray: '6 8' }}
          />
        )}
        {located.map((stop, i) => {
          const color = stopColor(stop.type);
          return (
            <CircleMarker
              key={stop.id}
              center={[stop.latitude!, stop.longitude!]}
              radius={11}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 2 }}
            >
              <LeafletTooltip permanent direction="center" className="tour-stop-label">
                <span style={{ fontWeight: 700, fontSize: 11 }}>{i + 1}</span>
              </LeafletTooltip>
              <LeafletTooltip direction="top" offset={[0, -10]}>
                <div className="text-xs">
                  <strong>
                    {i + 1}. {stop.venue?.name || stop.city || 'Étape'}
                  </strong>
                  {(stop.venue?.city || stop.city) && (
                    <>
                      <br />
                      {stop.venue?.city || stop.city}
                    </>
                  )}
                  {stop.stop_date && (
                    <>
                      <br />
                      {new Date(stop.stop_date).toLocaleDateString('fr-FR')}
                    </>
                  )}
                </div>
              </LeafletTooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
