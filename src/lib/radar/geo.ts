// Map of the radar: leads only carry a free-text city ("Barberaz (Chambéry)",
// "Lyon 7e (Guillotière)", "Bienne/Biel"…). We geocode each distinct city once
// (Nominatim, see src/lib/geocode.ts) and keep the result in the radar store,
// document config/geo = { "<key>": [lat, lng] | null } (null = not found, not retried).
import type { Lead } from './types';
import { norm } from './logic';

export type GeoCache = Record<string, [number, number] | null>;

export interface GeoPlace {
  /** Cache key: normalized city + country. */
  key: string;
  /** What we send to the geocoder. */
  query: string;
  /** ISO 3166-1 alpha-2, lowercase (Nominatim countrycodes). */
  country: string;
  /** Short label shown on the map. */
  label: string;
}

const NOT_A_CITY = /^(france|europe|en ligne|online|web|international|national|toute la france|.*\bdistanciel\b.*)$/i;

/** Where a lead is on the map, or null when the city is missing / not a place ("France", "En ligne"). */
export function geoPlace(l: Lead): GeoPlace | null {
  const raw = String(l.city || '').trim();
  // "Barberaz (Chambéry)" → "Barberaz" ; "Bienne/Biel" → "Bienne" ; "Lyon 7e" → "Lyon" ; "Marseille (3e)" → "Marseille".
  const city = raw
    .split(/[(/,;–]| - /)[0]
    .replace(/\s+\d{1,2}\s*(?:e|er|ème|eme)\b.*$/i, '')
    .trim();
  if (!city || NOT_A_CITY.test(city)) return null;
  let cc = String(l.country || 'FR').trim().toUpperCase().slice(0, 2);
  if (cc === 'UK') cc = 'GB';
  if (!/^[A-Z]{2}$/.test(cc)) cc = 'FR';
  return { key: `${norm(city)}|${cc}`, query: city, country: cc.toLowerCase(), label: city };
}

/** A chosen place (filter "autour de", search zone of the veille). */
export interface NearPlace {
  label: string;
  lat: number;
  lng: number;
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Distance from `near` to the lead's city, or null if the city is not located (yet). */
export function leadDistanceKm(l: Lead, cache: GeoCache, near: NearPlace): number | null {
  const p = geoPlace(l);
  const pos = p && cache[p.key];
  return pos ? distanceKm(near, { lat: pos[0], lng: pos[1] }) : null;
}
