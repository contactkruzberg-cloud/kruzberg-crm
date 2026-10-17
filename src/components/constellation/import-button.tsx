'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import type { Db } from '@/lib/constellation/types';
import { Button } from './ui';

// Reprise de l'outil local : on choisit son data/constellation.json, la page
// l'envoie par morceaux (une requête est limitée à quelques Mo).
const PER_CHUNK = 15;

export function ImportButton({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const send = async (body: unknown) => {
    const r = await fetch('/api/constellation/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `Erreur ${r.status}`);
  };

  const run = async (file: File) => {
    try {
      setProgress('Lecture du fichier…');
      const db = JSON.parse(await file.text()) as Db;
      if (!Array.isArray(db.bands) || !Array.isArray(db.findings)) throw new Error('Ce fichier n’est pas un export de Constellation.');
      await send({ overrides: db.overrides ?? {}, watch: db.watch ?? [], synthesis: db.synthesis, jobs: (db.jobs ?? []).slice(-300) });
      for (let i = 0; i < db.bands.length; i += PER_CHUNK) {
        const bands = db.bands.slice(i, i + PER_CHUNK);
        const ids = new Set(bands.map((b) => b.id));
        setProgress(`Groupes ${i + 1} à ${Math.min(i + PER_CHUNK, db.bands.length)} sur ${db.bands.length}…`);
        await send({ bands, findings: db.findings.filter((f) => ids.has(f.bandId)) });
      }
      setProgress(null);
      onDone();
    } catch (e) {
      setProgress(null);
      alert(`Import interrompu : ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void run(f);
        }}
      />
      <Button size="sm" disabled={!!progress} onClick={() => input.current?.click()} title="Reprendre data/constellation.json de l’outil local">
        {progress ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} {progress ?? 'Importer'}
      </Button>
    </>
  );
}
