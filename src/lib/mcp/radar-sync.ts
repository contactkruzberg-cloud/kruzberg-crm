import { OWNER_FIELDS, type RadarCollection } from './radar';
import { ToolError } from './service';
import { selectAll, type Filter, type Row, type Store } from './store';

// Two-way sync between the Booking Radar of the claude.ai artifact (its own
// database, unchanged, still fed by the daily search) and the radar of the
// CRM (radar_docs). An hourly cloud task carries the data; the logic lives here:
//
//   1. radarSyncStatus: the task sends the artifact's {id: version}. Docs whose
//      artifact version moved are requested in full; docs that only changed in
//      the CRM get their artifact write computed right away.
//   2. radarSyncPush: the task sends the requested artifact docs. Each one is
//      merged field by field with the CRM copy against the last synced state
//      (3-way); the CRM copy is updated, and the write for the artifact returned.
//   3. radarSyncAck: the task reports the artifact versions after writing; the
//      merged state becomes the new base.
//
// Conflict (same field changed on both sides since the last sync): Greg's
// triage fields keep the CRM value, factual fields keep the artifact value
// (where the daily search writes).

interface Deps {
  store: Store;
}

export interface ArtifactWrite {
  op: 'set' | 'update';
  collection: RadarCollection;
  doc_id: string;
  data: Row;
  if_version?: number;
}

const eq = (col: string, value: string | number): Filter => ({ col, op: 'eq', value });
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Field-level 3-way merge. `base` null = never synced: every difference is a conflict. */
export function merge3(base: Row | null, artifact: Row, crm: Row): Row {
  const out: Row = {};
  const keys = new Set([...Object.keys(artifact), ...Object.keys(crm), ...Object.keys(base ?? {})]);
  for (const k of keys) {
    const a = artifact[k];
    const c = crm[k];
    const b = base ? base[k] : undefined;
    let v: unknown;
    if (same(a, c)) v = a;
    else if (base && same(a, b)) v = c; // only the CRM changed it
    else if (base && same(c, b)) v = a; // only the artifact changed it
    else v = OWNER_FIELDS.test(k) ? (c !== undefined ? c : a) : a !== undefined ? a : c;
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Update payload turning `from` into `to` (removed fields as {__delete__: true}). */
function patchFor(from: Row, to: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(to)) if (!same(from[k], v)) out[k] = v;
  for (const k of Object.keys(from)) if (!(k in to)) out[k] = { __delete__: true };
  return out;
}

async function load(deps: Deps, collection: RadarCollection) {
  const [docs, states] = await Promise.all([
    selectAll(deps.store, 'radar_docs', { filters: [eq('collection', collection)] }),
    selectAll(deps.store, 'radar_sync', { filters: [eq('collection', collection)] }),
  ]);
  return {
    docs: new Map(docs.map((d) => [String(d.id), d])),
    states: new Map(states.map((s) => [String(s.id), s])),
  };
}

async function saveState(deps: Deps, collection: RadarCollection, id: string, existing: Row | undefined, patch: Row) {
  const now = new Date().toISOString();
  if (existing) await deps.store.update('radar_sync', [eq('collection', collection), eq('id', id)], { ...patch, synced_at: now });
  else await deps.store.insert('radar_sync', { collection, id, base: {}, ...patch, synced_at: now });
}

export async function radarSyncStatus(deps: Deps, args: { collection: RadarCollection; artifact_versions: Record<string, number> }) {
  const { collection } = args;
  const av = args.artifact_versions;
  const { docs, states } = await load(deps, collection);
  const now = new Date().toISOString();

  // Starting point after the initial import (or an interrupted baseline): a
  // document present on both sides without sync state is taken as identical,
  // with the artifact version seen now. Done in bulk, so it can resume.
  const adopt: Row[] = [];
  for (const [id, doc] of docs) {
    if (!states.has(id) && av[id] != null) {
      const s = { collection, id, base: doc.data ?? {}, artifact_version: av[id], crm_version: Number(doc.version), pending: null, synced_at: now };
      adopt.push(s);
      states.set(id, s);
    }
  }
  if (adopt.length) await deps.store.insertMany('radar_sync', adopt);

  const fetch: string[] = [];
  const writes: ArtifactWrite[] = [];
  // Per-document state writes are bounded per call to stay within the request time limit.
  const MAX_STATE_WRITES = 150;
  let stateWrites = 0;
  let incomplete = false;
  for (const id of new Set([...Object.keys(av), ...docs.keys()])) {
    if (stateWrites >= MAX_STATE_WRITES) {
      incomplete = true;
      break;
    }
    const a = av[id];
    const doc = docs.get(id);
    let state = states.get(id);
    // Baseline after the initial import: adopt the artifact version seen now.
    if (state && a != null && state.artifact_version == null) {
      await saveState(deps, collection, id, state, { artifact_version: a });
      stateWrites++;
      state = { ...state, artifact_version: a };
    }
    const artifactChanged = a != null && (!state || Number(state.artifact_version) !== a);
    const crmChanged = !!doc && (!state || Number(state.crm_version) !== Number(doc.version));

    if (artifactChanged) {
      fetch.push(id);
    } else if (doc && (crmChanged || a == null)) {
      const data = (doc.data ?? {}) as Row;
      // Pushed to the artifact: an update when it has the doc (unchanged there), a creation otherwise.
      writes.push(
        a != null
          ? { op: 'update', collection, doc_id: id, data: patchFor((state?.base ?? {}) as Row, data), if_version: a }
          : { op: 'set', collection, doc_id: id, data },
      );
      await saveState(deps, collection, id, state, { pending: { base: data, crm_version: Number(doc.version) } });
      stateWrites++;
    }
  }
  return {
    collection,
    ...(adopt.length ? { initialised: adopt.length } : {}),
    fetch,
    artifact_writes: writes.filter((w) => w.op === 'set' || Object.keys(w.data).length > 0),
    ...(incomplete ? { incomplete: true } : {}),
    next_step: incomplete
      ? 'Traitement partiel : applique ce qui est renvoyé (push, writes, ack) puis rappelle radar_sync_status pour la suite.'
      : fetch.length
      ? 'Envoie le contenu des documents listés dans fetch avec radar_sync_push (25 maximum par appel), puis applique toutes les artifact_writes.'
      : 'Applique les artifact_writes (ArtifactData batch), puis confirme avec radar_sync_ack.',
  };
}

export async function radarSyncPush(
  deps: Deps,
  args: { collection: RadarCollection; docs: { id: string; version: number; data: Row }[] },
) {
  const { collection } = args;
  const { docs, states } = await load(deps, collection);
  const writes: ArtifactWrite[] = [];
  const crmUpdated: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const a of args.docs) {
    const state = states.get(a.id);
    const doc = docs.get(a.id);
    if (!doc) {
      const row = await deps.store.insert('radar_docs', { collection, id: a.id, data: a.data });
      await saveState(deps, collection, a.id, state, { base: a.data, artifact_version: a.version, crm_version: Number(row.version), pending: null });
      crmUpdated.push(a.id);
      continue;
    }
    const crmData = (doc.data ?? {}) as Row;
    const merged = merge3(state ? ((state.base ?? {}) as Row) : null, a.data, crmData);
    let crmVersion = Number(doc.version);
    if (Object.keys(patchFor(crmData, merged)).length) {
      const [updated] = await deps.store.update(
        'radar_docs',
        [eq('collection', collection), eq('id', a.id), eq('version', crmVersion)],
        { data: merged },
      );
      if (!updated) {
        skipped.push({ id: a.id, reason: 'modifié dans le CRM pendant la synchro : repris au prochain passage' });
        continue;
      }
      crmVersion = Number(updated.version);
      crmUpdated.push(a.id);
    }
    const toArtifact = patchFor(a.data, merged);
    if (Object.keys(toArtifact).length) {
      writes.push({ op: 'update', collection, doc_id: a.id, data: toArtifact, if_version: a.version });
      await saveState(deps, collection, a.id, state, { pending: { base: merged, crm_version: crmVersion } });
    } else {
      await saveState(deps, collection, a.id, state, { base: merged, artifact_version: a.version, crm_version: crmVersion, pending: null });
    }
  }
  return { collection, crm_updated: crmUpdated.length, artifact_writes: writes, skipped };
}

