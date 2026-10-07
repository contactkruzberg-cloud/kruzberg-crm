'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { geocodeCity } from '@/lib/geocode';
import { geoPlace, type GeoCache, type GeoPlace } from '@/lib/radar/geo';
import type { Lead } from '@/lib/radar/types';
import { useRadarWrite } from '@/hooks/use-radar';

// Nominatim usage policy: 1 req/sec.
export const GEOCODE_DELAY_MS = 1100;
const SAVE_EVERY = 8;

/**
 * City coordinates of the radar (config/geo), and — while `enabled` (map view,
 * "autour de" filter) — locates in the background the cities of `leads` not
 * located yet, saving them so it happens only once.
 */
export function useGeoLocate(leads: Lead[], geo: GeoCache, geoExists: boolean, enabled: boolean) {
  const write = useRadarWrite();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Results not saved yet, merged into the cache for display.
  const [pending, setPending] = useState<GeoCache>({});
  const cache = useMemo(() => ({ ...geo, ...pending }), [geo, pending]);
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const docExists = useRef(geoExists);
  docExists.current ||= geoExists;

  // Unique places: the loop restarts only when this set changes (tab / filters), not at each city found.
  const places = useMemo(() => {
    const m = new Map<string, GeoPlace>();
    for (const l of leads) {
      const p = geoPlace(l);
      if (p) m.set(p.key, p);
    }
    return [...m.values()];
  }, [leads]);
  const viewKey = enabled ? places.map((p) => p.key).join(',') : '';

  useEffect(() => {
    if (!viewKey) return;
    const queue = places.filter((p) => !(p.key in cacheRef.current));
    if (!queue.length) return;
    let cancelled = false;
    let batch: GeoCache = {};
    const save = async () => {
      if (!Object.keys(batch).length) return;
      const data = batch;
      batch = {};
      const exists = docExists.current;
      await write.mutateAsync({ op: exists ? 'update' : 'set', collection: 'config', id: 'geo', data: exists ? data : { ...cacheRef.current, ...data } });
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
          // Network / rate limit: not cached, retried next time.
          await new Promise((r) => setTimeout(r, GEOCODE_DELAY_MS * 3));
          continue;
        }
        if (cancelled) break;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  return { cache, progress };
}
