import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import { UniqueViolationError, type ContactRow, type CrmRepo, type DealRow, type TaskRow, type VenueRow } from './repo';

const VENUE_COLS = 'id, name, type, city, country, capacity, email, instagram, website';
const CONTACT_COLS = 'id, venue_id, name, email, notes';
const DEAL_COLS = 'id, title, venue_id, contact_id, stage, priority, concert_date, tags, external_source, external_id, updated_at';
const TASK_COLS = 'id, deal_id, title, due_date, completed_at';
const PAGE = 1000;

/** Database error with the Postgres message but no stack, safe to surface as a tool error. */
export class DbError extends Error {
  constructor(error: PostgrestError) {
    super(`Erreur base de données${error.code ? ` (${error.code})` : ''} : ${error.message}`);
  }
}

function check<T>({ data, error }: { data: T; error: PostgrestError | null }): T {
  if (error) throw new DbError(error);
  return data;
}

/**
 * Supabase implementation of CrmRepo. Uses the service-role key (RLS is
 * bypassed), so every query is explicitly filtered on user_id = ownerId and
 * every insert sets it — the same invariant the RLS policies enforce for the app.
 */
export function createSupabaseRepo(url: string, serviceRoleKey: string, ownerId: string): CrmRepo {
  const db: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function all<T>(table: string, cols: string): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = check(
        await db.from(table).select(cols).eq('user_id', ownerId).order('id').range(from, from + PAGE - 1),
      ) as T[];
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  return {
    listVenues: () => all<VenueRow>('venues', VENUE_COLS),
    listContacts: () => all<ContactRow>('contacts', CONTACT_COLS),
    listDeals: () => all<DealRow>('deals', DEAL_COLS),

    async insertVenue(venue) {
      return check(await db.from('venues').insert({ ...venue, user_id: ownerId }).select(VENUE_COLS).single()) as VenueRow;
    },
    async updateVenue(id, patch) {
      check(await db.from('venues').update(patch).eq('id', id).eq('user_id', ownerId));
    },

    async insertContact(contact) {
      return check(
        await db.from('contacts').insert({ ...contact, user_id: ownerId }).select(CONTACT_COLS).single(),
      ) as ContactRow;
    },
    async updateContact(id, patch) {
      check(await db.from('contacts').update(patch).eq('id', id).eq('user_id', ownerId));
    },

    async insertDeal(deal) {
      const res = await db.from('deals').insert({ ...deal, user_id: ownerId }).select(DEAL_COLS).single();
      if (res.error?.code === '23505') throw new UniqueViolationError();
      return check(res) as DealRow;
    },
    async updateDeal(id, patch) {
      return check(
        await db.from('deals').update(patch).eq('id', id).eq('user_id', ownerId).select(DEAL_COLS).single(),
      ) as DealRow;
    },

    async lastActivityContent(dealId, type, prefix) {
      const rows = check(
        await db
          .from('activities')
          .select('content')
          .eq('user_id', ownerId)
          .eq('deal_id', dealId)
          .eq('type', type)
          .like('content', `${prefix.replace(/[%_\\]/g, '\\$&')}%`)
          .order('created_at', { ascending: false })
          .limit(1),
      ) as { content: string }[];
      return rows[0]?.content ?? null;
    },
    async insertActivity(activity) {
      check(await db.from('activities').insert({ ...activity, user_id: ownerId }));
    },

    async listTasks(dealId) {
      return check(
        await db.from('tasks').select(TASK_COLS).eq('user_id', ownerId).eq('deal_id', dealId),
      ) as TaskRow[];
    },
    async insertTask(task) {
      check(await db.from('tasks').insert({ ...task, user_id: ownerId }));
    },
    async updateTask(id, patch) {
      check(await db.from('tasks').update(patch).eq('id', id).eq('user_id', ownerId));
    },
  };
}
