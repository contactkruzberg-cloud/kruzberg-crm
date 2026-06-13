'use client';

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

interface VenueLocationMapProps {
  latitude: number;
  longitude: number;
  name: string;
  height?: string;
}

export function VenueLocationMap({ latitude, longitude, name, height = 'h-44' }: VenueLocationMapProps) {
  return (
    <div className={`${height} rounded-lg overflow-hidden border`}>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />
      <MapContainer
        center={[latitude, longitude]}
        zoom={14}
        className="h-full w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        />
        <CircleMarker
          center={[latitude, longitude]}
          radius={9}
          pathOptions={{
            color: '#22d3ee',
            fillColor: '#22d3ee',
            fillOpacity: 0.7,
            weight: 2,
          }}
        >
          <LeafletTooltip>{name}</LeafletTooltip>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
