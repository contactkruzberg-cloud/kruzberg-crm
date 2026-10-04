import { ToolError } from './service';
import { selectAll, UniqueViolationError, type Filter, type Row, type Store } from './store';

// Booking Radar document store (table radar_docs): same model as the former
// claude.ai artifact database — collections of JSON documents, each with a
// version bumped on every write, and writes pinned to the version last read.

export const RADAR_COLLECTIONS = ['leads', 'config', 'runs', 'outbox'] as const;
export type RadarCollection = (typeof RADAR_COLLECTIONS)[number];
export const MAX_RADAR_BATCH = 50;

/** Fields of a lead that belong to Greg (triage, drafts, CRM hand-off): the daily search must not touch them. */
export const OWNER_FIELDS = /^(status|statusAt|notes|dismissed|dismissReason|dismissedAt|addedAt|draft\w*|crm\w*|contactChannel|contactedAt|chanceAdj)$/;

interface Deps {
  store: Store;
}

const eq = (col: string, value: string | number): Filter => ({ col, op: 'eq', value });

function present(row: Row, fields?: string[]) {
  const data = (row.data ?? {}) as Row;
  const projected = fields?.length ? Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]])) : data;
  return { id: row.id as string, version: Number(row.version), data: projected };
}

function matches(data: Row, where: [string, 'eq' | 'ne' | 'exists' | 'missing', unknown][] | undefined) {
  for (const [field, op, value] of where ?? []) {
    const v = data[field];
    const present = v !== undefined && v !== null && v !== '';
    if (op === 'eq' && v !== value) return false;
    if (op === 'ne' && v === value) return false;
    if (op === 'exists' && !present) return false;
    if (op === 'missing' && present) return false;
  }
  return true;
}

export async function radarList(
  deps: Deps,
  args: {
    collection: RadarCollection;
    fields?: string[];
    where?: [string, 'eq' | 'ne' | 'exists' | 'missing', unknown][];
    limit?: number;
    cursor?: string;
  },
) {
  const rows = await selectAll(deps.store, 'radar_docs', { filters: [eq('collection', args.collection)] });
  const filtered = rows.filter((r) => matches((r.data ?? {}) as Row, args.where)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const offset = args.cursor ? Number.parseInt(args.cursor, 10) : 0;
  if (!Number.isInteger(offset) || offset < 0) throw new ToolError('cursor invalide : repasse le next_cursor reçu.');
  const limit = Math.min(Math.max(args.limit ?? 200, 1), 1000);
  const page = filtered.slice(offset, offset + limit);
  return {
    collection: args.collection,
    total: filtered.length,
    docs: page.map((r) => present(r, args.fields)),
    next_cursor: offset + limit < filtered.length ? String(offset + limit) : null,
  };
}

export async function radarGet(deps: Deps, args: { collection: RadarCollection; id: string }) {
  const [row] = await deps.store.select('radar_docs', { filters: [eq('collection', args.collection), eq('id', args.id)], limit: 1 });
  if (!row) throw new ToolError(`Document introuvable : ${args.collection}/${args.id}.`);
  return present(row);
}

export interface RadarWrite {
  op: 'set' | 'update';
  collection: RadarCollection;
  id: string;
  data: Row;
  if_version?: number;
}

/** Applies `{ field: { __delete__: true } }` removals and a shallow merge. */
function merge(current: Row, patch: Row): Row {
  const out: Row = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && (v as Row).__delete__ === true) delete out[k];
    else out[k] = v;
  }
  return out;
}

const hasDeleteMarker = (v: unknown): boolean =>
  !!v && typeof v === 'object' && (Array.isArray(v) ? v.some(hasDeleteMarker) : (v as Row).__delete__ === true || Object.values(v as Row).some(hasDeleteMarker));

/**
 * Up to 50 writes. Every write to an existing document must carry the
 * if_version last read; if one is missing or stale, nothing is written.
 * Owner fields of leads are refused on update unless allow_owner_fields.
 */
export async function radarBatch(deps: Deps, args: { writes: RadarWrite[]; allow_owner_fields?: boolean }) {
  const { writes } = args;
  if (writes.length > MAX_RADAR_BATCH) throw new ToolError(`${MAX_RADAR_BATCH} écritures maximum par appel (reçu : ${writes.length}).`);
  const keys = writes.map((w) => `${w.collection}/${w.id}`);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) throw new ToolError(`Le document ${dup} apparaît plusieurs fois dans le lot.`);

  // 1. Check everything before writing anything.
  const plan: { w: RadarWrite; current: Row | null }[] = [];
  for (const w of writes) {
    const [current] = await deps.store.select('radar_docs', { filters: [eq('collection', w.collection), eq('id', w.id)], limit: 1 });
    const where = `${w.collection}/${w.id}`;
    if (w.op === 'set' && hasDeleteMarker(w.data)) throw new ToolError(`${where} : __delete__ n'est accepté que dans un "update".`);
    if (w.op === 'update' && !current) throw new ToolError(`${where} : document introuvable (utilise "set" pour le créer).`);
    if (current) {
      if (w.if_version == null) {
        throw new ToolError(`${where} existe déjà : passe if_version (version lue : ${current.version}). Rien n'a été écrit.`);
      }
      if (Number(current.version) !== w.if_version) {
        throw new ToolError(
          `Conflit de version sur ${where} : if_version ${w.if_version}, version actuelle ${current.version}. Relis le document puis refais l'écriture. Rien n'a été écrit.`,
        );
      }
    }
    if (w.op === 'update' && w.collection === 'leads' && !args.allow_owner_fields) {
      const touched = Object.keys(w.data).filter((k) => OWNER_FIELDS.test(k));
      if (touched.length) {
        throw new ToolError(
          `${where} : champs réservés à Greg (${touched.join(', ')}) — la veille ne modifie que les champs factuels. Rien n'a été écrit.`,
        );
      }
    }
    plan.push({ w, current: current ?? null });
  }

  // 2. Write, each one pinned to the version checked above.
  const results = [];
  for (const { w, current } of plan) {
    let row: Row;
    if (!current) {
      try {
        row = await deps.store.insert('radar_docs', { collection: w.collection, id: w.id, data: w.data });
      } catch (err) {
        if (err instanceof UniqueViolationError) throw new ToolError(`${w.collection}/${w.id} vient d'être créé par ailleurs : relis-le puis refais l'écriture.`);
        throw err;
      }
    } else {
      const data = w.op === 'set' ? w.data : merge((current.data ?? {}) as Row, w.data);
      const [updated] = await deps.store.update(
        'radar_docs',
        [eq('collection', w.collection), eq('id', w.id), eq('version', Number(current.version))],
        { data },
      );
      if (!updated) throw new ToolError(`Conflit de version sur ${w.collection}/${w.id} pendant l'écriture : relis-le puis refais l'écriture.`);
      row = updated;
    }
    results.push({ id: row.id, collection: w.collection, op: current ? w.op : 'create', version: Number(row.version) });
  }
  return { written: results.length, results };
}
