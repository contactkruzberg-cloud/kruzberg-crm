import { randomUUID } from 'node:crypto';
import { createStoreRepo } from '../repo';
import { DbError, UniqueViolationError, type Filter, type Row, type Store, type Table } from '../store';

// In-memory Store for tests. Mirrors what Postgres does for us: column defaults,
// updated_at triggers, the stage-change log, the follow-up date trigger, the
// unique (external_source, external_id) index and the venue-or-contact check.

export const OWNER = '11111111-1111-4111-8111-111111111111';

const DEFAULTS: Record<Table, Row> = {
  venues: { type: 'bar', city: '', country: 'France', fit_score: 3, address: null, postal_code: null, capacity: null, email: null, phone: null, instagram: null, website: null, notes: null, latitude: null, longitude: null, cover_image_url: null },
  contacts: { venue_id: null, role: null, email: null, phone: null, pref_method: 'email', tone: 'vous', notes: null },
  deals: { title: null, venue_id: null, contact_id: null, stage: 'a_contacter', priority: 'medium', first_contact_at: null, last_message_at: null, last_relance_method: null, next_relance_at: null, response: null, concert_date: null, fee: null, show_on_website: false, notes: null, tags: [], external_source: null, external_id: null, deleted_show_on_website: null },
  tasks: { deal_id: null, venue_id: null, description: null, due_date: null, completed_at: null },
  activities: { deal_id: null, venue_id: null, contact_id: null, content: '', channel: null },
  tours: { status: 'brouillon', start_date: null, end_date: null, members_count: 4, vehicle_label: null, vehicle_daily_cost: 0, fuel_consumption: 8, fuel_price: 1.8, per_diem: 0, road_factor: 1.3, color: null, notes: null },
  tour_stops: { deal_id: null, venue_id: null, type: 'show', order_index: 0, fee: null, city: null, latitude: null, longitude: null, arrival_time: null, load_in_time: null, soundcheck_time: null, doors_time: null, set_time: null, hotel_name: null, hotel_address: null, hotel_cost: null, hotel_rooms: null, hotel_booked: false, on_site_contact: null, on_site_phone: null, notes: null },
  tour_expenses: { stop_id: null, category: 'misc', label: '', expense_date: null },
  templates: { category: 'first_contact', subject: '', body: '' },
  bands: { city: null, genre: null, contact_name: null, email: null, phone: null, instagram: null, website: null, exchange_status: 'none', notes: null },
  deal_bands: { role: 'co_bill' },
  briefings: { title: '', content: '' },
  radar_docs: { data: {}, version: 1 },
  radar_sync: { base: {}, artifact_version: null, crm_version: null, pending: null },
  mcp_audit_log: {},
};

function matches(row: Row, f: Filter): boolean {
  const v = row[f.col];
  switch (f.op) {
    case 'eq':
      return v != null && String(v) === String(f.value);
    case 'neq':
      return v == null || String(v) !== String(f.value);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (v == null) return false;
      const c = typeof v === 'number' ? v - Number(f.value) : String(v).localeCompare(String(f.value));
      return f.op === 'gt' ? c > 0 : f.op === 'gte' ? c >= 0 : f.op === 'lt' ? c < 0 : c <= 0;
    }
    case 'in':
      return v != null && f.value.map(String).includes(String(v));
    case 'is_null':
      return v == null;
    case 'not_null':
      return v != null;
    case 'ilike':
      return v != null && String(v).toLowerCase().includes(f.value.toLowerCase());
    case 'has':
      return Array.isArray(v) && v.includes(f.value);
    case 'null_or_lte':
      return v == null || String(v).localeCompare(f.value) <= 0;
  }
}

