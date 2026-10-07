'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Locate, MapPin } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { geocodeCity } from '@/lib/geocode';
import { geoPlace, type GeoCache, type GeoPlace } from '@/lib/radar/geo';
import type { Lead } from '@/lib/radar/types';
import { useRadarWrite } from '@/hooks/use-radar';
import type { MapGroup } from './radar-map-inner';

const RadarMapInner = dynamic(() => import('./radar-map-inner'), { ssr: false });

// Nominatim usage policy: 1 req/sec.
const GEOCODE_DELAY_MS = 1100;
const SAVE_EVERY = 8;

/** Leads of the current view (tab + filters) on a map, one circle per city. Cities are located once, then remembered. */
export function RadarMap({ leads, geo, geoExists, onOpen }: { leads: Lead[]; geo: GeoCache; geoExists: boolean; onOpen: (id: string) => void }) {
  const write = useRadarWrite();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Results not yet saved, merged into the cache for display.
  const [pending, setPending] = useState<GeoCache>({});
  const cache = useMemo(() => ({ ...geo, ...pending }), [geo, pending]);

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
  // Unique places of the current view: the locating loop restarts only when the view changes.
  const places = useMemo(() => {
    const m = new Map<string, GeoPlace>();
    for (const { p } of placed) if (p) m.set(p.key, p);
    return [...m.values()];
  }, [placed]);
  const viewKey = places.map((p) => p.key).join(',');
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const noPlace = placed.filter(({ p }) => !p).length;
  const notFound = placed.filter(({ p }) => p && cache[p.key] === null).length;

  // Locate the missing cities in the background while the map is open.
  const docExists = useRef(geoExists);
  docExists.current ||= geoExists;
  useEffect(() => {
    const queue = places.filter((p) => !(p.key in cacheRef.current));
    if (!queue.length) return;
    let cancelled = false;
    let batch: GeoCache = {};
    const save = async () => {
      if (!Object.keys(batch).length) return;
      const data = batch;
      batch = {};
      await write.mutateAsync({ op: docExists.current ? 'update' : 'set', collection: 'config', id: 'geo', data: docExists.current ? data : { ...cacheRef.current, ...data } });
      docExists.current = true;
    };
    (async () => {
      setProgress({ done: 0, total: queue.length });
      for (let i = 0; i < queue.length && !cancelled; i++) {
        const p = queue[i];
        let pos: [number, number] | null = null;
        try {
          const r = await geocodeCity(p.query, p.country);
          pos = r ? [Math.round(r.lat * 1e4) / 1e4, Math.round(r.lng * 1e4) / 1e4] : null;
        } catch {
          // Network / rate limit: leave it for next time (not cached).
          await new Promise((r) => setTimeout(r, GEOCODE_DELAY_MS * 3));
          continue;
        }
        batch[p.key] = pos;
        setPending((prev) => ({ ...prev, [p.key]: pos }));
        setProgress({ done: i + 1, total: queue.length });
        if (Object.keys(batch).length >= SAVE_EVERY) await save().catch(() => {});
        await new Promise((r) => setTimeout(r, GEOCODE_DELAY_MS));
      }
      await save().catch(() => {});
      if (!cancelled) setProgress(null);
    })();
    return () => {
      cancelled = true;
      setProgress(null);
      void save().catch(() => {});
    };
    // Restart only when the cities of the view change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

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
        <RadarMapInner groups={groups} onOpen={onOpen} />
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
