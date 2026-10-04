import { z } from 'zod';
import {
  BAND_ROLES,
  EXCHANGE_STATUSES,
  EXPENSE_CATEGORIES,
  PRIORITIES,
  RELANCE_METHODS,
  STAGES,
  STYLE_FITS,
  TEMPLATE_CATEGORIES,
  TOUR_STATUSES,
  STOP_TYPES,
  VENUE_TYPES,
} from '@/types/database';
import type { Row, Table } from './store';

// Registry of the CRM entities exposed by the MCP connector: table, writable
// fields (strict zod schemas), references to other entities, display label.

export type EntityKey =
  | 'venue'
  | 'contact'
  | 'deal'
  | 'task'
  | 'activity'
  | 'tour'
  | 'tour_stop'
  | 'tour_expense'
  | 'template'
  | 'band';

const keys = <T extends string>(list: readonly { key: T }[]) => list.map((x) => x.key) as [T, ...T[]];

export const STAGE_IDS = keys(STAGES);
export const VENUE_TYPE_IDS = keys(VENUE_TYPES);
export const PRIORITY_IDS = keys(PRIORITIES);
export const CHANNEL_IDS = keys(RELANCE_METHODS);
export const TOUR_STATUS_IDS = keys(TOUR_STATUSES);
export const TOUR_STOP_TYPE_IDS = keys(STOP_TYPES);
export const EXPENSE_CATEGORY_IDS = keys(EXPENSE_CATEGORIES);
export const TEMPLATE_CATEGORY_IDS = keys(TEMPLATE_CATEGORIES);
export const STYLE_FIT_IDS = keys(STYLE_FITS);
export const EXCHANGE_STATUS_IDS = keys(EXCHANGE_STATUSES);
export const BAND_ROLE_IDS = keys(BAND_ROLES);
export const CONTACT_METHOD_IDS = ['email', 'phone', 'instagram', 'other'] as const;
export const TONE_IDS = ['tu', 'vous'] as const;
/** Activity types that can be logged by hand (status_change is written by the database). */
export const LOGGABLE_ACTIVITY_TYPES = ['email_sent', 'relance', 'call', 'message', 'reply_received', 'note', 'concert_played'] as const;

/** Enum with an error message that lists the valid values. */
export function enumOf<T extends string>(values: readonly [T, ...T[]], what: string) {
  return z.enum(values, { error: `${what} inconnu(e). Valeurs possibles : ${values.join(', ')}.` });
}

export const stageEnum = enumOf(STAGE_IDS, 'Étape').describe(`Étape du pipeline : ${STAGE_IDS.join(', ')}.`);
export const channelEnum = enumOf(CHANNEL_IDS, 'Canal').describe(`Canal : ${CHANNEL_IDS.join(', ')}.`);

const str = (max: number) => z.string().trim().max(max, `${max} caractères maximum`);
const opt = <T extends z.ZodType>(t: T) => t.nullable().optional();
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'Date invalide');
export const dateOrDateTime = z
  .union([isoDate, z.iso.datetime({ offset: true })], {
    error: 'Date attendue : YYYY-MM-DD ou date-heure ISO 8601 (ex. 2026-10-04T14:00:00Z).',
  })
  .describe('YYYY-MM-DD ou date-heure ISO 8601.');
export const monthDay = z
  .string()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Format attendu : MM-DD (ex. "01-15" pour le 15 janvier), date annuelle.');
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Heure attendue : HH:MM');
const uuid = (what: string) => z.uuid(`Id ${what} invalide (UUID attendu)`);
const email = z.email('Email invalide').max(254);
const money = z.number().min(0).max(10_000_000);

export interface EntityDef {
  key: EntityKey;
  table: Table;
  /** Suffix used in tool names: list_venues, get_venue… */
  plural: string;
  label: string;
  description: string;
  create: z.ZodObject;
  /** Fields that update_<entity> may change. */
  patch: z.ZodObject;
  /** Foreign keys checked on write (must exist and not be archived) and on restore. */
  refs: { col: string; entity: EntityKey }[];
  /** Columns whose content is searched by the search tool. */
  searchCols: string[];
  /** Default sort column for list tools. */
  defaultSort: string;
  sortable: string[];
  name(row: Row): string;
}

