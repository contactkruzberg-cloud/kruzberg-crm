export type DealStage =
  | 'a_contacter'
  | 'contacte'
  | 'relance'
  | 'repondu'
  | 'a_suivre'
  | 'confirme'
  | 'termine'
  | 'refuse';

export type DealPriority = 'low' | 'medium' | 'high';

export type VenueType = 'bar' | 'salle' | 'festival' | 'cafe_concert' | 'mjc' | 'organisateur' | 'media' | 'other';

export type ContactTone = 'tu' | 'vous';

export type ContactMethod = 'email' | 'phone' | 'instagram' | 'other';

export type RelanceMethod =
  | 'sms'
  | 'phone'
  | 'email'
  | 'website_form'
  | 'facebook'
  | 'instagram'
  | 'whatsapp'
  | 'linkedin'
  | 'in_person'
  | 'other';

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

export type TourStatus = 'brouillon' | 'confirmee' | 'terminee' | 'annulee';

export type TourStopType = 'show' | 'day_off' | 'travel';

export type ExpenseCategory =
  | 'fuel'
  | 'toll'
  | 'hotel'
  | 'food'
  | 'per_diem'
  | 'transport'
  | 'misc';

export interface Venue {
  id: string;
  user_id: string;
  name: string;
  type: VenueType;
  address: string | null;
  postal_code: string | null;
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
  last_relance_method: RelanceMethod | null;
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

export interface Tour {
  id: string;
  user_id: string;
  name: string;
  status: TourStatus;
  start_date: string | null;
  end_date: string | null;
  members_count: number;
  vehicle_label: string | null;
  vehicle_daily_cost: number;
  fuel_consumption: number;
  fuel_price: number;
  per_diem: number;
  road_factor: number;
  color: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TourStop {
  id: string;
  user_id: string;
  tour_id: string;
  deal_id: string | null;
  venue_id: string | null;
  stop_date: string;
  type: TourStopType;
  order_index: number;
  fee: number | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  arrival_time: string | null;
  load_in_time: string | null;
  soundcheck_time: string | null;
  doors_time: string | null;
  set_time: string | null;
  hotel_name: string | null;
  hotel_address: string | null;
  hotel_cost: number | null;
  hotel_rooms: number | null;
  hotel_booked: boolean;
  on_site_contact: string | null;
  on_site_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deal?: Deal;
  venue?: Venue;
}

export interface TourExpense {
  id: string;
  user_id: string;
  tour_id: string;
  stop_id: string | null;
  category: ExpenseCategory;
  label: string;
  amount: number;
  expense_date: string | null;
  created_at: string;
}

// Pipeline stage metadata
export const STAGES: { key: DealStage; label: string; color: string }[] = [
  { key: 'a_contacter', label: 'À contacter', color: 'stage-a-contacter' },
  { key: 'contacte', label: 'Contacté', color: 'stage-contacte' },
  { key: 'relance', label: 'Relancé', color: 'stage-relance' },
  { key: 'repondu', label: 'Répondu', color: 'stage-repondu' },
  { key: 'a_suivre', label: 'À suivre', color: 'stage-a-suivre' },
  { key: 'confirme', label: 'Confirmé', color: 'stage-confirme' },
  { key: 'termine', label: 'Terminé', color: 'stage-termine' },
  { key: 'refuse', label: 'Refusé', color: 'stage-refuse' },
];

export const VENUE_TYPES: { key: VenueType; label: string }[] = [
  { key: 'bar', label: 'Bar' },
  { key: 'salle', label: 'Salle' },
  { key: 'festival', label: 'Festival' },
  { key: 'cafe_concert', label: 'Café Concert' },
  { key: 'mjc', label: 'MJC' },
  { key: 'organisateur', label: 'Organisateur' },
  { key: 'media', label: 'Média' },
  { key: 'other', label: 'Autre' },
];

export const TEMPLATE_CATEGORIES: { key: TemplateCategory; label: string }[] = [
  { key: 'first_contact', label: 'Premier contact' },
  { key: 'relance_1', label: 'Relance 1' },
  { key: 'relance_2', label: 'Relance 2' },
  { key: 'confirmation', label: 'Confirmation' },
  { key: 'post_show', label: 'Post-concert' },
];

export const RELANCE_METHODS: { key: RelanceMethod; label: string }[] = [
  { key: 'email', label: 'Mail' },
  { key: 'phone', label: 'Téléphone' },
  { key: 'sms', label: 'SMS' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'website_form', label: 'Formulaire site' },
  { key: 'in_person', label: 'En personne' },
  { key: 'other', label: 'Autre' },
];

export const PRIORITIES: { key: DealPriority; label: string; color: string }[] = [
  { key: 'high', label: 'Haute', color: 'text-red-500' },
  { key: 'medium', label: 'Moyenne', color: 'text-orange-500' },
  { key: 'low', label: 'Basse', color: 'text-gray-500' },
];

export const TOUR_STATUSES: { key: TourStatus; label: string; color: string }[] = [
  { key: 'brouillon', label: 'Brouillon', color: 'text-gray-500' },
  { key: 'confirmee', label: 'Confirmée', color: 'text-green-500' },
  { key: 'terminee', label: 'Terminée', color: 'text-blue-500' },
  { key: 'annulee', label: 'Annulée', color: 'text-red-500' },
];

export const STOP_TYPES: { key: TourStopType; label: string; color: string }[] = [
  { key: 'show', label: 'Concert', color: '#22c55e' },
  { key: 'day_off', label: 'Jour off', color: '#64748b' },
  { key: 'travel', label: 'Trajet', color: '#3b82f6' },
];

export const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string }[] = [
  { key: 'fuel', label: 'Carburant' },
  { key: 'toll', label: 'Péages' },
  { key: 'hotel', label: 'Hôtel' },
  { key: 'food', label: 'Repas' },
  { key: 'per_diem', label: 'Per-diem' },
  { key: 'transport', label: 'Transport' },
  { key: 'misc', label: 'Divers' },
];
