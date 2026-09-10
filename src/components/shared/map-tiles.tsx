'use client';

import dynamic from 'next/dynamic';

const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);

const CARTO_API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY;

/**
 * Dark basemap shared by every map of the app.
 *
 * CARTO now stamps "API KEY REQUIRED" across its keyless tiles, so the default
 * is Esri's Dark Gray canvas: free, no key, but split in two layers (ground,
 * then labels on top). Set NEXT_PUBLIC_CARTO_API_KEY (free key from
 * carto.com/basemaps/apikey) to switch back to the darker CARTO style.
 */
export function MapTiles() {
  if (CARTO_API_KEY) {
    return (
      <TileLayer
        url={`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${CARTO_API_KEY}`}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
    );
  }

  return (
    <>
      <TileLayer
        url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; Esri'
      />
      <TileLayer url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" />
    </>
  );
}