function makePatch(shape: z.ZodRawShape) {
  return z.strictObject(Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, (v as z.ZodType).optional()])));
}

const venueShape = {
  name: str(200).min(1),
  type: enumOf(VENUE_TYPE_IDS, 'Type de structure').describe(`Catégorie : ${VENUE_TYPE_IDS.join(', ')}.`),
  address: opt(str(300)),
  postal_code: opt(str(20)),
  city: str(100),
  country: str(100).describe('Nom du pays en français, ex. "France".'),
  capacity: opt(z.number().int().min(0).max(1_000_000)),
  email: opt(email),
  phone: opt(str(50)),
  instagram: opt(str(300)),
  website: opt(str(500)),
  fit_score: z.number().int().min(1).max(5).describe('Pertinence 1 à 5.'),
  notes: opt(str(20000)),
  latitude: opt(z.number().min(-90).max(90)),
  longitude: opt(z.number().min(-180).max(180)),
  application_opens: opt(monthDay).describe('Ouverture annuelle des candidatures (festivals, tremplins), MM-DD.'),
  application_deadline: opt(monthDay).describe('Clôture annuelle des candidatures, MM-DD. Alimente list_application_deadlines.'),
  application_url: opt(str(500)).describe('Lien du formulaire de candidature.'),
  style_fit: opt(enumOf(STYLE_FIT_IDS, 'Style')).describe('Programme notre style (post-punk / cold wave) : yes, maybe, no.'),
  similar_bands: opt(str(2000)).describe('Groupes proches déjà programmés ici.'),
  booking_lead_months: opt(z.number().int().min(0).max(24)).describe('Programme combien de mois à l’avance.'),
  do_not_contact_until: opt(isoDate).describe('Ne pas recontacter avant cette date.'),
};

const contactShape = {
  venue_id: opt(uuid('de structure')),
  name: str(200).min(1),
  role: opt(str(200)),
  email: opt(email),
  phone: opt(str(50)),
  pref_method: z.enum(CONTACT_METHOD_IDS, { error: `Valeurs possibles : ${CONTACT_METHOD_IDS.join(', ')}.` }),
  tone: z.enum(TONE_IDS, { error: 'Valeurs possibles : tu, vous.' }),
  notes: opt(str(20000)),
};

const dealShape = {
  title: opt(str(200)).describe('Nom de l’opportunité (sinon : nom du lieu ou du contact).'),
  venue_id: opt(uuid('de structure')),
  contact_id: opt(uuid('de contact')),
  stage: stageEnum,
  priority: enumOf(PRIORITY_IDS, 'Priorité'),
  first_contact_at: opt(dateOrDateTime),
  last_message_at: opt(dateOrDateTime),
  last_relance_method: opt(channelEnum),
  next_relance_at: opt(dateOrDateTime).describe('Date de relance (préférer set_follow_up).'),
  response: opt(str(5000)),
  concert_date: opt(isoDate),
  fee: opt(money).describe('Cachet en euros.'),
  show_on_website: z.boolean().describe('Afficher la date sur kruzberg.com (étapes confirme/termine avec concert_date).'),
  notes: opt(str(20000)),
  tags: z.array(str(50).min(1)).max(30),
  external_source: opt(str(50)).describe('Origine externe, ex. "radar".'),
  external_id: opt(str(100)).describe('Id dans l’outil externe, ex. id de piste du Booking Radar.'),
};

const taskShape = {
  title: str(300).min(1),
  description: opt(str(5000)),
  due_date: opt(isoDate),
  deal_id: opt(uuid("d'opportunité")),
  venue_id: opt(uuid('de structure')),
  completed_at: opt(dateOrDateTime).describe('Date de réalisation ; null = à faire.'),
};

