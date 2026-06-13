'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, useRef } from 'react';
import type { Venue, Deal } from '@/types/database';
import { MapPin, Locate, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useUpdateVenue } from '@/hooks/use-venues';
import { geocodeAddress } from '@/lib/geocode';
import { toast } from 'sonner';

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

// Nominatim usage policy: 1 req/sec. We use 1.1s to stay safe.
const GEOCODE_DELAY_MS = 1100;

interface VenuesMapViewProps {
  venues: Venue[];
  deals?: Deal[];
  onSelect?: (venueId: string) => void;
}

export function VenuesMapView({ venues, deals, onSelect }: VenuesMapViewProps) {
  const updateVenue = useUpdateVenue();
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchFound, setBatchFound] = useState(0);
  const [batchFailed, setBatchFailed] = useState(0);
  const cancelRef = useRef(false);

  const venuesWithCoords = useMemo(
    () => venues.filter((v) => v.latitude != null && v.longitude != null),
    [venues]
  );
  const venuesToLocate = useMemo(
    () =>
      venues.filter(
        (v) =>
          (v.latitude == null || v.longitude == null) &&
          (v.address || v.postal_code || v.city)
      ),
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

  const runBatchGeocode = async () => {
    if (venuesToLocate.length === 0) return;
    cancelRef.current = false;
    setBatchRunning(true);
    setBatchTotal(venuesToLocate.length);
    setBatchProgress(0);
    setBatchFound(0);
    setBatchFailed(0);

    let found = 0;
    let failed = 0;

    for (let i = 0; i < venuesToLocate.length; i++) {
      if (cancelRef.current) break;
      const v = venuesToLocate[i];
      try {
        const result = await geocodeAddress({
          address: v.address,
          postal_code: v.postal_code,
          city: v.city,
          country: v.country,
        });
        if (result) {
          await updateVenue.mutateAsync({
            id: v.id,
            latitude: result.lat,
            longitude: result.lng,
          });
          found++;
          setBatchFound(found);
        } else {
          failed++;
          setBatchFailed(failed);
        }
      } catch {
        failed++;
        setBatchFailed(failed);
      }
      setBatchProgress(i + 1);

      // Throttle to respect Nominatim's 1 req/sec policy.
      if (i < venuesToLocate.length - 1 && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, GEOCODE_DELAY_MS));
      }
    }

    setBatchRunning(false);
    if (cancelRef.current) {
      toast.info(`Géocodage interrompu — ${found} localisés, ${failed} introuvables`);
    } else {
      toast.success(`Géocodage terminé — ${found} localisés${failed > 0 ? `, ${failed} introuvables` : ''}`);
    }
  };

  const cancelBatch = () => {
    cancelRef.current = true;
  };

  const eta = batchRunning ? Math.ceil(((batchTotal - batchProgress) * GEOCODE_DELAY_MS) / 1000) : 0;

  return (
    <div className="space-y-3">
      {/* Batch geocoding banner */}
      {venuesWithoutCoords > 0 && !batchRunning && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-orange-500" />
            <span>
              <span className="text-foreground font-medium">{venuesWithoutCoords}</span> lieu{venuesWithoutCoords > 1 ? 'x' : ''} sans coordonnées GPS
              {venuesToLocate.length < venuesWithoutCoords && (
                <span className="text-muted-foreground"> ({venuesWithoutCoords - venuesToLocate.length} sans adresse, ignorés)</span>
              )}
            </span>
          </div>
          {venuesToLocate.length > 0 && (
            <Button
              size="sm"
              className="gap-2 h-8"
              onClick={runBatchGeocode}
              title={`Géocode ${venuesToLocate.length} lieux via OpenStreetMap (~${Math.ceil((venuesToLocate.length * GEOCODE_DELAY_MS) / 1000)}s)`}
            >
              <Locate className="h-3.5 w-3.5" />
              Localiser {venuesToLocate.length} lieu{venuesToLocate.length > 1 ? 'x' : ''}
            </Button>
          )}
        </div>
      )}

      {/* Progress banner during batch */}
      {batchRunning && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-2">
              <Locate className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span className="font-medium">
                Localisation en cours… {batchProgress} / {batchTotal}
              </span>
              <span className="text-muted-foreground">
                ({batchFound} trouvé{batchFound > 1 ? 's' : ''}
                {batchFailed > 0 && `, ${batchFailed} introuvable${batchFailed > 1 ? 's' : ''}`})
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">~{eta}s restants</span>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={cancelBatch}>
                <X className="h-3 w-3" />
                Arrêter
              </Button>
            </div>
          </div>
          <Progress value={(batchProgress / batchTotal) * 100} />
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
