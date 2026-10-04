import { createHash, randomUUID } from 'node:crypto';
import {
  EXPENSE_CATEGORIES,
  PRIORITIES,
  RELANCE_METHODS,
  STAGES,
  STOP_TYPES,
  TEMPLATE_CATEGORIES,
  TOUR_STATUSES,
  VENUE_TYPES,
  type DealStage,
} from '@/types/database';
import { z } from 'zod';
import {
  CASCADES,
  CONTACT_METHOD_IDS,
  ENTITIES,
  ENTITY_KEYS,
  entityUrl,
  LOGGABLE_ACTIVITY_TYPES,
  TONE_IDS,
  type EntityKey,
} from './entities';
import { normalizeEmail, normalizeName } from './normalize';
import { ToolError } from './service';
import { selectAll, UniqueViolationError, type Filter, type Row, type Store } from './store';

export interface CrmDeps {
  store: Store;
  baseUrl: string;
}

export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;
export const MAX_BULK = 50;
const CLOSED_STAGES: DealStage[] = ['confirme', 'termine', 'refuse'];

const ACTIVE: Filter = { col: 'deleted_at', op: 'is_null' };
const eq = (col: string, value: string | number | boolean): Filter => ({ col, op: 'eq', value });
const def = (e: EntityKey) => ENTITIES[e];

// ---------------------------------------------------------------- helpers

/** Row as returned to the client: no owner id, plus archived flag, label and app URL. */
export function present(deps: CrmDeps, entity: EntityKey, row: Row): Row {
  const { user_id: _u, deleted_batch: _b, deleted_show_on_website: _s, ...rest } = row;
  void _u;
  void _b;
  void _s;
  return {
    ...rest,
    archived: row.deleted_at != null,
    display_name: def(entity).name(row),
    url: entityUrl(deps.baseUrl, entity, row),
  };
}

async function findRow(deps: CrmDeps, entity: EntityKey, id: string): Promise<Row | null> {
  const [row] = await deps.store.select(def(entity).table, { filters: [eq('id', id)], limit: 1 });
  return row ?? null;
}

async function mustGet(deps: CrmDeps, entity: EntityKey, id: string, opts: { allowArchived?: boolean } = {}) {
  const row = await findRow(deps, entity, id);
  if (!row) throw new ToolError(`${capitalize(def(entity).label)} introuvable : ${id}.`);
  if (!opts.allowArchived && row.deleted_at != null) {
    throw new ToolError(
      `${capitalize(def(entity).label)} ${id} est archivé(e) depuis le ${row.deleted_at}. Restaure-la d'abord avec restore (entity "${entity}").`,
    );
  }
  return row;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** References (venue_id, deal_id…) must point to existing, active rows of the owner. */
async function checkRefs(deps: CrmDeps, entity: EntityKey, values: Row) {
  for (const ref of def(entity).refs) {
    const id = values[ref.col];
    if (id == null) continue;
    const row = await findRow(deps, ref.entity, String(id));
    if (!row) throw new ToolError(`${ref.col} : ${def(ref.entity).label} introuvable (${id}).`);
    if (row.deleted_at != null) throw new ToolError(`${ref.col} : ${def(ref.entity).label} ${id} est archivé(e).`);
  }
}

/** Entity-specific consistency rules, on the merged row (current + patch). */
async function checkRules(deps: CrmDeps, entity: EntityKey, merged: Row) {
  if (entity === 'deal' && merged.venue_id == null && merged.contact_id == null) {
    throw new ToolError('Une opportunité doit rester rattachée à une structure (venue_id) ou à un contact (contact_id).');
  }
  if (entity === 'tour_expense' && merged.stop_id != null) {
    const stop = await findRow(deps, 'tour_stop', String(merged.stop_id));
    if (stop && stop.tour_id !== merged.tour_id) throw new ToolError("stop_id : cette étape n'appartient pas à la tournée tour_id.");
  }
  if (entity === 'tour' && merged.start_date && merged.end_date && String(merged.end_date) < String(merged.start_date)) {
    throw new ToolError('end_date doit être postérieure ou égale à start_date.');
  }
}

function conflictError(entity: EntityKey, current: Row, deps: CrmDeps, expected: string) {
  return new ToolError(
    `Conflit de version : ${def(entity).label} ${current.id} a été modifié(e) depuis ta lecture ` +
      `(expected_updated_at = ${expected}, updated_at actuel = ${current.updated_at}). Rien n'a été écrit. ` +
      `Version actuelle : ${JSON.stringify(present(deps, entity, current))}. ` +
      `Vérifie que ta modification est toujours pertinente puis réessaie avec expected_updated_at = "${current.updated_at}".`,
  );
}

function sameInstant(a: unknown, b: unknown) {
  if (a == null || b == null) return a == b;
  if (String(a) === String(b)) return true;
  const ta = Date.parse(String(a));
  return !Number.isNaN(ta) && ta === Date.parse(String(b));
}

/** Compares a stored value with a patch value (dates are compared as instants). */
function sameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  if (typeof a === 'string' && typeof b === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a) && /^\d{4}-\d{2}-\d{2}/.test(b)) {
    return a === b || sameInstant(a, b);
  }
  if (typeof a === 'number' || typeof b === 'number') return a != null && b != null ? Number(a) === Number(b) : a == b;
  return (a ?? null) === (b ?? null);
}

function diff(current: Row, patch: Row) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) if (!sameValue(current[k], v)) changes[k] = { from: current[k] ?? null, to: v };
  return changes;
}

// ---------------------------------------------------------------- cursor