const tourShape = {
  name: str(200).min(1),
  status: enumOf(TOUR_STATUS_IDS, 'Statut de tournée'),
  start_date: opt(isoDate),
  end_date: opt(isoDate),
  members_count: z.number().int().min(1).max(50),
  vehicle_label: opt(str(200)),
  vehicle_daily_cost: money.describe('€ / jour.'),
  fuel_consumption: z.number().min(0).max(100).describe('L / 100 km.'),
  fuel_price: z.number().min(0).max(10).describe('€ / L.'),
  per_diem: money.describe('€ / personne / jour.'),
  road_factor: z.number().min(1).max(3),
  color: opt(str(20)),
  notes: opt(str(20000)),
};

const tourStopShape = {
  tour_id: uuid('de tournée'),
  stop_date: isoDate,
  type: enumOf(TOUR_STOP_TYPE_IDS, "Type d'étape de tournée"),
  order_index: z.number().int().min(0).max(1000),
  deal_id: opt(uuid("d'opportunité")),
  venue_id: opt(uuid('de structure')),
  fee: opt(money),
  city: opt(str(100)),
  latitude: opt(z.number().min(-90).max(90)),
  longitude: opt(z.number().min(-180).max(180)),
  arrival_time: opt(time),
  load_in_time: opt(time),
  soundcheck_time: opt(time),
  doors_time: opt(time),
  set_time: opt(time),
  hotel_name: opt(str(200)),
  hotel_address: opt(str(300)),
  hotel_cost: opt(money),
  hotel_rooms: opt(z.number().int().min(0).max(100)),
  hotel_booked: z.boolean(),
  on_site_contact: opt(str(200)),
  on_site_phone: opt(str(50)),
  notes: opt(str(20000)),
};

const tourExpenseShape = {
  tour_id: uuid('de tournée'),
  stop_id: opt(uuid("d'étape de tournée")),
  category: enumOf(EXPENSE_CATEGORY_IDS, 'Catégorie de dépense'),
  label: str(200),
  amount: money.describe('Montant en euros.'),
  expense_date: opt(isoDate),
};

const templateShape = {
  name: str(200).min(1),
  category: enumOf(TEMPLATE_CATEGORY_IDS, 'Catégorie de modèle'),
  subject: str(500),
  body: str(50000),
};

const bandShape = {
  name: str(200).min(1),
  city: opt(str(100)),
  genre: opt(str(100)),
  contact_name: opt(str(200)),
  email: opt(email),
  phone: opt(str(50)),
  instagram: opt(str(300)),
  website: opt(str(500)),
  exchange_status: enumOf(EXCHANGE_STATUS_IDS, "Statut d'échange").describe(
    'none ; we_owe = on leur doit une date (chez nous) ; they_owe = ils nous doivent une date (chez eux).',
  ),
  notes: opt(str(20000)),
};

const activityPatch = z.strictObject({
  content: str(20000).optional(),
  type: enumOf(LOGGABLE_ACTIVITY_TYPES, "Type d'activité").optional(),
  channel: channelEnum.nullable().optional(),
  created_at: dateOrDateTime.optional().describe("Date de l'activité."),
});

/** Create schema: required fields + optional ones with DB defaults. */
function createSchema(shape: z.ZodRawShape, required: string[]) {
  return z.strictObject(
    Object.fromEntries(
      Object.entries(shape).map(([k, v]) => [k, required.includes(k) ? (v as z.ZodType) : (v as z.ZodType).optional()]),
    ),
  );
}

const nameOr = (...cols: string[]) => (row: Row) => {
  for (const c of cols) if (typeof row[c] === 'string' && (row[c] as string).trim()) return (row[c] as string).trim();
  return '(sans nom)';
};

