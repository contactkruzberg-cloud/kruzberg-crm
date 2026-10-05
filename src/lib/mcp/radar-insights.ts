// Tools for the daily search (veille): anti-duplicate check against the CRM
// and booking@'s sent mail, and feedback on what happened to past leads, so
// each search is more relevant than the previous one.
import { sentRecipientsCached } from '@/lib/email/sent';
import { buildKnownIndex, knownHit, type KnownData } from '@/lib/radar/known';
import { knownEntities } from '@/lib/radar/known-source';
import type { Lead } from '@/lib/radar/types';
import { selectAll, type Row, type Store } from './store';

export interface InsightDeps {
  store: Store;
  /** Injected in tests; defaults to the cached IMAP scan of the Sent folder. */
  sent?: () => Promise<{ data: KnownData['sent']; error?: string }>;
}

const ACTIVE = { col: 'deleted_at', op: 'is_null' } as const;

export interface Candidate {
  ref?: string;
  cat?: string;
  name: string;
  city?: string;
  venue?: string;
  email?: string;
  website?: string;
}

export async function radarKnownCheck(deps: InsightDeps, args: { candidates: Candidate[] }) {
  const [venues, contacts, deals, sent] = await Promise.all([
    selectAll(deps.store, 'venues', { filters: [ACTIVE] }),
    selectAll(deps.store, 'contacts', { filters: [ACTIVE] }),
    selectAll(deps.store, 'deals', { filters: [ACTIVE] }),
    (deps.sent ?? (() => sentRecipientsCached()))(),
  ]);
  const data: KnownData = { entities: knownEntities(venues, contacts, deals), sent: sent.data, sentError: sent.error, scannedAt: new Date().toISOString() };
  const idx = buildKnownIndex(data);
  const results = args.candidates.map((c, i) => {
    // Checked as a booking lead whatever its rubric: the caller decides what a match means for it.
    const lead = { id: c.ref || `c${i}`, cat: 'booking_fr', name: c.name, city: c.city, venue: c.venue, email: c.email, links: c.website ? [{ url: c.website }] : [] } as Lead;
    const hit = knownHit(lead, idx);
    return { ref: c.ref ?? null, name: c.name, known: !!hit, source: hit?.source ?? null, why: hit?.why ?? null };
  });
  return {
    results,
    known: results.filter((r) => r.known).length,
    scanned: { crm_entities: data.entities.length, sent_addresses: data.sent.length, sent_error: data.sentError ?? null },
  };
}

// ---------------------------------------------------------------- feedback

const REPLIED = new Set(['repondu', 'a_suivre', 'confirme', 'termine']);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const inc = (o: Record<string, number>, k: string) => (o[k] = (o[k] ?? 0) + 1);

export async function radarFeedback(deps: InsightDeps) {
  const [leadRows, deals, venues, replies] = await Promise.all([
    selectAll(deps.store, 'radar_docs', { filters: [{ col: 'collection', op: 'eq', value: 'leads' }] }),
    selectAll(deps.store, 'deals', { filters: [{ col: 'external_source', op: 'eq', value: 'radar' }] }),
    selectAll(deps.store, 'venues', {}),
    selectAll(deps.store, 'activities', { filters: [{ col: 'type', op: 'eq', value: 'reply_received' }] }),
  ]);
  const leads = new Map(leadRows.map((r) => [String(r.id), (r.data ?? {}) as Row]));
  const venueById = new Map(venues.map((v) => [String(v.id), v]));
  const repliedDeals = new Set(replies.map((a) => String(a.deal_id ?? '')));

  // 1. What became of the leads sent to the pipeline.
  const byCat: Record<string, { sent: number; replied: number; confirmed: number; refused: number; waiting: number }> = {};
  const positive: Row[] = [];
  const refused: Row[] = [];
  for (const d of deals) {
    const l = leads.get(String(d.external_id)) ?? {};
    const v = d.venue_id ? venueById.get(String(d.venue_id)) : undefined;
    const cat = str(l.cat) ?? 'inconnue';
    const stage = String(d.stage ?? '');
    const replied = REPLIED.has(stage) || repliedDeals.has(String(d.id));
    const c = (byCat[cat] ??= { sent: 0, replied: 0, confirmed: 0, refused: 0, waiting: 0 });
    c.sent++;
    if (replied) c.replied++;
    if (stage === 'confirme' || stage === 'termine') c.confirmed++;
    if (stage === 'refuse') c.refused++;
    if (!replied && stage !== 'refuse') c.waiting++;
    const item = {
      radar_id: d.external_id,
      cat,
      name: str(l.name) ?? str(d.title) ?? str(v?.name),
      type: str(l.type),
      city: str(l.city) ?? str(v?.city),
      country: str(l.country),
      capacity: l.capacity ?? v?.capacity ?? null,
      stage,
      archived: d.deleted_at != null,
    };
    if (replied && stage !== 'refuse') positive.push(item);
    else if (stage === 'refuse') refused.push({ ...item, response: str(d.response)?.slice(0, 200) });
  }

  // 2. What Greg did in the radar itself.
  const byReason: Record<string, number> = {};
  const byCatReason: Record<string, Record<string, number>> = {};
  const dismissed: Row[] = [];
  const adjusted: Row[] = [];
  const stale: Record<string, number> = {};
  const fourteenDaysAgo = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  for (const [id, l] of leads) {
    const cat = str(l.cat) ?? 'inconnue';
    if (l.dismissed === true) {
      const reason = str(l.dismissReason) ?? 'Non précisé';
      inc(byReason, reason);
      inc((byCatReason[cat] ??= {}), reason);
      dismissed.push({ id, cat, name: str(l.name), type: str(l.type), city: str(l.city), country: str(l.country), reason, at: str(l.dismissedAt) });
    }
    const adj = Number(l.chanceAdj) || 0;
    if (adj) adjusted.push({ id, cat, name: str(l.name), type: str(l.type), city: str(l.city), adj });
    if (!l.dismissed && !l.crmId && (str(l.status) ?? 'nouveau') === 'nouveau' && (str(l.addedAt) ?? '9') < fourteenDaysAgo) inc(stale, cat);
  }
  dismissed.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));

  return {
    pipeline: { by_cat: byCat, positive: positive.slice(0, 60), refused: refused.slice(0, 40) },
    dismissed: { by_reason: byReason, by_cat_reason: byCatReason, recent: dismissed.slice(0, 60) },
    greg_adjustments: adjusted.slice(0, 60),
    ignored_14d_by_cat: stale,
    note:
      "positive = pistes qui ont répondu ou avancé (à imiter : mêmes types de lieux, jauges, villes, sous-genres) ; refused / dismissed = à éviter ; greg_adjustments = avis de Greg sur le réalisme (adj > 0 : plus réaliste que prévu) ; ignored_14d_by_cat = pistes « nouveau » jamais traitées depuis 14 j (rubrique peut-être moins utile ou trop fournie).",
  };
}