function cursorKey(entity: string, signature: unknown) {
  return createHash('sha256').update(entity + JSON.stringify(signature)).digest('base64url').slice(0, 12);
}
function encodeCursor(offset: number, key: string) {
  return Buffer.from(JSON.stringify({ o: offset, k: key })).toString('base64url');
}
function decodeCursor(cursor: string | undefined, key: string): number {
  if (!cursor) return 0;
  try {
    const { o, k } = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (k === key && Number.isInteger(o) && o >= 0) return o;
  } catch {}
  throw new ToolError('Curseur invalide ou obtenu avec d’autres filtres/tri. Relance la liste sans cursor.');
}

// ---------------------------------------------------------------- list

export interface ListArgs {
  archived?: 'exclude' | 'only' | 'include';
  updated_after?: string;
  updated_before?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  cursor?: string;
  limit?: number;
  [key: string]: unknown;
}

/** Ids of active venues matching type/city filters, for filtering deals by venue category or city. */
async function venueIdsFor(deps: CrmDeps, type: unknown, city: unknown): Promise<string[]> {
  const filters: Filter[] = [ACTIVE];
  if (type) filters.push(Array.isArray(type) ? { col: 'type', op: 'in', value: type } : eq('type', String(type)));
  if (city) filters.push({ col: 'city', op: 'ilike', value: String(city) });
  return (await selectAll(deps.store, 'venues', { filters })).map((v) => String(v.id));
}

const oneOrMany = (col: string, v: unknown): Filter =>
  Array.isArray(v) ? { col, op: 'in', value: v as string[] } : eq(col, v as string);

export async function listEntities(deps: CrmDeps, entity: EntityKey, args: ListArgs) {
  const d = def(entity);
  const filters: Filter[] = [];
  const archived = args.archived ?? 'exclude';
  if (archived === 'exclude') filters.push(ACTIVE);
  if (archived === 'only') filters.push({ col: 'deleted_at', op: 'not_null' });
  const tsCol = entity === 'tour_expense' ? 'created_at' : 'updated_at';
  if (args.updated_after) filters.push({ col: tsCol, op: 'gte', value: args.updated_after });
  if (args.updated_before) filters.push({ col: tsCol, op: 'lte', value: args.updated_before });

  const a = args as Record<string, unknown>;
  const has = (k: string) => a[k] !== undefined && a[k] !== null;
  switch (entity) {
    case 'venue':
      if (has('type')) filters.push(oneOrMany('type', a.type));
      if (has('city')) filters.push({ col: 'city', op: 'ilike', value: String(a.city) });
      if (has('country')) filters.push({ col: 'country', op: 'ilike', value: String(a.country) });
      if (has('min_fit_score')) filters.push({ col: 'fit_score', op: 'gte', value: Number(a.min_fit_score) });
      if (a.has_email === true) filters.push({ col: 'email', op: 'not_null' });
      if (a.has_email === false) filters.push({ col: 'email', op: 'is_null' });
      break;
    case 'contact':
      if (has('venue_id')) filters.push(eq('venue_id', String(a.venue_id)));
      if (a.has_email === true) filters.push({ col: 'email', op: 'not_null' });
      if (a.has_email === false) filters.push({ col: 'email', op: 'is_null' });
      break;
    case 'deal': {
      if (has('stage')) filters.push(oneOrMany('stage', a.stage));
      if (has('priority')) filters.push(oneOrMany('priority', a.priority));
      if (has('venue_id')) filters.push(eq('venue_id', String(a.venue_id)));
      if (has('contact_id')) filters.push(eq('contact_id', String(a.contact_id)));
      if (has('tag')) filters.push({ col: 'tags', op: 'has', value: String(a.tag) });
      if (has('external_source')) filters.push(eq('external_source', String(a.external_source)));
      if (has('external_id')) filters.push(eq('external_id', String(a.external_id)));
      if (has('follow_up_before')) filters.push({ col: 'next_relance_at', op: 'lte', value: String(a.follow_up_before) });
      if (has('follow_up_after')) filters.push({ col: 'next_relance_at', op: 'gte', value: String(a.follow_up_after) });
      if (has('concert_after')) filters.push({ col: 'concert_date', op: 'gte', value: String(a.concert_after) });
      if (has('concert_before')) filters.push({ col: 'concert_date', op: 'lte', value: String(a.concert_before) });
      if (a.show_on_website !== undefined) filters.push(eq('show_on_website', Boolean(a.show_on_website)));
      if (has('venue_type') || has('city')) {
        const ids = await venueIdsFor(deps, a.venue_type, a.city);
        if (!ids.length) return { items: [], next_cursor: null, total_returned: 0 };
        filters.push({ col: 'venue_id', op: 'in', value: ids });
      }
      break;
    }
    case 'task':
      if (has('deal_id')) filters.push(eq('deal_id', String(a.deal_id)));
      if (has('venue_id')) filters.push(eq('venue_id', String(a.venue_id)));
      if (a.status === 'open') filters.push({ col: 'completed_at', op: 'is_null' });
      if (a.status === 'done') filters.push({ col: 'completed_at', op: 'not_null' });
      if (has('due_before')) filters.push({ col: 'due_date', op: 'lte', value: String(a.due_before) });
      if (has('due_after')) filters.push({ col: 'due_date', op: 'gte', value: String(a.due_after) });
      break;
    case 'activity':
      for (const k of ['deal_id', 'venue_id', 'contact_id']) if (has(k)) filters.push(eq(k, String(a[k])));
      if (has('type')) filters.push(oneOrMany('type', a.type));
      if (has('channel')) filters.push(eq('channel', String(a.channel)));
      if (has('after')) filters.push({ col: 'created_at', op: 'gte', value: String(a.after) });
      if (has('before')) filters.push({ col: 'created_at', op: 'lte', value: String(a.before) });
      break;
    case 'tour':
      if (has('status')) filters.push(oneOrMany('status', a.status));
      if (has('start_after')) filters.push({ col: 'start_date', op: 'gte', value: String(a.start_after) });
      if (has('start_before')) filters.push({ col: 'start_date', op: 'lte', value: String(a.start_before) });
      break;
    case 'template':
      if (has('category')) filters.push(oneOrMany('category', a.category));
      break;
    default:
      break;
  }

  const sort = args.sort ?? d.defaultSort;
  if (!d.sortable.includes(sort)) {
    throw new ToolError(`Tri impossible sur "${sort}". Valeurs possibles : ${d.sortable.join(', ')}.`);
  }
  const asc = (args.order ?? (['updated_at', 'created_at'].includes(sort) ? 'desc' : 'asc')) === 'asc';
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const { cursor: _c, limit: _l, ...signature } = args;
  void _c;
  void _l;
  const key = cursorKey(entity, signature);
  const offset = decodeCursor(args.cursor, key);

  const rows = await deps.store.select(d.table, {
    filters,
    order: [
      { col: sort, asc },
      { col: 'id', asc: true },
    ],
    offset,
    limit: limit + 1,
  });
  const page = rows.slice(0, limit);
  let items = page.map((r) => present(deps, entity, r));
  if (entity === 'deal' || entity === 'contact' || entity === 'task') items = await withVenueNames(deps, items);
  return {
    items,
    next_cursor: rows.length > limit ? encodeCursor(offset + limit, key) : null,
    total_returned: items.length,
  };
}

