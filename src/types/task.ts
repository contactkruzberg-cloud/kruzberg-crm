import type { Deal, Venue } from './database';

export interface Task {
  id: string;
  user_id: string;
  deal_id: string | null;
  venue_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deal?: Deal;
  venue?: Venue;
}
