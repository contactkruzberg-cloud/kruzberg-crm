import { selectAll, UniqueViolationError, type Row, type Store } from '@/lib/mcp/store';
import type { Band, Db, EntityOverride, Finding, Job, Synthesis, Watch } from './types';

// Constellation dans la table constellation_docs : un document par groupe,
// un document par groupe pour ses faits (une nouvelle exploration le
// réécrit), un par réglage d'acteur, par acteur noté en séance, par recherche,
// et la configuration (synthèse, lancements de la routine).
// On charge tout, on modifie en mémoire, puis on n'écrit que les documents qui
// ont changé, chacun conditionné à la version lue (conflit = on recommence).

export const COLLECTIONS = ['bands', 'findings', 'overrides', 'watch', 'jobs', 'config'] as const;
export type Collection = (typeof COLLECTIONS)[number];
export const DOC_ID = /^[A-Za-z0-9_.~:@+-]{1,200}$/;

/** Lancements de la routine de recherche (config/launch). */
export interface Launch {
  /** Derniers lancements (ISO), du plus ancien au plus récent. */
  fires: string[];
  /** Dernière activité de la routine (prise ou rendu d'une recherche). */
  activeAt?: string;
  sessionUrl?: string;
  error?: string;
}

export interface Loaded {
  db: Db;
  launch: Launch;
  /** Version et contenu lus, par « collection/id ». */
  snap: Map<string, { version: number; json: string }>;
}

const k = (c: Collection, id: string) => `${c}/${id}`;

export async function loadDb(store: Store): Promise<Loaded> {
  const rows = await selectAll(store, 'constellation_docs', { order: [{ col: 'collection', asc: true }, { col: 'id', asc: true }] });
  const db: Db = { version: 1, bands: [], findings: [], overrides: {}, watch: [], jobs: [] };
  let launch: Launch = { fires: [] };
  const snap = new Map<string, { version: number; json: string }>();
  for (const r of rows) {
    const c = r.collection as Collection;
    const id = String(r.id);
    const data = (r.data ?? {}) as Row;
    snap.set(k(c, id), { version: Number(r.version), json: JSON.stringify(data) });
    if (c === 'bands') db.bands.push(data as unknown as Band);
    else if (c === 'findings') db.findings.push(...(((data.items as Finding[]) ?? []) as Finding[]));
    else if (c === 'overrides') db.overrides[id] = data as EntityOverride;
    else if (c === 'watch') db.watch.push(data as unknown as Watch);
    else if (c === 'jobs') db.jobs.push(data as unknown as Job);
    else if (c === 'config' && id === 'synthesis') db.synthesis = data as unknown as Synthesis;
    else if (c === 'config' && id === 'launch') launch = { fires: [], ...(data as Partial<Launch>) };
  }
  db.bands.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  db.jobs.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  return { db, launch, snap };
}

/** Les documents qui représentent la base en mémoire. */
export function toDocs(db: Db, launch: Launch): Map<string, { c: Collection; id: string; data: Row }> {
  const out = new Map<string, { c: Collection; id: string; data: Row }>();
  const put = (c: Collection, id: string, data: unknown) => {
    if (DOC_ID.test(id)) out.set(k(c, id), { c, id, data: data as Row });
  };
  for (const b of db.bands) put('bands', b.id, b);
  const byBand = new Map<string, Finding[]>();
  for (const f of db.findings) (byBand.get(f.bandId) ?? byBand.set(f.bandId, []).get(f.bandId)!).push(f);
  // Un groupe réexploré sans résultat garde un document vide (sinon ses anciens faits resteraient).
  for (const b of db.bands) if (!byBand.has(b.id)) byBand.set(b.id, []);
  for (const [bandId, items] of byBand) put('findings', bandId, { items });
  for (const [key, o] of Object.entries(db.overrides)) put('overrides', key, o);
  for (const w of db.watch) put('watch', w.key, w);
  for (const j of db.jobs) put('jobs', j.id, j);
  if (db.synthesis) put('config', 'synthesis', db.synthesis);
  put('config', 'launch', launch);
  return out;
}

export class ConflictError extends Error {
  constructor() {
    super('Conflit d’écriture sur Constellation : réessaie.');
  }
}

/** Écrit les documents nouveaux ou modifiés depuis le chargement. */
export async function saveDb(store: Store, loaded: Loaded): Promise<number> {
  const docs = toDocs(loaded.db, loaded.launch);
  const inserts: Row[] = [];
  let writes = 0;
  for (const [key, d] of docs) {
    const json = JSON.stringify(d.data);
    const prev = loaded.snap.get(key);
    if (!prev) {
      inserts.push({ collection: d.c, id: d.id, data: d.data });
      continue;
    }
    if (prev.json === json) continue;
    const updated = await store.update(
      'constellation_docs',
      [
        { col: 'collection', op: 'eq', value: d.c },
        { col: 'id', op: 'eq', value: d.id },
        { col: 'version', op: 'eq', value: prev.version },
      ],
      { data: d.data },
    );
    if (!updated.length) throw new ConflictError();
    writes++;
  }
  if (inserts.length) {
    try {
      await store.insertMany('constellation_docs', inserts);
    } catch (e) {
      if (e instanceof UniqueViolationError) throw new ConflictError();
      throw e;
    }
  }
  return writes + inserts.length;
}

/**
 * Charge, applique fn, enregistre. Une écriture concurrente sur le même
 * document (la routine rend une recherche pendant un clic) fait recommencer.
 */
export async function mutate<T>(store: Store, fn: (l: Loaded) => T | Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const loaded = await loadDb(store);
    const out = await fn(loaded);
    try {
      await saveDb(store, loaded);
      return out;
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt >= 2) throw e;
    }
  }
}