export function createMemoryStore() {
  let clock = 0;
  const tick = () => new Date(Date.UTC(2026, 0, 1) + ++clock * 1000).toISOString();
  const db = Object.fromEntries(Object.keys(DEFAULTS).map((t) => [t, [] as Row[]])) as Record<Table, Row[]>;
  /** Simulates a write by someone else (e.g. the app) between a read and an update. */
  let failNextWrite: Error | null = null;

  function checkDeal(row: Row, selfId?: unknown) {
    if (row.venue_id == null && row.contact_id == null) throw new DbError('violates check constraint "deals_venue_or_contact_check"', '23514');
    if (row.external_id != null && db.deals.some((d) => d.id !== selfId && d.external_source === row.external_source && d.external_id === row.external_id)) {
      throw new UniqueViolationError();
    }
  }

  function nextRelance(row: Row, old: Row | null, patch: Row) {
    if (['confirme', 'termine', 'refuse'].includes(String(row.stage))) row.next_relance_at = null;
    else if (old && 'next_relance_at' in patch && patch.next_relance_at !== old.next_relance_at) return;
    else if (
      ['contacte', 'relance'].includes(String(row.stage)) &&
      row.last_message_at &&
      (!old || row.stage !== old.stage || row.last_message_at !== old.last_message_at)
    ) {
      row.next_relance_at = new Date(Date.parse(String(row.last_message_at)) + 7 * 86400_000).toISOString();
    }
  }

  const store: Store = {
    async select(table, query = {}) {
      let rows = db[table].filter((r) => r.user_id === OWNER && (query.filters ?? []).every((f) => matches(r, f)));
      for (const o of [...(query.order ?? [])].reverse()) {
        rows = [...rows].sort((a, b) => {
          const x = a[o.col];
          const y = b[o.col];
          if (x == null && y == null) return 0;
          if (x == null) return 1;
          if (y == null) return -1;
          const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
          return o.asc ? c : -c;
        });
      }
      const offset = query.offset ?? 0;
      rows = rows.slice(offset, query.limit != null ? offset + query.limit : undefined);
      return rows.map((r) => structuredClone(r));
    },

    async insert(table, input) {
      if (failNextWrite) {
        const e = failNextWrite;
        failNextWrite = null;
        throw e;
      }
      const now = tick();
      const row: Row = {
        id: randomUUID(),
        ...DEFAULTS[table],
        ...(table === 'mcp_audit_log' ? {} : table === 'deal_bands' ? { deleted_at: null } : table === 'briefings' || table === 'radar_docs' ? { updated_at: now } : table === 'radar_sync' ? {} : { deleted_at: null, deleted_batch: null, updated_at: now }),
        created_at: now,
        ...structuredClone(input),
        user_id: OWNER,
      };
      if (table === 'deals') {
        checkDeal(row);
        nextRelance(row, null, input);
      }
      const uniqueBy: Partial<Record<Table, string[]>> = { deal_bands: ['deal_id', 'band_id'], briefings: ['week_start'], radar_docs: ['collection', 'id'], radar_sync: ['collection', 'id'] };
      const cols = uniqueBy[table];
      if (cols && db[table].some((r) => cols.every((c) => r[c] === row[c]))) throw new UniqueViolationError();
      db[table].push(row);
      return structuredClone(row);
    },

    async insertMany(table, rows) {
      for (const r of rows) await store.insert(table, r);
    },

    async update(table, filters, patch) {
      const rows = db[table].filter((r) => r.user_id === OWNER && filters.every((f) => matches(r, f)));
      const out: Row[] = [];
      for (const row of rows) {
        const old = { ...row };
        const next = { ...row, ...structuredClone(patch) };
        if (table === 'deals') {
          checkDeal(next, row.id);
          nextRelance(next, old, patch);
        }
        if ('updated_at' in row) next.updated_at = tick();
        if (table === 'radar_docs') next.version = Number(row.version) + 1; // radar_docs_bump trigger
        Object.assign(row, next);
        if (table === 'deals' && old.stage !== row.stage) {
          // Mirrors the deal_stage_change_log trigger.
          await store.insert('activities', {
            deal_id: row.id,
            venue_id: row.venue_id,
            contact_id: row.contact_id,
            type: 'status_change',
            content: `Stage changed from ${old.stage} to ${row.stage}`,
          });
        }
        out.push(structuredClone(row));
      }
      return out;
    },
  };

  return {
    store,
    db,
    repo: createStoreRepo(store),
    /** Bumps updated_at of a row as if someone else had just edited it. */
    touch(table: Table, id: string) {
      const row = db[table].find((r) => r.id === id)!;
      row.updated_at = tick();
    },
    failNextWrite(err: Error) {
      failNextWrite = err;
    },
  };
}