export const ENTITIES: Record<EntityKey, EntityDef> = {
  venue: {
    key: 'venue',
    table: 'venues',
    plural: 'venues',
    label: 'structure',
    description: 'Structure : lieu, salle, bar, festival, organisateur, média…',
    create: createSchema(venueShape, ['name']),
    patch: makePatch(venueShape),
    refs: [],
    searchCols: ['name', 'city', 'email', 'phone', 'website', 'instagram', 'notes', 'address', 'similar_bands'],
    defaultSort: 'name',
    sortable: ['name', 'city', 'created_at', 'updated_at', 'fit_score', 'capacity'],
    name: nameOr('name'),
  },
  contact: {
    key: 'contact',
    table: 'contacts',
    plural: 'contacts',
    label: 'contact',
    description: 'Personne (programmateur, booker, journaliste…), éventuellement rattachée à une structure.',
    create: createSchema(contactShape, ['name']),
    patch: makePatch(contactShape),
    refs: [{ col: 'venue_id', entity: 'venue' }],
    searchCols: ['name', 'email', 'phone', 'role', 'notes'],
    defaultSort: 'name',
    sortable: ['name', 'created_at', 'updated_at'],
    name: nameOr('name'),
  },
  deal: {
    key: 'deal',
    table: 'deals',
    plural: 'deals',
    label: 'opportunité',
    description: 'Opportunité du pipeline de booking, rattachée à une structure et/ou un contact.',
    create: createSchema(dealShape, []).refine((d) => d.venue_id || d.contact_id, {
      message: 'Une opportunité doit être rattachée à une structure (venue_id) ou à un contact (contact_id).',
    }) as unknown as z.ZodObject,
    patch: makePatch(dealShape),
    refs: [
      { col: 'venue_id', entity: 'venue' },
      { col: 'contact_id', entity: 'contact' },
    ],
    searchCols: ['title', 'notes', 'response', 'external_id'],
    defaultSort: 'updated_at',
    sortable: ['updated_at', 'created_at', 'next_relance_at', 'concert_date', 'last_message_at', 'stage', 'priority', 'fee'],
    name: nameOr('title'),
  },
  task: {
    key: 'task',
    table: 'tasks',
    plural: 'tasks',
    label: 'tâche',
    description: 'Tâche à faire, éventuellement liée à une opportunité ou une structure.',
    create: createSchema(taskShape, ['title']),
    patch: makePatch(taskShape),
    refs: [
      { col: 'deal_id', entity: 'deal' },
      { col: 'venue_id', entity: 'venue' },
    ],
    searchCols: ['title', 'description'],
    defaultSort: 'due_date',
    sortable: ['due_date', 'created_at', 'updated_at', 'title'],
    name: nameOr('title'),
  },
  activity: {
    key: 'activity',
    table: 'activities',
    plural: 'activities',
    label: 'activité',
    description: 'Historique : notes, mails, relances, appels, DM, réponses, changements d’étape.',
    create: z.strictObject({}),
    patch: activityPatch,
    refs: [
      { col: 'deal_id', entity: 'deal' },
      { col: 'venue_id', entity: 'venue' },
      { col: 'contact_id', entity: 'contact' },
    ],
    searchCols: ['content'],
    defaultSort: 'created_at',
    sortable: ['created_at', 'updated_at'],
    name: (r) => `${r.type} du ${String(r.created_at ?? '').slice(0, 10)}`,
  },
  tour: {
    key: 'tour',
    table: 'tours',
    plural: 'tours',
    label: 'tournée',
    description: 'Tournée : regroupe des dates (étapes) avec logistique et budget.',
    create: createSchema(tourShape, ['name']),
    patch: makePatch(tourShape),
    refs: [],
    searchCols: ['name', 'notes', 'vehicle_label'],
    defaultSort: 'start_date',
    sortable: ['start_date', 'end_date', 'name', 'created_at', 'updated_at'],
    name: nameOr('name'),
  },
  tour_stop: {
    key: 'tour_stop',
    table: 'tour_stops',
    plural: 'tour_stops',
    label: 'étape de tournée',
    description: 'Une journée de tournée : concert, jour off ou trajet, avec horaires et hôtel.',
    create: createSchema(tourStopShape, ['tour_id', 'stop_date']),
    patch: makePatch(Object.fromEntries(Object.entries(tourStopShape).filter(([k]) => k !== 'tour_id'))),
    refs: [
      { col: 'tour_id', entity: 'tour' },
      { col: 'deal_id', entity: 'deal' },
      { col: 'venue_id', entity: 'venue' },
    ],
    searchCols: ['city', 'hotel_name', 'on_site_contact', 'notes'],
    defaultSort: 'stop_date',
    sortable: ['stop_date', 'order_index', 'created_at', 'updated_at'],
    name: (r) => `${r.stop_date ?? ''} ${r.city ?? ''}`.trim() || '(étape)',
  },
  tour_expense: {
    key: 'tour_expense',
    table: 'tour_expenses',
    plural: 'tour_expenses',
    label: 'dépense de tournée',
    description: 'Dépense ponctuelle d’une tournée (péage, repas…), éventuellement liée à une étape.',
    create: createSchema(tourExpenseShape, ['tour_id', 'amount']),
    patch: makePatch(Object.fromEntries(Object.entries(tourExpenseShape).filter(([k]) => k !== 'tour_id'))),
    refs: [
      { col: 'tour_id', entity: 'tour' },
      { col: 'stop_id', entity: 'tour_stop' },
    ],
    searchCols: ['label'],
    defaultSort: 'expense_date',
    sortable: ['expense_date', 'amount', 'created_at'],
    name: nameOr('label'),
  },
  template: {
    key: 'template',
    table: 'templates',
    plural: 'templates',
    label: 'modèle de mail',
    description: 'Modèle de mail (premier contact, relances, confirmation, post-concert).',
    create: createSchema(templateShape, ['name']),
    patch: makePatch(templateShape),
    refs: [],
    searchCols: ['name', 'subject', 'body'],
    defaultSort: 'name',
    sortable: ['name', 'category', 'created_at', 'updated_at'],
    name: nameOr('name'),
  },
  band: {
    key: 'band',
    table: 'bands',
    plural: 'bands',
    label: 'groupe ami',
    description: 'Groupe de la scène : plateaux partagés, échanges de dates (on vous fait jouer chez nous, vous chez vous).',
    create: createSchema(bandShape, ['name']),
    patch: makePatch(bandShape),
    refs: [],
    searchCols: ['name', 'city', 'genre', 'contact_name', 'email', 'notes'],
    defaultSort: 'name',
    sortable: ['name', 'city', 'created_at', 'updated_at'],
    name: nameOr('name'),
  },
};

