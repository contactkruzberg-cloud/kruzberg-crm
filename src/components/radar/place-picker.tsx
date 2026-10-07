'use client';

import { useState } from 'react';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { searchPlaces } from '@/lib/geocode';
import type { NearPlace } from '@/lib/radar/geo';
import { cn } from '@/lib/utils';

/** Pick a town anywhere in Europe (OpenStreetMap search): "Berlin", "Gand", "Clermont-Ferrand"… */
export function PlacePicker({
  value,
  onChange,
  placeholder = 'Autour de… (ville)',
  className,
}: {
  value: NearPlace | null | undefined;
  onChange: (p: NearPlace | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<NearPlace[] | null>(null);

  const search = async () => {
    const t = q.trim();
    if (!t) return;
    setBusy(true);
    try {
      const r = await searchPlaces(t);
      // One exact hit: take it directly.
      if (r.length === 1) {
        onChange(r[0]);
        setQ('');
        setResults(null);
      } else setResults(r);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  if (value) {
    return (
      <span className={cn('inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 pl-2.5 pr-1 text-xs font-medium', className)}>
        <MapPin className="h-3.5 w-3.5 text-primary" />
        {value.label}
        <button type="button" onClick={() => onChange(null)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Retirer le lieu">
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setResults(null);
          }}
          onKeyDown={(e) => e.key === 'Escape' && setResults(null)}
          placeholder={placeholder}
          className="h-8 w-44 text-xs"
        />
        <Button type="submit" size="icon" variant="outline" className="h-8 w-8" disabled={!q.trim() || busy} title="Chercher le lieu">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        </Button>
      </form>
      {results && (
        <div className="absolute left-0 top-9 z-50 w-72 rounded-md border bg-popover p-1 shadow-lg">
          {results.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Aucun lieu trouvé</p>
          ) : (
            results.map((r) => (
              <button
                key={`${r.lat},${r.lng}`}
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={() => {
                  onChange(r);
                  setQ('');
                  setResults(null);
                }}
              >
                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                {r.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
