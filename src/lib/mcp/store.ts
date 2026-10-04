// Generic, owner-scoped table access used by the MCP connector.
// Two implementations: Supabase (supabase-store.ts) and in-memory (tests).
// Every read and write is restricted to a single owner (MCP_OWNER_ID), and
// every insert sets user_id — the invariant the RLS policies enforce for the app.

export type Row = Record<string, unknown>;

export type Table =
  | 'venues'
  | 'contacts'
  | 'deals'
  | 'tasks'
  | 'activities'
  | 'tours'
  | 'tour_stops'
  | 'tour_expenses'
  | 'templates'
  | 'bands'
  | 'deal_bands'
  | 'briefings'
  | 'radar_docs'
  | 'radar_sync'
  | 'mcp_audit_log';

export type Filter =
  | { col: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; value: string | number | boolean }
  | { col: string; op: 'in'; value: (string | number)[] }
  | { col: string; op: 'is_null' | 'not_null' }
  /** Case-insensitive substring match. */
  | { col: string; op: 'ilike'; value: string }
  /** Array column contains this element. */
  | { col: string; op: 'has'; value: string }
  /** NULL, or less than or equal to value. */
  | { col: string; op: 'null_or_lte'; value: string };

export interface Query {
  filters?: Filter[];
  order?: { col: string; asc: boolean }[];
  offset?: number;
  limit?: number;
}

export interface Store {
  /** Rows of the owner matching the query (archived rows included unless filtered). */
  select(table: Table, query?: Query): Promise<Row[]>;
  insert(table: Table, row: Row): Promise<Row>;
  /** Inserts many rows in one round trip. */
  insertMany(table: Table, rows: Row[]): Promise<void>;
  /** Updates the owner's rows matching the filters; returns the updated rows (empty if none matched). */
  update(table: Table, filters: Filter[], patch: Row): Promise<Row[]>;
}

/** Database error with the Postgres message but no stack, safe to surface as a tool error. */
export class DbError extends Error {
  constructor(message: string, code?: string) {
    super(`Erreur base de données${code ? ` (${code})` : ''} : ${message}`);
  }
}

/** Thrown on a unique index violation (e.g. same external_source + external_id). */
export class UniqueViolationError extends Error {
  constructor() {
    super('unique_violation');
  }
}

/** Fetches every row matching the query, page by page. */
export async function selectAll(store: Store, table: Table, query: Query = {}): Promise<Row[]> {
  const PAGE = 1000;
  const rows: Row[] = [];
  const order = query.order ?? [{ col: 'id', asc: true }];
  for (let offset = 0; ; offset += PAGE) {
    const page = await store.select(table, { ...query, order, offset, limit: PAGE });
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export const isActive = (row: Row) => row.deleted_at == null;