/** Adds venue_name / venue_city to rows having a venue_id (and the deal label for deals). */
async function withVenueNames(deps: CrmDeps, items: Row[]) {
  const ids = [...new Set(items.map((i) => i.venue_id).filter(Boolean))] as string[];
  if (!ids.length) return items;
  const venues = await selectAll(deps.store, 'venues', { filters: [{ col: 'id', op: 'in', value: ids }] });
  const byId = new Map(venues.map((v) => [v.id, v]));
  return items.map((i) => {
    const v = i.venue_id ? byId.get(i.venue_id) : undefined;
    if (!v) return i;
    return { ...i, venue_name: v.name, venue_city: v.city, ...(i.title ? {} : { display_name: v.name }) };
  });
}

// ---------------------------------------------------------------- get

function stageHistory(activities: Row[]) {
  return activities
    .filter((a) => a.type === 'status_change')
    .map((a) => {
      const m = /from (\S+) to (\S+)/.exec(String(a.content));
      return { at: a.created_at, from: m?.[1] ?? null, to: m?.[2] ?? null };
    })
    .sort((x, y) => String(x.at).localeCompare(String(y.at)));
}

async function related(deps: CrmDeps, entity: EntityKey, filters: Filter[], order?: string, desc = false, limit = 200) {
  const rows = await deps.store.select(def(entity).table, {
    filters: [...filters, ACTIVE],
    order: order ? [{ col: order, asc: !desc }] : undefined,
    limit,
  });
  return rows.map((r) => present(deps, entity, r));
}

export async function getEntity(deps: CrmDeps, entity: EntityKey, id: string) {
  const row = await mustGet(deps, entity, id, { allowArchived: true });
  const base = present(deps, entity, row);
  switch (entity) {
    case 'venue':
      return {
        ...base,
        contacts: await related(deps, 'contact', [eq('venue_id', id)], 'name'),
        deals: await related(deps, 'deal', [eq('venue_id', id)], 'updated_at', true),
        tasks: await related(deps, 'task', [eq('venue_id', id)], 'due_date'),
        activities: await related(deps, 'activity', [eq('venue_id', id)], 'created_at', true, 100),
      };
    case 'contact':
      return {
        ...base,
        venue: row.venue_id ? present(deps, 'venue', (await findRow(deps, 'venue', String(row.venue_id)))!) : null,
        deals: await related(deps, 'deal', [eq('contact_id', id)], 'updated_at', true),
        activities: await related(deps, 'activity', [eq('contact_id', id)], 'created_at', true, 100),
      };
    case 'deal': {
      const activities = await related(deps, 'activity', [eq('deal_id', id)], 'created_at', true, 200);
      const venue = row.venue_id ? await findRow(deps, 'venue', String(row.venue_id)) : null;
      const contact = row.contact_id ? await findRow(deps, 'contact', String(row.contact_id)) : null;
      return {
        ...base,
        display_name: String(row.title ?? '').trim() || venue?.name || contact?.name || base.display_name,
        venue: venue ? present(deps, 'venue', venue) : null,
        contact: contact ? present(deps, 'contact', contact) : null,
        other_contacts: row.venue_id ? (await related(deps, 'contact', [eq('venue_id', String(row.venue_id))], 'name')).filter((c) => c.id !== row.contact_id) : [],
        stage_history: stageHistory(activities),
        notes_and_activities: activities.filter((a) => a.type !== 'status_change'),
        tasks: await related(deps, 'task', [eq('deal_id', id)], 'due_date'),
        tour_stops: await related(deps, 'tour_stop', [eq('deal_id', id)], 'stop_date'),
      };
    }
    case 'task':
      return {
        ...base,
        deal: row.deal_id ? present(deps, 'deal', (await findRow(deps, 'deal', String(row.deal_id)))!) : null,
        venue: row.venue_id ? present(deps, 'venue', (await findRow(deps, 'venue', String(row.venue_id)))!) : null,
      };
    case 'tour': {
      const stops = await related(deps, 'tour_stop', [eq('tour_id', id)], 'stop_date');
      const expenses = await related(deps, 'tour_expense', [eq('tour_id', id)], 'expense_date');
      const sum = (xs: Row[], k: string) => Math.round(xs.reduce((s, x) => s + (Number(x[k]) || 0), 0) * 100) / 100;
      return {
        ...base,
        stops,
        expenses,
        totals: {
          fees: sum(stops, 'fee'),
          hotels: sum(stops, 'hotel_cost'),
          expenses: sum(expenses, 'amount'),
          shows: stops.filter((s) => s.type === 'show').length,
        },
      };
    }
    default:
      return base;
  }
}