export async function radarSyncAck(deps: Deps, args: { collection: RadarCollection; results: { id: string; version: number }[] }) {
  const { states } = await load(deps, args.collection);
  let committed = 0;
  const unknown: string[] = [];
  for (const r of args.results) {
    const state = states.get(r.id);
    const pending = state?.pending as { base: Row; crm_version: number } | null | undefined;
    if (!state || !pending) {
      unknown.push(r.id);
      continue;
    }
    await saveState(deps, args.collection, r.id, state, {
      base: pending.base,
      artifact_version: r.version,
      crm_version: pending.crm_version,
      pending: null,
    });
    committed++;
  }
  return { collection: args.collection, committed, ...(unknown.length ? { ignored: unknown } : {}) };
}

/** After the initial import: the CRM copy is the common base, artifact versions adopted at the first sync. */
export async function radarSyncBaseline(deps: Deps, args: { collection: RadarCollection }) {
  const { docs, states } = await load(deps, args.collection);
  const now = new Date().toISOString();
  const rows = [...docs]
    .filter(([id]) => !states.has(id))
    .map(([id, doc]) => ({ collection: args.collection, id, base: doc.data ?? {}, artifact_version: null, crm_version: Number(doc.version), pending: null, synced_at: now }));
  if (rows.length) await deps.store.insertMany('radar_sync', rows);
  return { collection: args.collection, baselined: rows.length, already: states.size };
}
