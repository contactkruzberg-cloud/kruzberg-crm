'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { Locate, MapPin } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { geoPlace, type GeoCache, type NearPlace } from '@/lib/radar/geo';
import type { Lead } from '@/lib/radar/types';
import type { MapGroup } from './radar-map-inner';
import { GEOCODE_DELAY_MS } from './use-geo-locate';

const RadarMapInner = dynamic(() => import('./radar-map-inner'), { ssr: false });

/** Leads of the current view (tab + filters) on a map, one circle per city. */
export function RadarMap({
  leads,
  cache,
  progress,
  near,
  radius,
  onOpen,
}: {
  leads: Lead[];
  cache: GeoCache;
  progress: { done: number; total: number } | null;
  near?: NearPlace | null;
  radius?: number;
  onOpen: (id: string) => void;
}) {
  const placed = useMemo(() => leads.map((l) => ({ l, p: geoPlace(l) })), [leads]);
  const groups = useMemo(() => {
    const m = new Map<string, MapGroup>();
    for (const { l, p } of placed) {
      const pos = p && cache[p.key];
      if (!p || !pos) continue;
      const g = m.get(p.key) ?? { key: p.key, label: p.label, pos, leads: [] };
      g.leads.push(l);
      m.set(p.key, g);
    }
    return [...m.values()];
  }, [placed, cache]);
  const noPlace = placed.filter(({ p }) => !p).length;
  const notFound = placed.filter(({ p }) => p && cache[p.key] === null).length;

  const shown = groups.reduce((s, g) => s + g.leads.length, 0);

  return (
    <div className="space-y-2">
      {progress && progress.total > 0 && (
        <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Locate className="h-3.5 w-3.5 animate-pulse text-primary" />
            <span>
              Localisation des villes… {progress.done} / {progress.total}
              <span className="text-muted-foreground"> (une seule fois, ~{Math.ceil(((progress.total - progress.done) * GEOCODE_DELAY_MS) / 1000)} s restantes)</span>
            </span>
          </div>
          <Progress value={(progress.done / progress.total) * 100} />
        </div>
      )}
      <div className="h-[calc(100vh-18rem)] min-h-[420px] overflow-hidden rounded-xl border">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <RadarMapInner groups={groups} near={near} radius={radius} onOpen={onOpen} />
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {shown} piste{shown > 1 ? 's' : ''} dans {groups.length} ville{groups.length > 1 ? 's' : ''}
        </span>
        {noPlace + notFound > 0 && <span>{noPlace + notFound} sans ville localisable (ex. « France », en ligne)</span>}
        <span className="flex items-center gap-2">
          Chances :
          {(
            [
              ['#22c55e', 'fortes'],
              ['#a78bfa', 'réelles'],
              ['#f97316', 'faibles'],
              ['#64748b', 'très faibles'],
            ] as const
          ).map(([c, t]) => (
            <span key={t} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {t}
            </span>
          ))}
        </span>
      </p>
    </div>
  );
}