// ---------------------------------------------------------------- create / update

export async function createEntity(deps: CrmDeps, entity: EntityKey, data: Row) {
  const d = def(entity);
  await checkRefs(deps, entity, data);
  await checkRules(deps, entity, data);
  try {
    const row = await deps.store.insert(d.table, data);
    return present(deps, entity, row);
  } catch (err) {
    if (err instanceof UniqueViolationError) {
      throw new ToolError(
        `Doublon : une opportunité porte déjà external_source "${data.external_source}" + external_id "${data.external_id}". Cherche-la avec list_deals (filtre external_id).`,
      );
    }
    throw err;
  }
}

export async function updateEntity(
  deps: CrmDeps,
  entity: EntityKey,
  id: string,
  patch: Row,
  expectedUpdatedAt?: string,
) {
  if (!Object.keys(patch).length) throw new ToolError('patch est vide : indique au moins un champ à modifier.');
  const d = def(entity);
  const current = await mustGet(deps, entity, id);
  if (expectedUpdatedAt && !sameInstant(current.updated_at, expectedUpdatedAt)) {
    throw conflictError(entity, current, deps, expectedUpdatedAt);
  }
  await checkRefs(deps, entity, patch);
  await checkRules(deps, entity, { ...current, ...patch });

  const filters: Filter[] = [eq('id', id), ACTIVE];
  // Atomic check: the row must still carry the updated_at we compared against.
  if (expectedUpdatedAt) filters.push(eq('updated_at', String(current.updated_at)));
  let updated: Row[];
  try {
    updated = await deps.store.update(d.table, filters, patch);
  } catch (err) {
    if (err instanceof UniqueViolationError) throw new ToolError('Doublon : external_source + external_id déjà utilisés par une autre opportunité.');
    throw err;
  }
  if (!updated.length) {
    const now = await mustGet(deps, entity, id, { allowArchived: true });
    throw conflictError(entity, now, deps, expectedUpdatedAt ?? String(current.updated_at));
  }
  return present(deps, entity, updated[0]);
}

// ---------------------------------------------------------------- archive / restore

async function collectCascade(deps: CrmDeps, entity: EntityKey, root: Row) {
  const out: { entity: EntityKey; row: Row }[] = [{ entity, row: root }];
  const seen = new Set([`${entity}:${root.id}`]);
  for (let i = 0; i < out.length; i++) {
    const { entity: e, row } = out[i];
    for (const c of CASCADES[e]) {
      const children = await selectAll(deps.store, def(c.entity).table, { filters: [eq(c.col, String(row.id)), ACTIVE] });
      for (const child of children) {
        const k = `${c.entity}:${child.id}`;
        if (seen.has(k) || (c.extra && !c.extra(child))) continue;
        seen.add(k);
        out.push({ entity: c.entity, row: child });
      }
    }
  }
  return out;
}

export async function archiveEntity(deps: CrmDeps, entity: EntityKey, id: string, expectedUpdatedAt?: string) {
  const root = await mustGet(deps, entity, id, { allowArchived: true });
  if (root.deleted_at != null) throw new ToolError(`${capitalize(def(entity).label)} ${id} est déjà archivé(e).`);
  if (expectedUpdatedAt && !sameInstant(root.updated_at, expectedUpdatedAt)) throw conflictError(entity, root, deps, expectedUpdatedAt);

  const items = await collectCascade(deps, entity, root);
  const batch = randomUUID();
  const deletedAt = new Date().toISOString();
  const byEntity = new Map<EntityKey, Row[]>();
  for (const it of items) byEntity.set(it.entity, [...(byEntity.get(it.entity) ?? []), it.row]);

  for (const [e, rows] of byEntity) {
    const groups: [Row[], Row][] =
      e === 'deal'
        ? [
            // Archived deals disappear from kruzberg.com; the flag is kept for restore.
            [rows.filter((r) => r.show_on_website), { show_on_website: false, deleted_show_on_website: true }],
            [rows.filter((r) => !r.show_on_website), { deleted_show_on_website: false }],
          ]
        : [[rows, {}]];
    for (const [group, extra] of groups) {
      if (!group.length) continue;
      await deps.store.update(
        def(e).table,
        [{ col: 'id', op: 'in', value: group.map((r) => String(r.id)) }, ACTIVE],
        { ...extra, deleted_at: deletedAt, deleted_batch: batch },
      );
    }
  }
  const archived = await mustGet(deps, entity, id, { allowArchived: true });
  return {
    archived: present(deps, entity, archived),
    also_archived: items.slice(1).map((it) => ({ entity: it.entity, id: it.row.id, name: def(it.entity).name(it.row) })),
    how_to_undo: `restore avec entity "${entity}" et id "${id}" (restaure aussi les éléments archivés en même temps).`,
  };
}

