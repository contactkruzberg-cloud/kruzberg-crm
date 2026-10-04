import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import { DbError, UniqueViolationError, type Filter, type Row, type Store, type Table } from './store';

function fail(error: PostgrestError): never {
  if (error.code === '23505') throw new UniqueViolationError();
  throw new DbError(error.message, error.code);
}

const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');

// Minimal structural type for the PostgREST filter builder methods we use.
interface Filterable<T> {
  eq(col: string, v: unknown): T;
  neq(col: string, v: unknown): T;
  gt(col: string, v: unknown): T;
  gte(col: string, v: unknown): T;
  lt(col: string, v: unknown): T;
  lte(col: string, v: unknown): T;
  in(col: string, v: readonly unknown[]): T;
  is(col: string, v: null): T;
  not(col: string, op: string, v: unknown): T;
  ilike(col: string, pattern: string): T;
  contains(col: string, v: unknown): T;
  or(filters: string): T;
}

function applyFilters<T extends Filterable<T>>(q: T, filters: Filter[]): T {
  for (const f of filters) {
    switch (f.op) {
      case 'eq':
      case 'neq':
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        q = q[f.op](f.col, f.value);
        break;
      case 'in':
        q = q.in(f.col, f.value);
        break;
      case 'is_null':
        q = q.is(f.col, null);
        break;
      case 'not_null':
        q = q.not(f.col, 'is', null);
        break;
      case 'ilike':
        q = q.ilike(f.col, `%${escapeLike(f.value)}%`);
        break;
      case 'has':
        q = q.contains(f.col, [f.value]);
        break;
      case 'null_or_lte':
        if (!/^[\w:.+-]+$/.test(f.value)) throw new DbError(`valeur de filtre invalide : ${f.value}`);
        q = q.or(`${f.col}.is.null,${f.col}.lte.${f.value}`);
        break;
    }
  }
  return q;
}

/**
 * Supabase implementation of Store. Uses the service-role key (RLS is
 * bypassed), so every query is explicitly filtered on user_id = ownerId.
 */
export function createSupabaseStore(url: string, serviceRoleKey: string, ownerId: string): Store {
  const db: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async select(table: Table, query = {}) {
      let q = applyFilters(db.from(table).select('*').eq('user_id', ownerId), query.filters ?? []);
      for (const o of query.order ?? []) q = q.order(o.col, { ascending: o.asc, nullsFirst: false });
      const offset = query.offset ?? 0;
      if (query.limit != null) q = q.range(offset, offset + query.limit - 1);
      const { data, error } = await q;
      if (error) fail(error);
      return (data ?? []) as Row[];
    },

    async insert(table, row) {
      const { data, error } = await db.from(table).insert({ ...row, user_id: ownerId }).select('*').single();
      if (error) fail(error);
      return data as Row;
    },

    async insertMany(table, rows) {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from(table).insert(rows.slice(i, i + 500).map((r) => ({ ...r, user_id: ownerId })));
        if (error) fail(error);
      }
    },

    async update(table, filters, patch) {
      const { user_id: _ignored, ...safe } = patch;
      void _ignored;
      const { data, error } = await applyFilters(
        db.from(table).update(safe).eq('user_id', ownerId),
        filters,
      ).select('*');
      if (error) fail(error);
      return (data ?? []) as Row[];
    },
  };
}
