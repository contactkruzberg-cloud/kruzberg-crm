import { mutate } from '@/lib/constellation/docs';
import { ownerStore } from '@/lib/constellation/server';
import type { Band, EntityOverride, Finding, Job, Synthesis, Watch } from '@/lib/constellation/types';

// Import de l'outil local (data/constellation.json), envoyé par morceaux
// depuis la page : chaque appel ajoute ou remplace des groupes (avec leurs
// faits), des réglages d'acteurs, des acteurs notés et la synthèse. Les
// recherches en cours dans l'outil local ne sont pas reprises.

export const maxDuration = 60;

interface Chunk {
  bands?: Band[];
  findings?: Finding[];
  overrides?: Record<string, EntityOverride>;
  watch?: Watch[];
  jobs?: Job[];
  synthesis?: Synthesis;
}

export async function POST(request: Request) {
  const auth = await ownerStore();
  if ('error' in auth) return auth.error;
  const c = (await request.json().catch(() => null)) as Chunk | null;
  if (!c || typeof c !== 'object') return Response.json({ error: 'Fichier illisible.' }, { status: 400 });
  const out = await mutate(auth.store, ({ db }) => {
    const ids = new Set((c.bands ?? []).map((b) => b.id));
    // Une recherche interrompue dans l'outil local repart de zéro ici.
    const bands = (c.bands ?? []).map((b) => (b.status === 'queued' || b.status === 'running' ? { ...b, status: b.exploredAt ? ('done' as const) : ('idle' as const) } : b));
    db.bands = [...db.bands.filter((b) => !ids.has(b.id)), ...bands];
    const fIds = new Set((c.findings ?? []).map((f) => f.bandId));
    db.findings = [...db.findings.filter((f) => !fIds.has(f.bandId)), ...(c.findings ?? [])];
    Object.assign(db.overrides, c.overrides ?? {});
    const wKeys = new Set((c.watch ?? []).map((w) => w.key));
    db.watch = [...db.watch.filter((w) => !wKeys.has(w.key)), ...(c.watch ?? [])];
    // L'historique des recherches terminées, pour le journal.
    const jIds = new Set(db.jobs.map((j) => j.id));
    db.jobs.push(...(c.jobs ?? []).filter((j) => !jIds.has(j.id) && (j.status === 'done' || j.status === 'error')));
    if (c.synthesis) db.synthesis = c.synthesis;
    return { bands: bands.length, findings: c.findings?.length ?? 0 };
  });
  return Response.json({ ok: true, ...out });
}