export async function restoreEntity(deps: CrmDeps, entity: EntityKey, id: string) {
  const root = await mustGet(deps, entity, id, { allowArchived: true });
  if (root.deleted_at == null) throw new ToolError(`${capitalize(def(entity).label)} ${id} n'est pas archivé(e).`);
  const batch = root.deleted_batch ? String(root.deleted_batch) : null;

  const items: { entity: EntityKey; row: Row }[] = [];
  for (const e of ENTITY_KEYS) {
    const rows = batch
      ? await selectAll(deps.store, def(e).table, { filters: [eq('deleted_batch', batch)] })
      : e === entity
        ? [root]
        : [];
    for (const row of rows) items.push({ entity: e, row });
  }
  const inBatch = new Set(items.map((it) => `${it.entity}:${it.row.id}`));

  // A row cannot come back while its parent stays archived (archived separately).
  for (const it of items) {
    for (const ref of def(it.entity).refs) {
      const pid = it.row[ref.col];
      if (pid == null || inBatch.has(`${ref.entity}:${pid}`)) continue;
      const parent = await findRow(deps, ref.entity, String(pid));
      if (parent && parent.deleted_at != null) {
        throw new ToolError(
          `Impossible de restaurer : ${def(ref.entity).label} « ${def(ref.entity).name(parent)} » (${pid}) est archivé(e) séparément. ` +
            `Restaure-la d'abord (restore, entity "${ref.entity}").`,
        );
      }
    }
  }

  for (const e of ENTITY_KEYS) {
    const rows = items.filter((it) => it.entity === e).map((it) => it.row);
    if (!rows.length) continue;
    const groups: [Row[], Row][] =
      e === 'deal'
        ? [
            [rows.filter((r) => r.deleted_show_on_website === true), { show_on_website: true, deleted_show_on_website: null }],
            [rows.filter((r) => r.deleted_show_on_website !== true), { deleted_show_on_website: null }],
          ]
        : [[rows, {}]];
    for (const [group, extra] of groups) {
      if (!group.length) continue;
      await deps.store.update(def(e).table, [{ col: 'id', op: 'in', value: group.map((r) => String(r.id)) }], {
        ...extra,
        deleted_at: null,
        deleted_batch: null,
      });
    }
  }
  const restored = await mustGet(deps, entity, id);
  return {
    restored: present(deps, entity, restored),
    also_restored: items
      .filter((it) => !(it.entity === entity && it.row.id === id))
      .map((it) => ({ entity: it.entity, id: it.row.id, name: def(it.entity).name(it.row) })),
  };
}

// ---------------------------------------------------------------- search

export async function search(deps: CrmDeps, query: string, entities: EntityKey[] | undefined, limit: number) {
  const q = normalizeName(query);
  if (q.length < 2) throw new ToolError('query doit contenir au moins 2 caractères significatifs.');
  const terms = q.split(' ');
  const targets = entities?.length ? entities : (['venue', 'contact', 'deal', 'task', 'activity', 'tour', 'template'] as EntityKey[]);
  const venues = await selectAll(deps.store, 'venues', { filters: [ACTIVE] });
  const venueById = new Map(venues.map((v) => [v.id, v]));

  const hits: { score: number; item: Row }[] = [];
  for (const e of targets) {
    const d = def(e);
    const rows = e === 'venue' ? venues : await selectAll(deps.store, d.table, { filters: [ACTIVE] });
    for (const row of rows) {
      const venue = row.venue_id ? venueById.get(row.venue_id) : undefined;
      const fields: [string, unknown][] = d.searchCols.map((c) => [c, row[c]]);
      if (e === 'deal') fields.push(['tags', (row.tags as string[] | null)?.join(' ')]);
      if (venue && e !== 'venue') fields.push(['venue.name', venue.name], ['venue.city', venue.city]);
      const matched: string[] = [];
      let score = 0;
      for (const [col, value] of fields) {
        const text = normalizeName(value as string);
        if (!text || !terms.every((t) => text.includes(t))) continue;
        matched.push(col);
        // Own name first, then other own fields; a match on the related venue ranks last.
        if (col === 'venue.name' || col === 'venue.city') {
          score = Math.max(score, 10);
          continue;
        }
        const bare = text.replace(/^(le|la|les|l) /, '');
        const base = text === q || bare === q ? 100 : text.startsWith(q) || bare.startsWith(q) ? 60 : 30;
        score = Math.max(score, base + (col === d.searchCols[0] ? 20 : 0));
      }
      // All terms may be spread over several fields (e.g. name + city).
      if (!matched.length) {
        const all = normalizeName(fields.map(([, v]) => (v == null ? '' : String(v))).join(' '));
        if (terms.every((t) => all.includes(t))) {
          matched.push('plusieurs champs');
          score = 5;
        }
      }
      if (!matched.length) continue;
      const content = matched.find((m) => !['name', 'title', 'venue.name'].includes(m));
      const snippetSource = content && content !== 'plusieurs champs' ? String(row[content] ?? '') : '';
      hits.push({
        score,
        item: {
          entity: e,
          id: row.id,
          name: e === 'deal' ? String(row.title ?? '').trim() || venue?.name || d.name(row) : d.name(row),
          city: e === 'venue' ? row.city : (venue?.city ?? null),
          ...(e === 'deal' ? { stage: row.stage } : {}),
          matched_fields: matched,
          snippet: snippetSource ? snippetSource.slice(0, 200) : undefined,
          updated_at: row.updated_at ?? row.created_at,
          url: entityUrl(deps.baseUrl, e, row),
        },
      });
    }
  }
  hits.sort((a, b) => b.score - a.score || String(b.item.updated_at).localeCompare(String(a.item.updated_at)));
  return { query, results: hits.slice(0, limit).map((h) => h.item), total_matches: hits.length };
}

