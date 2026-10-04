import { selectAll, type Row, type Store, type Table } from './store';

const ENTITY_BY_TABLE: Partial<Record<Table, string>> = {
  venues: 'venue',
  contacts: 'contact',
  deals: 'deal',
  tasks: 'task',
  activities: 'activity',
  tours: 'tour',
  tour_stops: 'tour_stop',
  tour_expenses: 'tour_expense',
  templates: 'template',
  bands: 'band',
  deal_bands: 'deal_band',
  briefings: 'briefing',
};

const strip = (row: Row | null) => {
  if (!row) return null;
  const { user_id: _u, ...rest } = row;
  void _u;
  return rest;
};

function actionOf(before: Row, patch: Row): 'archive' | 'restore' | 'update' {
  if ('deleted_at' in patch && patch.deleted_at != null && before.deleted_at == null) return 'archive';
  if ('deleted_at' in patch && patch.deleted_at == null && before.deleted_at != null) return 'restore';
  return 'update';
}

/**
 * Wraps a Store so that every insert and update on a CRM table is written to
 * mcp_audit_log (who, when, which tool, before/after), one entry per row.
 * Cascades (archiving a venue archives its deals…) are therefore audited too.
 * An audit failure is logged but does not hide the write that already happened.
 */
export function withAudit(store: Store, actor: string, tool: string): Store {
  async function log(table: Table, action: string, entityId: unknown, before: Row | null, after: Row | null) {
    const entity = ENTITY_BY_TABLE[table];
    if (!entity) return;
    try {
      await store.insert('mcp_audit_log', {
        actor,
        tool,
        action,
        entity,
        entity_id: entityId ?? null,
        before: strip(before),
        after: strip(after),
      });
    } catch (err) {
      console.error('[mcp] audit log write failed', err);
    }
  }

  return {
    select: (table, query) => store.select(table, query),

    async insert(table, row) {
      const created = await store.insert(table, row);
      await log(table, 'create', created.id, null, created);
      return created;
    },

    async update(table, filters, patch) {
      const before = ENTITY_BY_TABLE[table] ? await selectAll(store, table, { filters }) : [];
      const updated = await store.update(table, filters, patch);
      const beforeById = new Map(before.map((r) => [r.id, r]));
      for (const row of updated) {
        const prev = beforeById.get(row.id) ?? null;
        await log(table, prev ? actionOf(prev, patch) : 'update', row.id, prev, row);
      }
      return updated;
    },
  };
}
