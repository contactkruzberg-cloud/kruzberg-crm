// Builds the anti-duplicate entities (known.ts) from CRM rows. Shared by the
// radar page (/api/radar/known) and the veille connector tool (radar_known_check).
import { emailsOf } from './mail-templates';
import type { KnownEntity } from './known';

type R = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

export function knownEntities(venues: R[], contacts: R[], deals: R[]): KnownEntity[] {
  const venueById = new Map(venues.map((v) => [String(v.id), v]));
  const out: KnownEntity[] = [];
  for (const v of venues) {
    out.push({ kind: 'venue', id: String(v.id), name: String(v.name ?? ''), city: s(v.city), emails: emailsOf(v.email), websites: s(v.website) ? [String(v.website)] : [], path: `/venues?id=${v.id}` });
  }
  for (const c of contacts) {
    const v = c.venue_id ? venueById.get(String(c.venue_id)) : undefined;
    out.push({ kind: 'contact', id: String(c.id), name: String(c.name ?? ''), city: s(v?.city), emails: emailsOf(c.email), websites: [], path: `/venues?contact=${c.id}` });
  }
  for (const d of deals) {
    if (!s(d.title)) continue; // deals with a venue are already covered by the venue itself
    const v = d.venue_id ? venueById.get(String(d.venue_id)) : undefined;
    out.push({ kind: 'deal', id: String(d.id), name: String(d.title), city: s(v?.city), emails: [], websites: [], path: `/pipeline?deal=${d.id}`, stage: s(d.stage) });
  }
  return out;
}