// ---------------------------------------------------------------- duplicates

const GENERIC_DOMAINS = new Set([
  'gmail.com', 'hotmail.com', 'hotmail.fr', 'yahoo.com', 'yahoo.fr', 'outlook.com', 'outlook.fr', 'live.fr', 'live.com',
  'orange.fr', 'free.fr', 'sfr.fr', 'laposte.net', 'wanadoo.fr', 'icloud.com', 'me.com', 'gmx.fr', 'gmx.com', 'protonmail.com', 'proton.me',
]);

function domainOf(value: unknown): string | null {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  const host = s.includes('@') ? s.split('@')[1] : s.replace(/^https?:\/\//, '').split(/[/?#]/)[0];
  const d = host?.replace(/^www\./, '');
  return d && d.includes('.') && !GENERIC_DOMAINS.has(d) && !/instagram\.com|facebook\.com/.test(d) ? d : null;
}

export type DuplicateCriterion = 'name' | 'name_city' | 'email' | 'domain';

export async function findDuplicates(deps: CrmDeps, entity: 'venue' | 'contact' | 'deal', by: DuplicateCriterion[]) {
  const rows = await selectAll(deps.store, def(entity).table, { filters: [ACTIVE] });
  const venues = entity === 'venue' ? rows : await selectAll(deps.store, 'venues', { filters: [ACTIVE] });
  const venueById = new Map(venues.map((v) => [v.id, v]));
  const groups: { criterion: DuplicateCriterion; key: string; items: Row[] }[] = [];

  const label = (r: Row) => {
    const v = r.venue_id ? venueById.get(r.venue_id) : undefined;
    return {
      id: r.id,
      name: entity === 'deal' ? String(r.title ?? '').trim() || v?.name || '(sans nom)' : def(entity).name(r),
      city: entity === 'venue' ? r.city : (v?.city ?? null),
      email: r.email ?? null,
      ...(entity === 'deal' ? { stage: r.stage, external_id: r.external_id } : {}),
      updated_at: r.updated_at,
      url: entityUrl(deps.baseUrl, entity, r),
    };
  };
  const city = (r: Row) => normalizeName(String((entity === 'venue' ? r.city : venueById.get(r.venue_id)?.city) ?? ''));
  const name = (r: Row) =>
    normalizeName(entity === 'deal' ? String(r.title ?? '').trim() || String(venueById.get(r.venue_id)?.name ?? '') : String(r.name ?? ''))
      .replace(/^(le|la|les|l) /, '');

  for (const criterion of by) {
    const buckets = new Map<string, Row[]>();
    for (const r of rows) {
      let k: string | null = null;
      if (criterion === 'name') k = name(r) || null;
      if (criterion === 'name_city') k = name(r) ? `${name(r)} | ${city(r)}` : null;
      if (criterion === 'email') k = normalizeEmail(r.email as string) || null;
      if (criterion === 'domain') k = domainOf(r.email) ?? domainOf(r.website);
      if (entity === 'deal' && criterion === 'email') {
        // Deals have no email: group open deals on the same venue+contact instead.
        k = CLOSED_STAGES.includes(r.stage as DealStage) ? null : `${r.venue_id ?? '-'} | ${r.contact_id ?? '-'}`;
      }
      if (!k) continue;
      buckets.set(k, [...(buckets.get(k) ?? []), r]);
    }
    for (const [key, items] of buckets) if (items.length > 1) groups.push({ criterion, key, items: items.map(label) });
  }
  return {
    entity,
    criteria: by,
    groups_found: groups.length,
    groups: groups.slice(0, 100),
    hint: 'Pour fusionner : garde la fiche la plus complète, rattache les contacts/opportunités (update_*), puis archive les doublons.',
  };
}

// ---------------------------------------------------------------- notes & activities

interface Target {
  deal_id?: string | null;
  venue_id?: string | null;
  contact_id?: string | null;
}

async function resolveTarget(deps: CrmDeps, t: Target) {
  if (!t.deal_id && !t.venue_id && !t.contact_id) throw new ToolError('Indique deal_id, venue_id ou contact_id.');
  let venueId = t.venue_id ?? null;
  let contactId = t.contact_id ?? null;
  let deal: Row | null = null;
  if (t.deal_id) {
    deal = await mustGet(deps, 'deal', t.deal_id);
    venueId ??= (deal.venue_id as string) ?? null;
    contactId ??= (deal.contact_id as string) ?? null;
  }
  if (venueId) await mustGet(deps, 'venue', venueId);
  if (contactId) {
    const c = await mustGet(deps, 'contact', contactId);
    venueId ??= (c.venue_id as string) ?? null;
  }
  return { deal, venueId, contactId };
}

export async function addNote(deps: CrmDeps, args: Target & { content: string; date?: string }) {
  const { deal, venueId, contactId } = await resolveTarget(deps, args);
  const row = await deps.store.insert('activities', {
    deal_id: deal?.id ?? null,
    venue_id: venueId,
    contact_id: contactId,
    type: 'note',
    content: args.content,
    ...(args.date ? { created_at: args.date } : {}),
  });
  return present(deps, 'activity', row);
}

const KIND_LABELS: Record<string, string> = {
  email_sent: 'Mail envoyé',
  relance: 'Relance',
  call: 'Appel',
  message: 'Message privé (DM)',
  reply_received: 'Réponse reçue',
  note: 'Note',
  concert_played: 'Concert joué',
};
const OUTBOUND = ['email_sent', 'relance', 'call', 'message'];

export async function logActivity(
  deps: CrmDeps,
  args: Target & {
    kind: (typeof LOGGABLE_ACTIVITY_TYPES)[number];
    channel?: string;
    date?: string;
    content?: string;
    update_deal?: boolean;
    stage?: DealStage;
  },
) {
  const { deal, venueId, contactId } = await resolveTarget(deps, args);
  const date = args.date ?? new Date().toISOString();
  const channelLabel = RELANCE_METHODS.find((m) => m.key === args.channel)?.label;
  const content = args.content?.trim() || `${KIND_LABELS[args.kind]}${channelLabel ? ` (${channelLabel})` : ''}`;
  const activity = await deps.store.insert('activities', {
    deal_id: deal?.id ?? null,
    venue_id: venueId,
    contact_id: contactId,
    type: args.kind,
    channel: args.channel ?? null,
    content,
    created_at: date,
  });

  let updatedDeal: Row | null = null;
  if (deal && args.update_deal !== false) {
    const patch: Row = {};
    if (OUTBOUND.includes(args.kind)) {
      if (!deal.last_message_at || Date.parse(date) > Date.parse(String(deal.last_message_at))) patch.last_message_at = date;
      if (!deal.first_contact_at) patch.first_contact_at = date;
      if (args.channel) patch.last_relance_method = args.channel;
    }
    if (args.stage && args.stage !== deal.stage) patch.stage = args.stage;
    if (Object.keys(patch).length) {
      const [row] = await deps.store.update('deals', [eq('id', String(deal.id))], patch);
      updatedDeal = row;
    } else {
      updatedDeal = deal;
    }
  } else if (deal) {
    updatedDeal = deal;
  }
  return {
    activity: present(deps, 'activity', activity),
    deal: updatedDeal ? present(deps, 'deal', updatedDeal) : null,
  };
}

export async function moveStage(deps: CrmDeps, args: { id: string; stage: DealStage; note?: string; expected_updated_at?: string }) {
  const current = await mustGet(deps, 'deal', args.id);
  const deal =
    current.stage === args.stage && !args.expected_updated_at
      ? present(deps, 'deal', current)
      : current.stage === args.stage
        ? (() => {
            if (!sameInstant(current.updated_at, args.expected_updated_at)) throw conflictError('deal', current, deps, args.expected_updated_at!);
            return present(deps, 'deal', current);
          })()
        : await updateEntity(deps, 'deal', args.id, { stage: args.stage }, args.expected_updated_at);
  const note = args.note ? await addNote(deps, { deal_id: args.id, content: args.note }) : null;
  return { previous_stage: current.stage, deal, note };
}

export async function setFollowUp(deps: CrmDeps, args: { deal_id: string; date: string | null; expected_updated_at?: string }) {
  const current = await mustGet(deps, 'deal', args.deal_id);
  if (args.date && CLOSED_STAGES.includes(current.stage as DealStage)) {
    throw new ToolError(
      `Impossible de programmer une relance : l'opportunité est à l'étape « ${current.stage} » (étapes sans relance : ${CLOSED_STAGES.join(', ')}). Change d'abord l'étape avec move_stage.`,
    );
  }
  return updateEntity(deps, 'deal', args.deal_id, { next_relance_at: args.date }, args.expected_updated_at);
}

// ---------------------------------------------------------------- bulk

export async function bulkUpdate(
  deps: CrmDeps,
  args: { entity: EntityKey; items: { id: string; patch: Row; expected_updated_at?: string }[]; dry_run?: boolean },
) {
  const dryRun = args.dry_run !== false;
  const d = def(args.entity);
  if (args.items.length > MAX_BULK) throw new ToolError(`${MAX_BULK} éléments maximum par appel (reçu : ${args.items.length}).`);
  const ids = args.items.map((i) => i.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new ToolError(`L'id ${dup} apparaît plusieurs fois dans items.`);

  const preview: (Row & { id: string; status: 'error' | 'will_change' | 'unchanged'; error?: string })[] = [];
  for (const item of args.items) {
    const parsed = d.patch.safeParse(item.patch);
    if (!parsed.success) {
      preview.push({ id: item.id, status: 'error', error: formatZodError(parsed.error) });
      continue;
    }
    const patch = parsed.data as Row;
    const current = await findRow(deps, args.entity, item.id);
    if (!current) {
      preview.push({ id: item.id, status: 'error', error: `${capitalize(d.label)} introuvable.` });
      continue;
    }
    const base = { id: item.id, name: d.name(current) };
    if (current.deleted_at != null) {
      preview.push({ ...base, status: 'error', error: 'Archivé(e) : restaure-le/la avant de le/la modifier.' });
      continue;
    }
    if (item.expected_updated_at && !sameInstant(current.updated_at, item.expected_updated_at)) {
      preview.push({ ...base, status: 'error', error: `Conflit de version (updated_at actuel : ${current.updated_at}).` });
      continue;
    }
    if (!Object.keys(patch).length) {
      preview.push({ ...base, status: 'error', error: 'patch vide.' });
      continue;
    }
    try {
      await checkRefs(deps, args.entity, patch);
      await checkRules(deps, args.entity, { ...current, ...patch });
    } catch (err) {
      preview.push({ ...base, status: 'error', error: (err as Error).message });
      continue;
    }
    const changes = diff(current, patch);
    preview.push({ ...base, status: Object.keys(changes).length ? 'will_change' : 'unchanged', changes, patch, current_updated_at: current.updated_at });
  }

  const errors = preview.filter((p) => p.status === 'error');
  const summary = {
    total: preview.length,
    will_change: preview.filter((p) => p.status === 'will_change').length,
    unchanged: preview.filter((p) => p.status === 'unchanged').length,
    errors: errors.length,
  };
  const strip = (p: (typeof preview)[number]) => {
    const { patch: _p, current_updated_at: _c, ...rest } = p as Row;
    void _p;
    void _c;
    return rest;
  };
  if (dryRun) {
    return {
      dry_run: true,
      entity: args.entity,
      summary,
      items: preview.map(strip),
      next_step: errors.length
        ? 'Corrige les erreurs : rien ne sera appliqué tant qu’un élément est en erreur.'
        : 'Aperçu seulement, rien n’a été modifié. Pour appliquer, rappelle bulk_update avec les mêmes items et dry_run=false.',
    };
  }
  if (errors.length) {
    throw new ToolError(
      `Rien n'a été appliqué : ${errors.length} élément(s) en erreur. ` + errors.map((e) => `${e.id} : ${e.error}`).join(' ; '),
    );
  }
  const results = [];
  for (const p of preview as (Row & { status: string })[]) {
    if (p.status !== 'will_change') continue;
    try {
      // Re-checked atomically against the version seen in the preview.
      results.push(await updateEntity(deps, args.entity, String(p.id), p.patch as Row, String(p.current_updated_at)));
    } catch (err) {
      results.push({ id: p.id, error: (err as Error).message });
    }
  }
  return { dry_run: false, entity: args.entity, summary: { ...summary, applied: results.filter((r) => !('error' in r)).length }, items: results };
}

export function formatZodError(error: z.ZodError) {
  return error.issues.map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`).join(' ; ');
}

// ---------------------------------------------------------------- audit log

export async function getAuditLog(
  deps: CrmDeps,
  args: { entity?: EntityKey; entity_id?: string; tool?: string; since?: string; until?: string; cursor?: string; limit?: number },
) {
  const filters: Filter[] = [];
  if (args.entity) filters.push(eq('entity', args.entity));
  if (args.entity_id) filters.push(eq('entity_id', args.entity_id));
  if (args.tool) filters.push(eq('tool', args.tool));
  if (args.since) filters.push({ col: 'created_at', op: 'gte', value: args.since });
  if (args.until) filters.push({ col: 'created_at', op: 'lte', value: args.until });
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const { cursor: _c, limit: _l, ...signature } = args;
  void _c;
  void _l;
  const key = cursorKey('audit', signature);
  const offset = decodeCursor(args.cursor, key);
  const rows = await deps.store.select('mcp_audit_log', {
    filters,
    order: [
      { col: 'created_at', asc: false },
      { col: 'id', asc: true },
    ],
    offset,
    limit: limit + 1,
  });
  return {
    items: rows.slice(0, limit).map(({ user_id: _u, ...r }) => (void _u, r)),
    next_cursor: rows.length > limit ? encodeCursor(offset + limit, key) : null,
  };
}

// ---------------------------------------------------------------- schema

const opts = (list: { key: string; label: string }[]) => list.map((x) => ({ id: x.key, label: x.label }));

export function getSchema() {
  return {
    conventions: {
      ids: 'Tous les id sont des UUID. crmId côté Booking Radar = id de l’opportunité (deal).',
      dates: 'Dates : YYYY-MM-DD ; dates-heures : ISO 8601 (ex. 2026-10-04T14:00:00Z).',
      versioning:
        'update_* exige expected_updated_at = la valeur updated_at lue juste avant (get_* ou list_*). Si quelqu’un a modifié l’objet entre-temps, l’écriture est refusée (conflit de version) et la version actuelle est renvoyée.',
      archive:
        'Rien n’est jamais supprimé définitivement. archive_* masque l’objet du CRM (et ses dépendants) ; restore le fait revenir. Les list_* excluent les archives sauf archived="include"/"only".',
      pagination: `list_* renvoient au plus ${MAX_LIMIT} éléments (défaut ${DEFAULT_LIMIT}) et next_cursor ; repasse cursor avec les mêmes filtres pour la page suivante.`,
      radar:
        'Le Booking Radar écrit via add_to_pipeline (external_source="radar", external_id = id de la piste). Dédoublonnage dans les deux sens via external_id.',
    },
    pipeline: {
      entry_stage: 'a_contacter',
      stages: opts(STAGES),
      stages_without_follow_up: CLOSED_STAGES,
      follow_up:
        'next_relance_at est calculée automatiquement (dernier message + 7 jours) quand une opportunité passe à contacte/relance ; set_follow_up la fixe à la main.',
    },
    enums: {
      venue_types: opts(VENUE_TYPES),
      priorities: opts(PRIORITIES),
      channels: opts(RELANCE_METHODS),
      activity_types: [...LOGGABLE_ACTIVITY_TYPES, 'status_change'].map((id) => ({ id, label: KIND_LABELS[id] ?? 'Changement d’étape (automatique)' })),
      contact_pref_methods: CONTACT_METHOD_IDS,
      contact_tones: TONE_IDS,
      tour_statuses: opts(TOUR_STATUSES),
      tour_stop_types: opts(STOP_TYPES),
      expense_categories: opts(EXPENSE_CATEGORIES),
      template_categories: opts(TEMPLATE_CATEGORIES),
    },
    entities: ENTITY_KEYS.map((k) => {
      const d = def(k);
      return {
        entity: k,
        label: d.label,
        description: d.description,
        tools: k === 'activity' ? ['list_activities', 'add_note', 'log_activity', 'update_activity', 'archive_activity'] : undefined,
        references: d.refs,
        sortable: d.sortable,
        writable_fields: z.toJSONSchema(d.patch, { unrepresentable: 'any' }),
        archived_with_it: CASCADES[k].map((c) => c.entity),
      };
    }),
  };
}
