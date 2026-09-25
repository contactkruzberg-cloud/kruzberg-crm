import { STAGES, type DealStage } from '@/types/database';
import { UniqueViolationError, type ContactRow, type CrmRepo, type DealRow, type VenueRow } from './repo';
import type { AddToPipelineInput, FindOpportunityInput, UpdateStageInput } from './schemas';
import {
  countryName,
  fitScore,
  isIsoDate,
  mapVenueType,
  normalizeEmail,
  normalizeName,
  parseCapacity,
  priorityFromFit,
} from './normalize';

export const EXTERNAL_SOURCE = 'radar';
export const ENTRY_STAGE: DealStage = 'a_contacter';
/** Every note written by add_to_pipeline starts with this, so we can find the last one. */
export const RADAR_NOTE_PREFIX = '📡 Booking Radar';
const CLOSED_STAGES: DealStage[] = ['termine', 'refuse'];

/** A user-facing tool error: its message is returned to the MCP client as is. */
export class ToolError extends Error {}

export interface ServiceDeps {
  repo: CrmRepo;
  /** Public base URL of the CRM, e.g. https://kruzberg-crm.vercel.app */
  baseUrl: string;
}

type MatchedBy = 'external_id' | 'email' | 'name_city' | null;

export function dealUrl(baseUrl: string, id: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/pipeline?deal=${id}`;
}

function byMostRecent(a: DealRow, b: DealRow): number {
  return b.updated_at.localeCompare(a.updated_at);
}

function buildNote(input: AddToPipelineInput, structureName: string): string {
  const lines = [`${RADAR_NOTE_PREFIX} — ${input.external_id} (${input.category})`];
  if (input.category === 'support') lines.push(`Première partie de : ${input.name}`);
  const fields: [string, string | null | undefined][] = [
    ['Pourquoi', input.why],
    ['Action', input.action],
    ['Support', input.support],
    ['Vérifié', input.verified],
    ['Statut radar', input.radar_status],
    ['Type', input.type],
    ['Région', input.region],
    ['Jauge', input.capacity != null ? String(input.capacity) : null],
    ['Date', input.event_date && !isIsoDate(input.event_date) ? input.event_date : null],
    ['Deadline', input.deadline],
  ];
  for (const [label, value] of fields) if (value) lines.push(`${label} : ${value}`);
  if (input.emails && input.emails.length > 1) lines.push(`Emails : ${input.emails.join(', ')}`);
  for (const link of input.links ?? []) lines.push(`🔗 ${link.label || structureName} : ${link.url}`);
  return lines.join('\n');
}

export async function addToPipeline(deps: ServiceDeps, input: AddToPipelineInput) {
  const { repo } = deps;
  const emails = [...new Set((input.emails ?? []).map(normalizeEmail).filter(Boolean))];
  const structureName = input.category === 'support' && input.venue ? input.venue : input.name;
  const city = input.city?.trim() ?? '';
  const links = input.links ?? [];
  const instagram = links.find((l) => /instagram\.com/i.test(l.url))?.url ?? null;
  const website = links.find((l) => !/instagram\.com|facebook\.com/i.test(l.url))?.url ?? null;

  const [venues, contacts, deals] = await Promise.all([repo.listVenues(), repo.listContacts(), repo.listDeals()]);

  let matchedBy: MatchedBy = null;
  let venue: VenueRow | undefined;
  let contact: ContactRow | undefined;

  // 1. external_id
  let deal = deals.find((d) => d.external_source === EXTERNAL_SOURCE && d.external_id === input.external_id);
  if (deal) {
    matchedBy = 'external_id';
    venue = venues.find((v) => v.id === deal!.venue_id);
    contact = contacts.find((c) => c.id === deal!.contact_id);
  } else {
    // 2. email (contact first, then venue)
    if (emails.length) {
      contact = contacts.find((c) => emails.includes(normalizeEmail(c.email)));
      venue =
        (contact?.venue_id ? venues.find((v) => v.id === contact!.venue_id) : undefined) ??
        venues.find((v) => emails.includes(normalizeEmail(v.email)));
      if (venue || contact) matchedBy = 'email';
    }
    // 3. normalized name + city
    if (!venue) {
      const name = normalizeName(structureName);
      const nCity = normalizeName(city);
      venue = venues.find((v) => normalizeName(v.name) === name && normalizeName(v.city) === nCity);
      if (venue && !matchedBy) matchedBy = 'name_city';
    }
    // Reuse the most recent open deal of that venue, unless it already tracks another radar lead.
    if (venue) {
      deal = deals
        .filter((d) => d.venue_id === venue!.id && !CLOSED_STAGES.includes(d.stage))
        .filter((d) => !(d.external_source === EXTERNAL_SOURCE && d.external_id))
        .sort(byMostRecent)[0];
    }
  }

  // ---- Venue: create, or fill empty fields without overwriting ----
  if (!venue) {
    venue = await repo.insertVenue({
      name: structureName,
      type: mapVenueType(input.category, input.type),
      city,
      country: countryName(input.country),
      capacity: parseCapacity(input.capacity),
      email: emails[0] ?? null,
      instagram,
      website,
      fit_score: fitScore(input.fit),
    });
  } else {
    const patch: Partial<VenueRow> = {};
    if (!venue.email && emails[0]) patch.email = emails[0];
    if (!venue.website && website) patch.website = website;
    if (!venue.instagram && instagram) patch.instagram = instagram;
    if (venue.capacity == null && parseCapacity(input.capacity) != null) patch.capacity = parseCapacity(input.capacity);
    if (!venue.city && city) patch.city = city;
    if (Object.keys(patch).length) await repo.updateVenue(venue.id, patch);
  }

  // ---- Contact: match by email, then by name within the venue; else create ----
  if (!contact && emails.length) contact = contacts.find((c) => emails.includes(normalizeEmail(c.email)));
  if (!contact && input.contact_name) {
    const n = normalizeName(input.contact_name);
    contact = contacts.find((c) => c.venue_id === venue!.id && normalizeName(c.name) === n);
  }
  if (!contact && (input.contact_name || emails.length)) {
    contact = await repo.insertContact({
      venue_id: venue.id,
      name: input.contact_name || `Booking ${structureName}`,
      email: emails[0] ?? null,
      notes: emails.length > 1 ? `Autres emails : ${emails.slice(1).join(', ')}` : null,
    });
  } else if (contact) {
    const patch: Partial<ContactRow> = {};
    if (!contact.venue_id) patch.venue_id = venue.id;
    if (!contact.email && emails[0]) patch.email = emails[0];
    if (Object.keys(patch).length) await repo.updateContact(contact.id, patch);
  }

  // ---- Deal: create, or complete without overwriting ----
  const tags = ['radar', input.category, ...(input.category === 'support' ? ['1re-partie'] : [])];
  const concertDate = isIsoDate(input.event_date) ? input.event_date : null;
  let created = false;

  if (!deal) {
    try {
      deal = await repo.insertDeal({
        venue_id: venue.id,
        contact_id: contact?.id ?? null,
        stage: input.stage ?? ENTRY_STAGE,
        priority: priorityFromFit(input.fit),
        concert_date: concertDate,
        tags,
        external_source: EXTERNAL_SOURCE,
        external_id: input.external_id,
      });
      created = true;
    } catch (err) {
      // Concurrent call with the same external_id won the race: fall through to update.
      if (!(err instanceof UniqueViolationError)) throw err;
      deal = (await repo.listDeals()).find(
        (d) => d.external_source === EXTERNAL_SOURCE && d.external_id === input.external_id,
      );
      if (!deal) throw err;
      matchedBy = 'external_id';
    }
  }

  if (!created) {
    const patch: Partial<DealRow> = {};
    if (!deal.external_id) {
      patch.external_source = EXTERNAL_SOURCE;
      patch.external_id = input.external_id;
    }
    if (!deal.contact_id && contact) patch.contact_id = contact.id;
    if (!deal.concert_date && concertDate) patch.concert_date = concertDate;
    const mergedTags = [...new Set([...(deal.tags ?? []), ...tags])];
    if (mergedTags.length !== (deal.tags ?? []).length) patch.tags = mergedTags;
    if (input.stage && input.stage !== deal.stage) patch.stage = input.stage;
    if (Object.keys(patch).length) deal = await repo.updateDeal(deal.id, patch);
  }

  // ---- Note (skipped when identical to the last radar note: repeated calls stay idempotent) ----
  const note = buildNote(input, structureName);
  if ((await repo.lastActivityContent(deal.id, 'note', RADAR_NOTE_PREFIX)) !== note) {
    await repo.insertActivity({
      deal_id: deal.id,
      venue_id: venue.id,
      contact_id: deal.contact_id,
      type: 'note',
      content: note,
    });
  }

  // ---- Deadline → task (one open task per deal, date kept up to date) ----
  if (input.deadline) {
    const title = `Deadline radar : ${input.name}`;
    const existing = (await repo.listTasks(deal.id)).find((t) => t.title === title && !t.completed_at);
    if (!existing) {
      await repo.insertTask({
        deal_id: deal.id,
        venue_id: venue.id,
        title,
        description: input.action ?? null,
        due_date: input.deadline,
      });
    } else if (existing.due_date !== input.deadline) {
      await repo.updateTask(existing.id, { due_date: input.deadline });
    }
  }

  return {
    id: deal.id,
    created,
    stage: deal.stage,
    url: dealUrl(deps.baseUrl, deal.id),
    matched_by: matchedBy,
  };
}

export async function findOpportunity(deps: ServiceDeps, input: FindOpportunityInput) {
  const [venues, contacts, deals] = await Promise.all([
    deps.repo.listVenues(),
    deps.repo.listContacts(),
    deps.repo.listDeals(),
  ]);
  const venueById = new Map(venues.map((v) => [v.id, v]));
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const email = input.email ? normalizeEmail(input.email) : null;
  const name = input.name ? normalizeName(input.name) : null;

  const matches = deals.filter((d) => {
    const v = venueById.get(d.venue_id);
    const c = d.contact_id ? contactById.get(d.contact_id) : undefined;
    if (input.external_id && d.external_id !== input.external_id) return false;
    if (email) {
      const venueContacts = contacts.filter((x) => x.venue_id === d.venue_id);
      const known = [v?.email, c?.email, ...venueContacts.map((x) => x.email)].map(normalizeEmail);
      if (!known.includes(email)) return false;
    }
    if (name && !normalizeName(v?.name).includes(name) && !normalizeName(c?.name).includes(name)) return false;
    return true;
  });

  return {
    results: matches
      .sort(byMostRecent)
      .slice(0, 10)
      .map((d) => {
        const v = venueById.get(d.venue_id);
        return {
          id: d.id,
          name: v?.name ?? '(structure inconnue)',
          city: v?.city ?? '',
          stage: d.stage,
          external_id: d.external_id,
          url: dealUrl(deps.baseUrl, d.id),
        };
      }),
  };
}

export function listPipelineStages() {
  return {
    entry_stage: ENTRY_STAGE,
    stages: STAGES.map((s) => ({ id: s.key, label: s.label })),
  };
}

export async function updateStage(deps: ServiceDeps, input: UpdateStageInput) {
  const deal = (await deps.repo.listDeals()).find((d) => d.id === input.id);
  if (!deal) throw new ToolError(`Opportunité introuvable : ${input.id}`);

  const previous = deal.stage;
  const updated = previous === input.stage ? deal : await deps.repo.updateDeal(deal.id, { stage: input.stage });
  // The stage change itself is logged by the deal_stage_change_log trigger.
  if (input.note) {
    await deps.repo.insertActivity({
      deal_id: deal.id,
      venue_id: deal.venue_id,
      contact_id: deal.contact_id,
      type: 'note',
      content: input.note,
    });
  }
  return { id: deal.id, previous_stage: previous, stage: updated.stage, url: dealUrl(deps.baseUrl, deal.id) };
}
