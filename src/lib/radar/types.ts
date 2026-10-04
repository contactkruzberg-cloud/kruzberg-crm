// Booking Radar documents (same shape as the claude.ai artifact database).

export type RadarCat = 'festivals' | 'tremplins' | 'booking_fr' | 'booking_eu' | 'support' | 'pros' | 'presse';

export interface Lead {
  id: string;
  cat: RadarCat;
  name: string;
  org?: string;
  type?: string;
  city?: string;
  country?: string;
  region?: string;
  capacity?: string | number;
  venue?: string;
  support?: string;
  decider?: string;
  deciderWho?: string;
  deciderWhy?: string;
  deadline?: string;
  eventDate?: string;
  contact?: string;
  email?: string;
  emailSource?: string;
  emailGeneric?: string;
  contactForm?: { url: string; label?: string };
  instagram?: string;
  contactRoute?: string;
  links?: { label?: string; url: string }[];
  why?: string;
  action?: string;
  fit?: number;
  verified?: string;
  status?: string;
  statusAt?: string;
  notes?: string;
  dismissed?: boolean;
  dismissReason?: string;
  dismissedAt?: string;
  addedAt?: string;
  source?: string;
  level?: number;
  style?: number;
  levelWhy?: string;
  chanceAdj?: number;
  draftAt?: string;
  draftTo?: string;
  draftState?: 'pending' | 'created' | 'error';
  draftVia?: string;
  contactChannel?: string;
  contactedAt?: string;
  crmId?: string;
  crmUrl?: string;
  crmStage?: string;
  crmAt?: string;
  [key: string]: unknown;
}

export interface RadarMeta {
  date?: string;
  added?: number;
  summary?: string;
}

export interface RadarScope {
  focus?: string;
  exclude?: string;
  next?: string;
  cats?: Partial<Record<RadarCat, { on?: boolean; max?: number }>>;
  updatedAt?: string;
}

export interface RadarRun {
  date: string;
  added?: number;
  summary?: string;
}

export interface OutboxItem {
  id: string;
  leadId: string;
  leadName?: string;
  to: string[];
  subject: string;
  body: string;
  state: string;
  createdAt?: string;
}
