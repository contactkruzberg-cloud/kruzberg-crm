'use client';

// Leaflet part of the radar map, loaded client-side only (see radar-map.tsx).
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, Tooltip, useMap } from 'react-leaflet';
import { latLngBounds } from 'leaflet';
import { MapTiles } from '@/components/shared/map-tiles';
import { CATL, chance, TIER, type Tier } from '@/lib/radar/logic';
import type { Lead } from '@/lib/radar/types';

export interface MapGroup {
  key: string;
  label: string;
  pos: [number, number];
  leads: Lead[];
}

const TIER_HEX: Record<Tier, string> = { hi: '#22c55e', mid: '#a78bfa', lo: '#f97316', vlo: '#64748b' };

/** Zoom to the markers whenever the set of places changes (tab / filters). */
function FitBounds({ groups }: { groups: MapGroup[] }) {
  const map = useMap();
  const sig = groups.map((g) => g.key).join(',');
  useEffect(() => {
    if (!groups.length) return;
    if (groups.length === 1) map.setView(groups[0].pos, 11);
    else map.fitBounds(latLngBounds(groups.map((g) => g.pos)), { padding: [30, 30], maxZoom: 11 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, map]);
  return null;
}

export default function RadarMapInner({ groups, onOpen }: { groups: MapGroup[]; onOpen: (id: string) => void }) {
  return (
    <MapContainer center={[46.6, 4.5]} zoom={5} className="h-full w-full" scrollWheelZoom>
      <MapTiles />
      <FitBounds groups={groups} />
      {groups.map((g) => {
        const scored = g.leads.map((l) => ({ l, sc: chance(l).sc })).sort((a, b) => b.sc - a.sc);
        const color = TIER_HEX[TIER(scored[0].sc)[1]];
        const n = g.leads.length;
        return (
          <CircleMarker
            key={g.key}
            center={g.pos}
            radius={Math.min(6 + Math.sqrt(n) * 3, 22)}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.6, weight: 2 }}
          >
            <Tooltip>
              <span className="text-xs">
                <strong>{g.label}</strong> · {n} piste{n > 1 ? 's' : ''}
              </span>
            </Tooltip>
            <Popup maxWidth={320}>
              <div className="space-y-1">
                <div className="text-sm font-semibold">
                  {g.label} · {n} piste{n > 1 ? 's' : ''}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {scored.map(({ l, sc }) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => onOpen(l.id)}
                      className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-black/10"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TIER_HEX[TIER(sc)[1]] }} />
                      <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                      <span className="shrink-0 opacity-60">{CATL[l.cat] || l.cat}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
