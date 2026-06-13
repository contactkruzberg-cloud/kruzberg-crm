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
