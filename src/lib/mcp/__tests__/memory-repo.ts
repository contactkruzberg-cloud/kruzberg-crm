import { randomUUID } from 'node:crypto';
import type { ActivityType } from '@/types/database';
import { UniqueViolationError, type ContactRow, type CrmRepo, type DealRow, type TaskRow, type VenueRow } from '../repo';

/** In-memory CrmRepo for tests. Enforces the unique (external_source, external_id) index like Postgres. */
export function createMemoryRepo() {
  let clock = 0;
  const tick = () => new Date(Date.UTC(2026, 0, 1) + ++clock * 1000).toISOString();
  const db = {
    venues: [] as (VenueRow & { fit_score: number })[],
    contacts: [] as ContactRow[],
    deals: [] as DealRow[],
    activities: [] as { id: string; deal_id: string; type: ActivityType; content: string; created_at: string }[],
    tasks: [] as TaskRow[],
  };
  const copy = <T>(rows: T[]) => rows.map((r) => ({ ...r }));

  const repo: CrmRepo = {
    listVenues: async () => copy(db.venues),
    listContacts: async () => copy(db.contacts),
    listDeals: async () => copy(db.deals),
    async insertVenue(v) {
      const row = { ...v, id: randomUUID() };
      db.venues.push(row);
      return { ...row };
    },
    async updateVenue(id, patch) {
      Object.assign(db.venues.find((v) => v.id === id)!, patch);
    },
    async insertContact(c) {
      const row = { ...c, id: randomUUID() };
      db.contacts.push(row);
      return { ...row };
    },
    async updateContact(id, patch) {
      Object.assign(db.contacts.find((c) => c.id === id)!, patch);
    },
    async insertDeal(d) {
      if (d.external_id && db.deals.some((x) => x.external_source === d.external_source && x.external_id === d.external_id)) {
        throw new UniqueViolationError();
      }
      const row = { ...d, title: d.title ?? null, id: randomUUID(), updated_at: tick() };
      db.deals.push(row);
      return { ...row };
    },
    async updateDeal(id, patch) {
      const row = db.deals.find((d) => d.id === id)!;
      if (patch.stage && patch.stage !== row.stage) {
        // Mirrors the deal_stage_change_log trigger.
        db.activities.push({ id: randomUUID(), deal_id: id, type: 'status_change', content: `Stage changed from ${row.stage} to ${patch.stage}`, created_at: tick() });
      }
      Object.assign(row, patch, { updated_at: tick() });
      return { ...row };
    },
    async lastActivityContent(dealId, type, prefix) {
      const rows = db.activities.filter((a) => a.deal_id === dealId && a.type === type && a.content.startsWith(prefix));
      return rows.at(-1)?.content ?? null;
    },
    async insertActivity(a) {
      db.activities.push({ id: randomUUID(), deal_id: a.deal_id, type: a.type, content: a.content, created_at: tick() });
    },
    listTasks: async (dealId) => copy(db.tasks.filter((t) => t.deal_id === dealId)),
    async insertTask(t) {
      db.tasks.push({ id: randomUUID(), deal_id: t.deal_id, title: t.title, due_date: t.due_date, completed_at: null });
    },
    async updateTask(id, patch) {
      Object.assign(db.tasks.find((t) => t.id === id)!, patch);
    },
  };
  return { repo, db };
}