export const ENTITY_KEYS = Object.keys(ENTITIES) as [EntityKey, ...EntityKey[]];
export const entityEnum = enumOf(ENTITY_KEYS, 'Entité');

/** Children archived together with a parent (and restored with it). */
export const CASCADES: Record<EntityKey, { entity: EntityKey; col: string; extra?: (row: Row) => boolean }[]> = {
  venue: [
    { entity: 'contact', col: 'venue_id' },
    { entity: 'deal', col: 'venue_id' },
    { entity: 'task', col: 'venue_id' },
  ],
  // A deal without venue cannot live without its contact (deals_venue_or_contact_check).
  contact: [{ entity: 'deal', col: 'contact_id', extra: (d) => d.venue_id == null }],
  deal: [{ entity: 'task', col: 'deal_id' }],
  task: [],
  activity: [],
  tour: [
    { entity: 'tour_stop', col: 'tour_id' },
    { entity: 'tour_expense', col: 'tour_id' },
  ],
  tour_stop: [{ entity: 'tour_expense', col: 'stop_id' }],
  tour_expense: [],
  template: [],
  band: [],
};

export function entityUrl(baseUrl: string, entity: EntityKey, row: Row): string | null {
  const base = baseUrl.replace(/\/+$/, '');
  switch (entity) {
    case 'deal':
      return `${base}/pipeline?deal=${row.id}`;
    case 'venue':
      return `${base}/venues`;
    case 'tour':
      return `${base}/tours/${row.id}`;
    case 'tour_stop':
    case 'tour_expense':
      return `${base}/tours/${row.tour_id}`;
    case 'template':
      return `${base}/templates`;
    case 'band':
      return `${base}/groupes`;
    default:
      return null;
  }
}
