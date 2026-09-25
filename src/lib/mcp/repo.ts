import type { ActivityType, DealPriority, DealStage, VenueType } from '@/types/database';

// Minimal row shapes used by the MCP connector. All reads and writes are
// scoped to a single owner (MCP_OWNER_ID) by the repository implementation.

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
  venue_id: string;
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
export type NewDeal = Omit<DealRow, 'id' | 'updated_at'>;

/** Thrown by insertDeal when (external_source, external_id) already exists. */
export class UniqueViolationError extends Error {
  constructor() {
    super('unique_violation');
  }
}

export interface CrmRepo {
  listVenues(): Promise<VenueRow[]>;
  listContacts(): Promise<ContactRow[]>;
  listDeals(): Promise<DealRow[]>;
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
