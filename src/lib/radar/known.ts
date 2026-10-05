// Anti-doublon du radar : une piste « booking » (France / Europe) dont la salle,
// le contact ou l'adresse est déjà dans le pipeline, ou à qui booking@ a déjà
// écrit, ne doit plus être proposée. Données fournies par /api/radar/known.
import { emailsOf } from './mail-templates';
import type { Lead, RadarCat } from './types';

export const KNOWN_CATS: RadarCat[] = ['booking_fr', 'booking_eu'];

export interface KnownEntity {
  kind: 'venue' | 'contact' | 'deal';
  id: string;
  name: string;
  city?: string;
  emails: string[];
  websites: string[];
  path: string;
  stage?: string;
}
export interface KnownSent {
  email: string;
  lastAt: string;
  subject: string;
  count: number;
}
export interface KnownData {
  entities: KnownEntity[];
  sent: KnownSent[];
  sentError?: string;
  scannedAt: string;
}

export interface KnownHit {
  source: 'pipeline' | 'sent';
  /** Short French explanation shown on the lead. */
  why: string;
  path?: string;
}

// Webmail / ISP domains: sharing one says nothing about being the same venue.
const GENERIC = new Set(
  'gmail.com googlemail.com hotmail.com hotmail.fr outlook.com outlook.fr live.com live.fr msn.com yahoo.com yahoo.fr ymail.com icloud.com me.com mac.com aol.com orange.fr wanadoo.fr free.fr sfr.fr neuf.fr laposte.net bbox.fr numericable.fr gmx.com gmx.fr gmx.de gmx.net web.de t-online.de protonmail.com proton.me tutanota.com zoho.com mail.com yandex.com libero.it skynet.be telenet.be bluewin.ch hotmail.co.uk hotmail.it hotmail.de hotmail.es btinternet.com'.split(
    ' ',
  ),
);
// Hosts that are not a venue's own site.
const SHARED_HOSTS =
  /(^|\.)(facebook|instagram|fb|linktr|bandcamp|soundcloud|youtube|youtu|google|goo|twitter|x|tiktok|wikipedia|songkick|bandsintown|shotgun|helloasso|weezevent|billetweb|fnacspectacles|ticketmaster|seetickets|dice|eventbrite|infoconcert|allevents|wordpress|wixsite|blogspot|canalblog|over-blog|jimdo|sites|linkedin|spotify|deezer|mapy|maps|openagenda|petitfute|tripadvisor)\./i;

const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
export const nameKey = (s: unknown) =>
  strip(String(s || ''))
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(le|la|les|l|the|el|il|de|het)\s+/, '')
    .trim();
// "Lyon 7e", "Lyon (69)" → "lyon"; "Saint-Étienne" stays "saint etienne".
const cityKey = (s: unknown) => nameKey(String(s || '').split(/[(,]/)[0]).replace(/\s+\d.*$/, '');

export const domainOfEmail = (e: string) => {
  const d = e.split('@')[1]?.toLowerCase() || '';
  return d && !GENERIC.has(d) ? d : '';
};
export function hostOf(url: string) {
  try {
    const h = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '');
    return h.includes('.') && !SHARED_HOSTS.test(h + '.') ? h : '';
  } catch {
    return '';
  }
}

const KIND_LABEL: Record<KnownEntity['kind'], string> = { venue: 'Salle', contact: 'Contact', deal: 'Opportunité' };
const fmt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

export interface KnownIndex {
  email: Map<string, KnownHit>;
  domain: Map<string, KnownHit>;
  name: Map<string, { city: string; hit: KnownHit }[]>;
}

export function buildKnownIndex(data: KnownData | undefined): KnownIndex {
  const idx: KnownIndex = { email: new Map(), domain: new Map(), name: new Map() };
  if (!data) return idx;
  for (const e of data.entities) {
    const label = `${KIND_LABEL[e.kind]} « ${e.name} »${e.city ? ` (${e.city})` : ''} déjà dans le CRM`;
    for (const m of e.emails) {
      if (!idx.email.has(m)) idx.email.set(m, { source: 'pipeline', why: `${label} · ${m}`, path: e.path });
      const d = domainOfEmail(m);
      if (d && !idx.domain.has(d)) idx.domain.set(d, { source: 'pipeline', why: `${label} · même domaine @${d}`, path: e.path });
    }
    for (const w of e.websites) {
      const h = hostOf(w);
      if (h && !idx.domain.has(h)) idx.domain.set(h, { source: 'pipeline', why: `${label} · même site ${h}`, path: e.path });
    }
    const k = nameKey(e.name);
    if (k.length >= 3 && e.kind !== 'contact') {
      idx.name.set(k, [...(idx.name.get(k) ?? []), { city: cityKey(e.city), hit: { source: 'pipeline', why: label, path: e.path } }]);
    }
  }
  for (const s of data.sent) {
    const why = `Déjà écrit à ${s.email} le ${fmt(s.lastAt)}${s.subject ? ` (« ${s.subject.slice(0, 60)} »)` : ''}${s.count > 1 ? ` · ${s.count} mails` : ''}`;
    if (!idx.email.has(s.email)) idx.email.set(s.email, { source: 'sent', why });
    const d = domainOfEmail(s.email);
    if (d && !idx.domain.has(d)) idx.domain.set(d, { source: 'sent', why: `${why} · même domaine @${d}` });
  }
  return idx;
}

/** Why this booking lead is already known (pipeline or sent mail), or null. */
export function knownHit(l: Lead, idx: KnownIndex): KnownHit | null {
  if (!KNOWN_CATS.includes(l.cat) || l.crmId || l.knownIgnore) return null;
  const mails = emailsOf([l.email, l.emailGeneric, l.draftTo].join(' '));
  for (const m of mails) {
    const h = idx.email.get(m);
    if (h) return h;
  }
  for (const m of mails) {
    const d = domainOfEmail(m);
    const h = d && idx.domain.get(d);
    if (h) return h;
  }
  for (const u of [l.contactForm?.url, ...(l.links ?? []).map((x) => x?.url)]) {
    const d = u ? hostOf(u) : '';
    const h = d && idx.domain.get(d);
    if (h) return h;
  }
  const lc = cityKey(l.city);
  for (const n of new Set([nameKey(l.name), nameKey(l.venue)])) {
    if (n.length < 3) continue;
    for (const c of idx.name.get(n) ?? []) {
      // Same name and same city; a missing city only matches on a distinctive name.
      if ((lc && c.city && lc === c.city) || ((!lc || !c.city) && n.length >= 6)) return c.hit;
    }
  }
  return null;
}

export function markKnown(leads: Lead[], data: KnownData | undefined): Lead[] {
  if (!data) return leads;
  const idx = buildKnownIndex(data);
  return leads.map((l) => {
    const h = knownHit(l, idx);
    return h ? { ...l, _known: h } : l;
  });
}
