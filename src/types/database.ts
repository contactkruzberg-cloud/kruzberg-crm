export type DealStage =
  | 'a_contacter'
  | 'contacte'
  | 'relance'
  | 'repondu'
  | 'confirme'
  | 'refuse';

export type DealPriority = 'low' | 'medium' | 'high';

export type VenueType = 'bar' | 'salle' | 'festival' | 'cafe_concert' | 'mjc' | 'other';

export type ContactTone = 'tu' | 'vous';

export type ContactMethod = 'email' | 'phone' | 'instagram' | 'other';

export type ActivityType =
  | 'email_sent'
  | 'reply_received'
  | 'status_change'
  | 'note'
  | 'concert_played';

export type TemplateCategory =
  | 'first_contact'
  | 'relance_1'
  | 'relance_2'
  | 'confirmation'
  | 'post_show';

export interface Venue {
  id: string;
  user_id: string;
  name: string;
  type: VenueType;
  city: string;
  country: string;
  capacity: number | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  website: string | null;
  fit_score: number;
  cover_image_url: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  venue_id: string | null;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  pref_method: ContactMethod;
  tone: ContactTone;
  notes: string | null;
  created_at: string;
  updated_at: string;
  venue?: Venue;
}

export interface Deal {
  id: string;
  user_id: string;
  venue_id: string;
  contact_id: string | null;
  stage: DealStage;
  priority: DealPriority;
  first_contact_at: string | null;
  last_message_at: string | null;
  next_relance_at: string | null;
  response: string | null;
  concert_date: string | null;
  fee: number | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  venue?: Venue;
  contact?: Contact;
}

export interface Activity {
  id: string;
  user_id: string;
  deal_id: string | null;
  venue_id: string | null;
  contact_id: string | null;
  type: ActivityType;
  content: string;
  created_at: string;
  venue?: Venue;
  deal?: Deal;
  contact?: Contact;
}

export interface Template {
  id: string;
  user_id: string;
  name: string;
  category: TemplateCategory;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateSend {
  id: string;
  user_id: string;
  template_id: string;
  deal_id: string | null;
  contact_id: string | null;
  generated_body: string;
  created_at: string;
  template?: Template;
  deal?: Deal;
  contact?: Contact;
}

// Pipeline stage metadata
export const STAGES: { key: DealStage; label: string; color: string }[] = [
  { key: 'a_contacter', label: 'À contacter', color: 'stage-a-contacter' },
  { key: 'contacte', label: 'Contacté', color: 'stage-contacte' },
  { key: 'relance', label: 'Relancé', color: 'stage-relance' },
  { key: 'repondu', label: 'Répondu', color: 'stage-repondu' },
  { key: 'confirme', label: 'Confirmé', color: 'stage-confirme' },
  { key: 'refuse', label: 'Refusé', color: 'stage-refuse' },
];

export const VENUE_TYPES: { key: VenueType; label: string }[] = [
  { key: 'bar', label: 'Bar' },
  { key: 'salle', label: 'Salle' },
  { key: 'festival', label: 'Festival' },
  { key: 'cafe_concert', label: 'Café Concert' },
  { key: 'mjc', label: 'MJC' },
  { key: 'other', label: 'Autre' },
];

export const TEMPLATE_CATEGORIES: { key: TemplateCategory; label: string }[] = [
  { key: 'first_contact', label: 'Premier contact' },
  { key: 'relance_1', label: 'Relance 1' },
  { key: 'relance_2', label: 'Relance 2' },
  { key: 'confirmation', label: 'Confirmation' },
  { key: 'post_show', label: 'Post-concert' },
];

export const PRIORITIES: { key: DealPriority; label: string; color: string }[] = [
  { key: 'high', label: 'Haute', color: 'text-red-500' },
  { key: 'medium', label: 'Moyenne', color: 'text-orange-500' },
  { key: 'low', label: 'Basse', color: 'text-gray-500' },
];
