'use client';

import { useState } from 'react';
import type { Tour, TourStop } from '@/types/database';
import { STOP_TYPES } from '@/types/database';
import { useReorderTourStops, useDeleteTourStop, useUpdateTourStop } from '@/hooks/use-tour-stops';
import { legs, formatKm, formatDriveTime, totalKm, googleMapsUrl, mappyLegUrl, stopCity } from '@/lib/tour-math';
import { geocodeAddress } from '@/lib/geocode';
import { TourRouteMap } from './tour-route-map';
import { AddStopDialog } from './add-stop-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  MapPin,
  Navigation,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LONG_LEG_KM = 400; // flag detours longer than this

interface TourItineraryProps {
  tour: Tour;
  stops: TourStop[];
}

export function TourItinerary({ tour, stops }: TourItineraryProps) {
  const reorder = useReorderTourStops();
  const deleteStop = useDeleteTourStop();
  const updateStop = useUpdateTourStop();
  const [addOpen, setAddOpen] = useState(false);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editingCityId, setEditingCityId] = useState<string | null>(null);

  const saveDate = (stopId: string, value: string) => {
    setEditingDateId(null);
    if (value) updateStop.mutate({ id: stopId, stop_date: value });
  };

  const saveCity = async (stopId: string, value: string) => {
    setEditingCityId(null);
    const city = value.trim();
    if (!city) return;
    const updates: Partial<TourStop> & { id: string } = { id: stopId, city };
    try {
      const geo = await geocodeAddress({ city });
      if (geo) {
        updates.latitude = geo.lat;
        updates.longitude = geo.lng;
      }
    } catch {
      // géocodage best-effort : on garde la ville même sans coords
    }
    updateStop.mutate(updates);
  };

  const tourLegs = legs(stops, tour.road_factor);
  const total = totalKm(stops, tour.road_factor);
  const mapsUrl = googleMapsUrl(stops);

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= stops.length) return;
    const ids = stops.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate({ tourId: tour.id, orderedIds: ids });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-sm">
          <Badge variant="outline" className="gap-1">
            <Navigation className="h-3.5 w-3.5" />
            {formatKm(total)} au total
          </Badge>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Itinéraire Google Maps
            </a>
          )}
        </div>
        <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Ajouter une date
        </Button>
      </div>

      <TourRouteMap stops={stops} />

      {stops.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-10 border rounded-xl border-dashed">
          Aucune étape. Ajoute ta première date avec le bouton ci-dessus.
        </div>
      ) : (
        <div className="space-y-0">
          {stops.map((stop, i) => {
            const typeMeta = STOP_TYPES.find((t) => t.key === stop.type);
            const leg = tourLegs[i];
            const longLeg = leg?.km != null && leg.km > LONG_LEG_KM;
            return (
              <div key={stop.id}>
                <div className="flex items-start gap-3 rounded-xl border p-3 bg-card">
                  {/* index dot */}
                  <div
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: typeMeta?.color }}
                  >
                    {i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {stop.venue?.name || stop.city || typeMeta?.label}
                      </span>
                      {stop.type !== 'show' && (
                        <Badge variant="secondary" className="text-[10px]">
                          {typeMeta?.label}
                        </Badge>
                      )}
                      {stop.latitude == null && (
                        <Badge variant="outline" className="text-[10px] text-orange-500 border-orange-500/40">
                          Sans GPS
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                      {editingDateId === stop.id ? (
                        <Input
                          type="date"
                          autoFocus
                          defaultValue={stop.stop_date?.slice(0, 10)}
                          onBlur={(e) => saveDate(stop.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveDate(stop.id, e.currentTarget.value);
                            if (e.key === 'Escape') setEditingDateId(null);
                          }}
                          className="h-6 w-[150px] text-xs py-0"
                        />
                      ) : (
                        stop.stop_date && (
                          <button
                            type="button"
                            onClick={() => setEditingDateId(stop.id)}
                            className="rounded px-1 -mx-1 hover:bg-muted hover:text-foreground transition-colors"
                            title="Modifier la date"
                          >
                            {new Date(stop.stop_date).toLocaleDateString('fr-FR', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                            })}
                          </button>
                        )
                      )}
                      {stop.venue ? (
                        stop.venue.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {stop.venue.city}
                          </span>
                        )
                      ) : editingCityId === stop.id ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <Input
                            autoFocus
                            defaultValue={stop.city ?? ''}
                            placeholder="Vienne, Autriche"
                            onBlur={(e) => saveCity(stop.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveCity(stop.id, e.currentTarget.value);
                              if (e.key === 'Escape') setEditingCityId(null);
                            }}
                            className="h-6 w-[170px] text-xs py-0"
                          />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingCityId(stop.id)}
                          className="flex items-center gap-1 rounded px-1 -mx-1 hover:bg-muted hover:text-foreground transition-colors"
                          title="Modifier le lieu"
                        >
                          <MapPin className="h-3 w-3" />
                          {stop.city || 'Ajouter un lieu'}
                        </button>
                      )}
                      {stop.type === 'show' && stop.fee != null && <span>{stop.fee} €</span>}
                    </div>
                  </div>

                  {/* controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={i === stops.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteStop.mutate({ id: stop.id, tourId: tour.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* leg to next stop */}
                {i < stops.length - 1 && (
                  <div
                    className={cn(
                      'flex items-center gap-2 pl-6 py-1.5 text-xs',
                      longLeg ? 'text-orange-500' : 'text-muted-foreground'
                    )}
                  >
                    <div className="w-px h-4 bg-border ml-[7px] mr-2" />
                    {longLeg && <AlertTriangle className="h-3.5 w-3.5" />}
                    <span>
                      {formatKm(leg?.km ?? null)} · {formatDriveTime(leg?.driveMin ?? null)}
                      {longLeg && ' — gros trajet'}
                    </span>
                    {(() => {
                      const url = mappyLegUrl(stopCity(stop), stopCity(stops[i + 1]));
                      return url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                          title="Coût du tronçon (péage + carburant) sur Mappy"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Mappy
                        </a>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddStopDialog open={addOpen} onOpenChange={setAddOpen} tourId={tour.id} stops={stops} />
    </div>
  );
}
