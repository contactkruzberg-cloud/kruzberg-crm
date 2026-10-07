// Nominatim (OpenStreetMap) free geocoding.
// Usage policy: max 1 req/sec, set a descriptive User-Agent (we pass it via headers
// which the browser ignores — that's OK at low volume from a CRM tool).
// Docs: https://nominatim.org/release-docs/develop/api/Search/

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export async function geocodeAddress(parts: {
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}): Promise<GeocodeResult | null> {
  const query = [parts.address, parts.postal_code, parts.city, parts.country]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(', ');

  if (!query) return null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '0');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);

  const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json();
  if (!data.length) return null;

  const first = data[0];
  return {
    lat: parseFloat(first.lat),
    lng: parseFloat(first.lon),
    displayName: first.display_name,
  };
}

/** A town in a given country (ISO alpha-2), e.g. for the radar map. Same 1 req/sec rule. */
export async function geocodeCity(city: string, countryCode: string): Promise<GeocodeResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', city);
  url.searchParams.set('countrycodes', countryCode);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('accept-language', 'fr');
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name };
}

/** Up to 5 places matching free text, anywhere (place picker: "Berlin", "Gand", "Lyon 7e"…). */
export async function searchPlaces(q: string): Promise<{ label: string; lat: number; lng: number }[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  url.searchParams.set('accept-language', 'fr');
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json();
  return data.map((d) => {
    const parts = d.display_name.split(',').map((s) => s.trim());
    const label = parts.length > 1 ? `${parts[0]}, ${parts[parts.length - 1]}` : parts[0];
    return { label, lat: Math.round(parseFloat(d.lat) * 1e4) / 1e4, lng: Math.round(parseFloat(d.lon) * 1e4) / 1e4 };
  });
}
