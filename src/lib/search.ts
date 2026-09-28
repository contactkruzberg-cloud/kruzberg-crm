import { STAGES, type Contact, type Deal, type Venue } from '@/types/database';

/** Lowercase, strip accents, punctuation → spaces: "L'Épicerie-Moderne" → "l epicerie moderne". */
export function normalizeSearch(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9@.]+/g, ' ')
    .trim();
}

/** Query → words. Every word must be found somewhere (any order, any field). */
export function searchTokens(query: string): string[] {
  return normalizeSearch(query).split(' ').filter(Boolean);
}

interface Field {
  label: string;
  value: string;
  /** Already visible on the card / row: no need to explain why it matched. */
  visible?: boolean;
}

interface IndexedField extends Field {
  norm: string;
  compact: string;
}

function field(label: string, value: string | number | null | undefined, visible = false): Field | null {
  if (value === null || value === undefined || value === '') return null;
  return { label, value: String(value), visible };
}

function index(fields: (Field | null)[]): IndexedField[] {
  return fields
    .filter((f): f is Field => !!f)
    .map((f) => {
      const norm = normalizeSearch(f.value);
      return { ...f, norm, compact: norm.replace(/[ .]/g, '') };
    });
}

function contactFields(c: Contact, label: string): (Field | null)[] {
  return [
    field(label, c.role ? `${c.name} (${c.role})` : c.name),
    field(`Email ${label.toLowerCase()}`, c.email),
    field(`Tél. ${label.toLowerCase()}`, c.phone),
  ];
}

function venueFields(v: Venue): (Field | null)[] {
  return [
    field('Lieu', v.name, true),
    field('Ville', v.city, true),
    field('Code postal', v.postal_code),
    field('Adresse', v.address),
    field('Pays', v.country),
    field('Email lieu', v.email),
    field('Tél. lieu', v.phone),
    field('Instagram', v.instagram),
    field('Site', v.website),
  ];
}

/**
 * Everything an opportunity can be recognised by: its title, its venue, its
 * contact, the other contacts of its venue, tags, notes, stage, dates.
 */
function dealFields(deal: Deal, venueContacts: Contact[]): IndexedField[] {
  const stage = STAGES.find((s) => s.key === deal.stage)?.label;
  return index([
    field('Titre', deal.title, true),
    ...(deal.venue ? venueFields(deal.venue) : []),
    ...(deal.contact ? contactFields(deal.contact, 'Contact') : []),
    ...venueContacts
      .filter((c) => c.id !== deal.contact_id)
      .flatMap((c) => contactFields(c, 'Contact du lieu')),
    ...(deal.tags ?? []).map((t) => field('Tag', t, true)),
    field('Étape', stage),
    field('Date concert', deal.concert_date),
    field('Réponse', deal.response),
    field('Notes', deal.notes),
  ]);
}

function fieldMatches(f: IndexedField, token: string): boolean {
  return f.norm.includes(token) || f.compact.includes(token);
}

export interface DealMatch {
  deal: Deal;
  /** Why it matched, when not obvious from what's displayed ("Contact : Jean Dupont"). */
  hint: string | null;
}

/** Contacts grouped by venue, so a deal on a venue also matches that venue's contacts. */
export function contactsByVenue(contacts: Contact[] | undefined): Map<string, Contact[]> {
  const map = new Map<string, Contact[]>();
  for (const c of contacts ?? []) {
    if (!c.venue_id) continue;
    const list = map.get(c.venue_id);
    if (list) list.push(c);
    else map.set(c.venue_id, [c]);
  }
  return map;
}

export function searchDeals(
  deals: Deal[],
  query: string,
  byVenue: Map<string, Contact[]>
): DealMatch[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return deals.map((deal) => ({ deal, hint: null }));
  // "lepetitbain" should find "Le Petit Bain", and vice versa.
  const compactQuery = tokens.join('');

  const results: DealMatch[] = [];
  for (const deal of deals) {
    const fields = dealFields(deal, deal.venue_id ? byVenue.get(deal.venue_id) ?? [] : []);
    const haystack = fields.map((f) => f.norm).join(' ');
    const compactHaystack = fields.map((f) => f.compact).join(' ');

    const allTokens = tokens.every((t) => haystack.includes(t) || compactHaystack.includes(t));
    if (!allTokens && !compactHaystack.includes(compactQuery)) continue;

    let hint: string | null = null;
    if (!tokens.every((t) => fields.some((f) => f.visible && fieldMatches(f, t)))) {
      const hidden = fields.find(
        (f) => !f.visible && (tokens.some((t) => fieldMatches(f, t)) || f.compact.includes(compactQuery))
      );
      if (hidden) hint = `${hidden.label} : ${excerpt(hidden, tokens)}`;
    }
    results.push({ deal, hint });
  }
  return results;
}

/** Short excerpt of a long field (notes) around the first matched word. */
function excerpt(f: IndexedField, tokens: string[]): string {
  const value = f.value.replace(/\s+/g, ' ').trim();
  if (value.length <= 60) return value;
  const token = tokens.find((t) => f.norm.includes(t));
  // normalizeSearch keeps the string length for latin text, so positions line up closely enough.
  const pos = token ? Math.max(0, f.norm.indexOf(token) - 20) : 0;
  return `${pos > 0 ? '…' : ''}${value.slice(pos, pos + 60).trim()}…`;
}

/** Venues / contacts matching the query, to spot existing entries that have no opportunity yet. */
export function matchesQuery(values: (string | null | undefined)[], query: string): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return false;
  const norm = values.map(normalizeSearch).join(' ');
  const compact = norm.replace(/[ .]/g, '');
  return tokens.every((t) => norm.includes(t) || compact.includes(t)) || compact.includes(tokens.join(''));
}
