import type { ActivityType, DealPriority, DealStage, VenueType } from '@/types/database';
import { selectAll, UniqueViolationError, type Row, type Store } from './store';

export { UniqueViolationError };

// Minimal row shapes used by the Booking Radar tools (add_to_pipeline…).
// Implemented on top of the generic Store, which scopes everything to the owner.
// Archived rows are invisible here, like in the app.

export interface VenueRow {
  id: string;
  name: string;
  type: VenueType;
  city: string;
  country: string;
  capacity: number | null;
  email: string | null;
  instagram: string | null;
  website: string | null;
}

export interface ContactRow {
  id: string;
  venue_id: string | null;
  name: string;
  email: string | null;
  notes: string | null;
}

export interface DealRow {
  id: string;
  title: string | null;
  venue_id: string | null;
  contact_id: string | null;
  stage: DealStage;
  priority: DealPriority;
  concert_date: string | null;
  tags: string[];
  external_source: string | null;
  external_id: string | null;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  deal_id: string | null;
  title: string;
  due_date: string | null;
  completed_at: string | null;
}

export type NewVenue = Omit<VenueRow, 'id'> & { fit_score: number };
export type NewContact = Omit<ContactRow, 'id'>;
export type NewDeal = Omit<DealRow, 'id' | 'updated_at' | 'title'> & { title?: string | null };

export interface CrmRepo {
  listVenues(): Promise<VenueRow[]>;
  listContacts(): Promise<ContactRow[]>;
  listDeals(): Promise<DealRow[]>;
  /** Id of an archived deal anchored to this external ref, if any. */
  findArchivedDeal(externalSource: string, externalId: string): Promise<string | null>;
  insertVenue(venue: NewVenue): Promise<VenueRow>;
  updateVenue(id: string, patch: Partial<NewVenue>): Promise<void>;
  insertContact(contact: NewContact): Promise<ContactRow>;
  updateContact(id: string, patch: Partial<NewContact>): Promise<void>;
  insertDeal(deal: NewDeal): Promise<DealRow>;
  updateDeal(id: string, patch: Partial<NewDeal>): Promise<DealRow>;
  /** Content of the most recent activity of `type` on the deal whose content starts with `prefix`. */
  lastActivityContent(dealId: string, type: ActivityType, prefix: string): Promise<string | null>;
  insertActivity(activity: {
    deal_id: string;
    venue_id: string | null;
    contact_id: string | null;
    type: ActivityType;
    content: string;
  }): Promise<void>;
  listTasks(dealId: string): Promise<TaskRow[]>;
  insertTask(task: { deal_id: string; venue_id: string | null; title: string; description: string | null; due_date: string }): Promise<void>;
  updateTask(id: string, patch: { due_date: string }): Promise<void>;
}

const active = { col: 'deleted_at', op: 'is_null' } as const;
const byId = (id: string) => [{ col: 'id', op: 'eq' as const, value: id }];

export function createStoreRepo(store: Store): CrmRepo {
  const list = <T>(table: 'venues' | 'contacts' | 'deals') =>
    selectAll(store, table, { filters: [active] }) as Promise<T[]>;

  return {
    listVenues: () => list<VenueRow>('venues'),
    listContacts: () => list<ContactRow>('contacts'),
    listDeals: () => list<DealRow>('deals'),

    async findArchivedDeal(source, externalId) {
      const rows = await store.select('deals', {
        filters: [
          { col: 'external_source', op: 'eq', value: source },
          { col: 'external_id', op: 'eq', value: externalId },
          { col: 'deleted_at', op: 'not_null' },
        ],
        limit: 1,
      });
      return (rows[0]?.id as string) ?? null;
    },

    insertVenue: async (venue) => (await store.insert('venues', venue as Row)) as unknown as VenueRow,
    async updateVenue(id, patch) {
      await store.update('venues', byId(id), patch as Row);
    },
    insertContact: async (contact) => (await store.insert('contacts', contact as Row)) as unknown as ContactRow,
    async updateContact(id, patch) {
      await store.update('contacts', byId(id), patch as Row);
    },
    insertDeal: async (deal) => (await store.insert('deals', deal as Row)) as unknown as DealRow,
    async updateDeal(id, patch) {
      const [row] = await store.update('deals', byId(id), patch as Row);
      return row as unknown as DealRow;
    },

    async lastActivityContent(dealId, type, prefix) {
      const rows = await store.select('activities', {
        filters: [
          { col: 'deal_id', op: 'eq', value: dealId },
          { col: 'type', op: 'eq', value: type },
          { col: 'content', op: 'ilike', value: prefix },
          active,
        ],
        order: [{ col: 'created_at', asc: false }],
        limit: 20,
      });
      const hit = rows.find((r) => String(r.content).startsWith(prefix));
      return hit ? String(hit.content) : null;
    },
    async insertActivity(activity) {
      await store.insert('activities', activity);
    },

    listTasks: async (dealId) =>
      (await selectAll(store, 'tasks', { filters: [{ col: 'deal_id', op: 'eq', value: dealId }, active] })) as unknown as TaskRow[],
    async insertTask(task) {
      await store.insert('tasks', task);
    },
    async updateTask(id, patch) {
      await store.update('tasks', byId(id), patch);
    },
  };
}
