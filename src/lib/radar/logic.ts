// Booking Radar logic, ported from the claude.ai artifact (same rules, typed,
// with the state passed in instead of globals).
import type { NearPlace } from './geo';
import { ASSESS } from './assess';
import { emailsOf } from './mail-templates';
import type { Lead, RadarCat, RadarMeta } from './types';

export const CATS: { id: RadarCat; label: string }[] = [
  { id: 'festivals', label: 'Festivals' },
  { id: 'tremplins', label: 'Tremplins & concours' },
  { id: 'booking_fr', label: 'Booking France' },
  { id: 'booking_eu', label: 'Booking Europe' },
  { id: 'support', label: 'Premières parties' },
  { id: 'pros', label: 'Labels · bookers · promoteurs' },
  { id: 'presse', label: 'Presse' },
];
export const CATL: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.id, c.label]));
export const STATUSES = ['nouveau', 'à contacter', 'contacté', 'relancé', 'en discussion', 'booké', 'refusé'] as const;
export const REASONS = ['Pas le style', 'Trop gros', 'Trop loin', 'Payant', 'Déjà fait', 'Info fausse'];
export const ADV = ['contacté', 'relancé', 'en discussion', 'booké', 'refusé'];
export const STATUS_TO_STAGE: Record<string, string> = {
  contacté: 'contacte',
  relancé: 'relance',
  'en discussion': 'a_suivre',
  booké: 'confirme',
  refusé: 'refuse',
};
export const STAGE_LABEL: Record<string, string> = {
  a_contacter: 'À contacter',
  contacte: 'Contacté',
  relance: 'Relancé',
  repondu: 'Répondu',
  a_suivre: 'À suivre',
  confirme: 'Confirmé',
  termine: 'Terminé',
  refuse: 'Refusé',
};
const AURA =
  /lyon|villeurbanne|feyzin|bron|vénissieux|venissieux|saint-étienne|saint-etienne|grenoble|clermont|annecy|chambéry|chambery|valence|bourgoin|vienne|pérouges|perouges|roanne|villefontaine|aix-les-bains|montluçon|vichy|le puy|aurillac|échirolles|fontaine|oullins|décines|caluire|givors|mâcon|thonon|annemasse|ambérieu|bourg-en-bresse/i;

export const today = () => new Date().toISOString().slice(0, 10);
export function daysTo(d?: string | null): number | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return null;
  return Math.round((Date.parse(d.slice(0, 10)) - Date.parse(today())) / 864e5);
}
export function fmtDate(d?: string | null): string {
  if (!d) return '';
  const x = new Date(d.slice(0, 10));
  if (Number.isNaN(x.getTime())) return d;
  return x.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}
export type Zone = 'Lyon / AURA' | 'France' | 'Europe';
export function zone(l: Lead): Zone {
  const c = String(l.country || 'FR').toUpperCase();
  if (c !== 'FR') return 'Europe';
  if (/AURA/i.test(l.region || '') || AURA.test(l.city || '')) return 'Lyon / AURA';
  return 'France';
}
export const isNew = (l: Lead, meta: RadarMeta) => !!meta.date && (l.addedAt || '') >= meta.date;
export const hasDraft = (l: Lead) => !!(l.draftState || l.draftAt);
export const inCrm = (l: Lead) => !!l.crmId;
/** Booking lead already in the CRM or already written to from booking@ (see known.ts). */
export const isKnown = (l: Lead) => !inCrm(l) && !l.dismissed && !expired(l) && !isClosed(l) && !!l._known;
export function expired(l: Lead) {
  if (l.cat === 'support') {
    const e = daysTo(l.eventDate);
    return e !== null && e < 0;
  }
  if (l.cat === 'tremplins') {
    const d = daysTo(l.deadline);
    return d !== null && d < 0;
  }
  return false;
}
// Wording the search uses when it finds a date is no longer open, in case it forgot to set `closed`.
const CLOSED_TEXT =
  /ne (?:pas|plus) (?:démarcher|candidater)|date ferm[ée]e|plateau boucl[ée]|date annul[ée]e|1re partie (?:de tournée )?déjà attribuée/i;
/** Why the opportunity is closed (support slot taken, line-up full, date cancelled), or null if still open. */
export function closedReason(l: Lead): string | null {
  if (l.closed) return l.closedReason || 'Date fermée';
  if (l.closed === false) return null; // Greg reopened it
  for (const t of [l.action, l.contactRoute, l.support]) {
    const m = typeof t === 'string' ? CLOSED_TEXT.exec(t) : null;
    if (m) {
      // The sentence containing the match, e.g. "Date fermée (Choir Boy en 1re partie sur toute la tournée…)".
      const start = Math.max(t!.lastIndexOf('. ', m.index) + 1, t!.lastIndexOf(' ; ', m.index) + 1, 0);
      const end = t!.slice(m.index).search(/(?:\. | ; |$)/);
      return t!.slice(start, m.index + end).trim().replace(/[.;,]$/, '');
    }
  }
  return null;
}
export const isClosed = (l: Lead) => !!closedReason(l);
export const live = (l: Lead) => !inCrm(l) && !l.dismissed && !expired(l) && !isClosed(l) && !l._known;
export const archived = (l: Lead) => !inCrm(l) && (!!l.dismissed || expired(l) || isClosed(l));
export const needsCrm = (l: Lead) => !inCrm(l) && !l.dismissed && !isClosed(l) && !l._known && ADV.includes(l.status || '');
export const norm = (s: unknown) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(le|la|les|l|the)\s+/, '')
    .trim();
export const normCity = (s: unknown) => norm(String(s || '').split(/[\s(,]/)[0]);
export const okUrl = (u?: string) => /^https:\/\/[^\s"'<>]+$/.test(u || '');

// ---------------------------------------------------------------- index (duplicates, used addresses, cities)

export interface RadarIndex {
  dup: Map<string, Lead[]>;
  addr: Map<string, Lead[]>;
  city: Map<string, { label: string; items: Lead[] }>;
}
export function buildIndex(leads: Lead[]): RadarIndex {
  const dup = new Map<string, Lead[]>();
  const addr = new Map<string, Lead[]>();
  const city = new Map<string, { label: string; items: Lead[] }>();
  for (const l of leads) {
    const k = norm(l.name) + '|' + normCity(l.city);
    dup.set(k, [...(dup.get(k) ?? []), l]);
    if (hasDraft(l) || inCrm(l) || ADV.includes(l.status || '')) {
      for (const a of emailsOf((l.draftTo || '') + ' ' + (l.email || ''))) addr.set(a, [...(addr.get(a) ?? []), l]);
    }
    if (live(l) && l.city) {
      const c = normCity(l.city);
      if (c) {
        if (!city.has(c)) city.set(c, { label: String(l.city).split(/[(,]/)[0].trim(), items: [] });
        city.get(c)!.items.push(l);
      }
    }
  }
  return { dup, addr, city };
}
export const dupsOf = (idx: RadarIndex, l: Lead) => (idx.dup.get(norm(l.name) + '|' + normCity(l.city)) || []).filter((x) => x.id !== l.id);
export function addrUsers(idx: RadarIndex, addrs: string[], exceptId: string) {
  const out = new Map<string, Lead>();
  for (const a of addrs) for (const x of idx.addr.get(a) || []) if (x.id !== exceptId) out.set(x.id, x);
  return [...out.values()];
}

// ---------------------------------------------------------------- chances

const CORE = /post-?punk|cold[ -]?wave|dark ?wave|noise|goth|new[ -]?wave|shoegaze|kraut|no[ -]?wave|industri|minimal wave/i;
const ADJ = /rock|ind[ié]e?\b|indie|punk|garage|alternati|psych|grunge|stoner|emo\b|hardcore|lo-?fi|underground/i;
const OFF = /jazz|chanson|[ée]lectro|techno|hip-?hop|\brap\b|reggae|folk|classique|world music|m[ée]tal|vari[ée]t/i;
const BIGMEDIA = /inrocks|inrockuptibles|rolling stone|t[ée]l[ée]rama|france inter|lib[ée]ration|radio nova|rock ?& ?folk|magic ?r?pc|nme\b|pitchfork|the quietus|stereogum|guardian|kexp|bbc|fip\b|le monde/i;
const BIGV = /transbordeur|radiant|z[ée]nith|\barena\b|olympia|bataclan|la cigale|trianon|[ée]lys[ée]e montmartre|halle tony/i;
function capMin(l: Lead) {
  const m = String(l.capacity ?? '').match(/\d{2,5}/g);
  return m ? Math.min(...m.map(Number)) : null;
}
function heurLevel(l: Lead, txt: string) {
  const c = capMin(l);
  const t = txt.toLowerCase();
  switch (l.cat) {
    case 'tremplins':
      return /payant|national|international/.test(t) ? 2 : 3;
    case 'presse':
      return BIGMEDIA.test(txt) ? 2 : /radio|webzine|blog|fanzine|associ|podcast|locale?/.test(t) ? 4 : 3;
    case 'pros':
      return /label/.test(t) ? (/diy|associ|collectif|petit|ind[ée]pendant/.test(t) ? 3 : 2) : /collectif|promot|asso/.test(t) ? 3 : 2;
    case 'festivals':
      return /d[ée]couverte|tremplin|[ée]mergen|gratuit|associ|petit|diy|local/.test(t) ? 3 : 2;
    case 'support':
      if (BIGV.test(txt)) return 1;
      return c == null ? 2 : c <= 300 ? 3 : c <= 700 ? 2 : 1;
  }
  if (c != null) return c <= 150 ? 4 : c <= 300 ? (/bar|caf[ée]|cave|diy|squat|associ/.test(t) ? 4 : 3) : c <= 500 ? 3 : c <= 900 ? 2 : 1;
  if (/bar|caf[ée]|cave|diy|squat|associ|tiers-lieu|pub\b|brasserie/.test(t)) return 4;
  if (/smac|sc[èe]ne nationale|z[ée]nith|arena|palais/.test(t)) return 2;
  return 3;
}
const LV_TXT: Record<number, string> = { 4: 'à portée', 3: 'atteignable', 2: 'difficile', 1: "hors d'atteinte" };
const ST_TXT: Record<number, string> = { 3: 'cœur post-punk / cold', 2: 'compatible rock indé / punk', 1: 'peu compatible' };

export interface Chance {
  sc: number;
  lv: number;
  st: number;
  why: string;
  src: string;
  adj: number;
  parts: [string, number][];
}
const chanceCache = new WeakMap<Lead, Chance>();
/** Real chances for KRUZBERG: realism × style (up to 70) + contact (12) + proximity (12) + Greg's adjustment. */
export function chance(l: Lead): Chance {
  const cached = chanceCache.get(l);
  if (cached) return cached;
  const a = ASSESS[l.id];
  const txt = [l.type, l.why, l.support, l.name, l.org, l.venue].join(' ');
  let lv = (l.level as number) || (a && a[0]);
  let st = (l.style as number) || (a && a[1]);
  let why = (l.levelWhy as string) || (a && a[2]) || '';
  const src = lv ? 'évaluation Claude' : 'estimation automatique';
  if (!lv) {
    lv = heurLevel(l, txt);
    const c = capMin(l);
    why = (c != null ? `Jauge ${c} pl.` : 'Jauge inconnue') + ' · ' + (l.type || CATL[l.cat] || '');
  }
  if (!st) st = CORE.test(txt) ? 3 : OFF.test(txt) && !ADJ.test(txt) ? 1 : ADJ.test(txt) ? 2 : Math.min(3, Math.max(1, l.fit || 2));
  if (l.decider === 'tournée (fermé)') {
    lv = 1;
    why = 'Première partie déjà fixée par la tournée';
  }
  const base = ({ 4: 70, 3: 52, 2: 30, 1: 8 } as Record<number, number>)[lv];
  const mult = ({ 3: 1, 2: 0.82, 1: 0.55 } as Record<number, number>)[st];
  const core = Math.round(base * mult);
  const Cp = emailsOf(l.email).length ? 12 : l.contactForm && okUrl(l.contactForm.url) ? 9 : l.instagram ? 4 : 0;
  const z = zone(l);
  const proFar = ['pros', 'presse', 'tremplins'].includes(l.cat);
  const Pp = proFar ? (z === 'Europe' ? 4 : 8) : z === 'Lyon / AURA' ? 12 : z === 'France' ? 7 : 2;
  const adj = Math.max(-30, Math.min(30, Number(l.chanceAdj) || 0));
  const sc = Math.max(0, Math.min(100, core + Cp + Pp + adj));
  const pct = (v: number, m: number) => Math.round((v / m) * 100);
  const res: Chance = {
    sc,
    lv,
    st,
    why,
    src,
    adj,
    parts: [
      ['Réalisme (' + LV_TXT[lv] + ')', pct(base, 70)],
      ['Style (' + ST_TXT[st] + ')', Math.round(mult * 100)],
      ['Contact', pct(Cp, 12)],
      ['Proximité (' + z + ')', pct(Pp, proFar ? 8 : 12)],
    ],
  };
  chanceCache.set(l, res);
  return res;
}
export type Tier = 'hi' | 'mid' | 'lo' | 'vlo';
export const TIER = (sc: number): [string, Tier] => (sc >= 75 ? ['Fortes', 'hi'] : sc >= 58 ? ['Réelles', 'mid'] : sc >= 40 ? ['Faibles', 'lo'] : ['Très faibles', 'vlo']);

// ---------------------------------------------------------------- key dates, to-do, priority

export interface KeyDate {
  d: string;
  kind: string;
  n: number;
}
export function keyDate(l: Lead): KeyDate | null {
  const dl = daysTo(l.deadline);
  if (dl !== null && dl >= 0) return { d: l.deadline!, kind: 'Candidater avant', n: dl };
  const ev = daysTo(l.eventDate);
  if (ev !== null && ev >= 0) return { d: l.eventDate!, kind: 'Concert', n: ev };
  if (dl !== null) return { d: l.deadline!, kind: 'Clos', n: dl };
  return null;
}
export const prio = (l: Lead, meta: RadarMeta) => {
  const k = keyDate(l);
  return chance(l).sc + (k && k.n >= 0 && k.n <= 30 ? 8 : 0) + (isNew(l, meta) ? 4 : 0);
};

export interface Todo {
  sc: number;
  why: { t: string; soft?: boolean }[];
}
export function todoOf(l: Lead, meta: RadarMeta): Todo | null {
  if (!live(l) && !needsCrm(l)) return null;
  const st = l.status || 'nouveau';
  const r: { t: string; soft?: boolean }[] = [];
  let sc = 0;
  const add = (s: number, t: string, soft?: boolean) => {
    r.push({ t, soft });
    sc = Math.max(sc, s);
  };
  if (needsCrm(l)) add(96, `Statut « ${st} » mais pas encore dans le pipeline : envoie-la`);
  if (l.draftAt && l.draftState !== 'pending' && !ADV.includes(st)) {
    const n = -(daysTo(l.draftAt) || 0);
    add(n >= 2 ? 90 : 72, n >= 2 ? `Brouillon créé il y a ${n} j : envoyé ? Marque-le contacté` : 'Brouillon prêt dans Mail : envoie-le, puis « Marquer contacté »');
  }
  if (l.draftState === 'pending') add(40, 'Brouillon en file : demande à Claude « crée les brouillons en attente »', true);
  const dl = daysTo(l.deadline);
  if (dl !== null && dl >= 0 && dl <= 14 && !ADV.includes(st)) add(100 - dl, `Candidature avant le ${fmtDate(l.deadline)} (J-${dl})`);
  if (l.cat === 'support') {
    const ev = daysTo(l.eventDate);
    if (ev !== null && ev >= 0 && ev <= 45 && !ADV.includes(st) && !hasDraft(l)) add(93 - ev, `Concert dans ${ev} j : demande la 1re partie maintenant`);
  }
  if (st === 'nouveau' && isNew(l, meta)) add(50 + (l.fit || 1) * 4, 'Nouvelle piste de la veille : à trier', true);
  if (chance(l).sc >= 80 && st === 'à contacter' && !hasDraft(l) && (emailsOf(l.email).length || (l.contactForm && l.contactForm.url))) {
    add(60, `Chances fortes (${chance(l).sc}/100) et contact direct : écris-leur`, true);
  }
  return r.length ? { sc, why: r } : null;
}

// ---------------------------------------------------------------- tabs, filters, sort

export type TabId = 'todo' | 'all' | RadarCat | 'drafts' | 'crm' | 'known' | 'trash';
export const TABS: { id: TabId; label: string }[] = [
  { id: 'todo', label: 'À faire' },
  { id: 'all', label: 'Toutes' },
  ...CATS,
  { id: 'drafts', label: 'Brouillons' },
  { id: 'crm', label: 'Dans le pipeline' },
  { id: 'known', label: 'Déjà connues' },
  { id: 'trash', label: 'Archives' },
];
export function baseSet(leads: Lead[], tab: TabId, meta: RadarMeta) {
  if (tab === 'todo') return leads.filter((l) => todoOf(l, meta));
  if (tab === 'crm') return leads.filter(inCrm);
  if (tab === 'known') return leads.filter(isKnown);
  if (tab === 'trash') return leads.filter(archived);
  if (tab === 'drafts') return leads.filter((l) => !inCrm(l) && !l.dismissed && !l._known && hasDraft(l));
  if (tab === 'all') return leads.filter(live);
  return leads.filter((l) => live(l) && l.cat === tab);
}

export interface RadarFilters {
  q: string;
  zone: '' | Zone;
  city: string;
  minChance: number;
  status: string;
  /** 'distance' needs `near` (the sort itself is done in the view, which has the city coordinates). */
  sort: 'smart' | 'chance' | 'deadline' | 'added' | 'name' | 'distance';
  onlyNew: boolean;
  withEmail: boolean;
  fresh: boolean;
  /** "Autour de" filter: only leads within `radius` km of this place. */
  near?: NearPlace | null;
  radius?: number;
}
export const DEFAULT_FILTERS: RadarFilters = { q: '', zone: '', city: '', minChance: 0, status: '', sort: 'smart', onlyNew: false, withEmail: false, fresh: false, near: null, radius: 100 };

export function filterLeads(leads: Lead[], tab: TabId, f: RadarFilters, meta: RadarMeta, idx: RadarIndex): Lead[] {
  let s = baseSet(leads, tab, meta);
  const q = f.q.trim().toLowerCase();
  if (q) {
    const qn = norm(q);
    s = s.filter((l) => {
      const h = [l.name, l.city, l.country, l.contact, l.email, l.org, l.venue, l.type, l.why, l.notes, l.support].join(' ');
      return h.toLowerCase().includes(q) || norm(h).includes(qn);
    });
  }
  if (f.city) s = s.filter((l) => normCity(l.city) === f.city);
  if (f.zone) s = s.filter((l) => zone(l) === f.zone);
  if (f.minChance) s = s.filter((l) => chance(l).sc >= f.minChance);
  if (f.status) s = s.filter((l) => (l.status || 'nouveau') === f.status);
  if (f.onlyNew) s = s.filter((l) => isNew(l, meta));
  if (f.withEmail) s = s.filter((l) => l.email);
  if (f.fresh) {
    s = s.filter((l) => {
      const a = emailsOf(l.email);
      return a.length && !hasDraft(l) && !inCrm(l) && !ADV.includes(l.status || '') && !addrUsers(idx, a, l.id).length;
    });
  }
  const kd = (l: Lead) => {
    const k = keyDate(l);
    return k && k.n >= 0 ? k.n : 9999;
  };
  if (tab === 'todo' && f.sort === 'smart') {
    return s
      .map((l) => [l, todoOf(l, meta)!.sc] as const)
      .sort((a, b) => b[1] - a[1] || (b[0].fit || 1) - (a[0].fit || 1))
      .map((x) => x[0]);
  }
  if (tab === 'crm' && f.sort === 'smart') return s.sort((a, b) => String(b.crmAt || '').localeCompare(String(a.crmAt || '')) || a.name.localeCompare(b.name));
  if (tab === 'drafts') {
    return s.sort(
      (a, b) =>
        -(Number(a.draftState === 'pending') - Number(b.draftState === 'pending')) ||
        String(b.draftAt || '').localeCompare(String(a.draftAt || '')) ||
        a.name.localeCompare(b.name),
    );
  }
  const cmp: Record<RadarFilters['sort'], (a: Lead, b: Lead) => number> = {
    smart: (a, b) => prio(b, meta) - prio(a, meta) || kd(a) - kd(b) || a.name.localeCompare(b.name),
    chance: (a, b) => chance(b).sc - chance(a).sc || a.name.localeCompare(b.name),
    deadline: (a, b) => kd(a) - kd(b) || (b.fit || 1) - (a.fit || 1),
    added: (a, b) => (b.addedAt || '').localeCompare(a.addedAt || '') || (b.fit || 1) - (a.fit || 1),
    name: (a, b) => a.name.localeCompare(b.name),
    distance: (a, b) => prio(b, meta) - prio(a, meta) || kd(a) - kd(b) || a.name.localeCompare(b.name),
  };
  return s.sort(cmp[f.sort]);
}

/** Leads still to triage ("nouveau", live, no draft), best first. */
export function triQueue(leads: Lead[], meta: RadarMeta, skip: Set<string>) {
  const kd = (l: Lead) => {
    const k = keyDate(l);
    return k && k.n >= 0 ? k.n : 9999;
  };
  return leads
    .filter((l) => live(l) && (l.status || 'nouveau') === 'nouveau' && !hasDraft(l) && !skip.has(l.id))
    .sort((a, b) => prio(b, meta) - prio(a, meta) || kd(a) - kd(b) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- CRM hand-off (add_to_pipeline input)

const cut = (s: unknown, n: number) => {
  const t = String(s ?? '').trim();
  return t ? t.slice(0, n) : undefined;
};
export function crmInput(l: Lead): Record<string, unknown> {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  let c = String(l.country || 'FR').toUpperCase();
  if (c === 'UK') c = 'GB';
  const cap = l.capacity != null && String(l.capacity).trim() ? String(l.capacity).slice(0, 50) : undefined;
  const links = (l.links || [])
    .filter((x) => x && /^https?:\/\/\S+$/.test(x.url || ''))
    .slice(0, 20)
    .map((x) => ({ label: String(x.label || 'Lien').slice(0, 100), url: x.url }));
  const o: Record<string, unknown> = {
    external_id: l.id,
    category: l.cat,
    name: cut(l.name, 200) || l.id,
    type: cut(l.type, 100),
    venue: cut(l.venue, 200),
    city: cut(l.city, 100),
    country: /^[A-Z]{2}$/.test(c) ? c : undefined,
    region: cut(l.region, 100),
    capacity: cap,
    contact_name: cut(l.contact, 200),
    emails: emailsOf(l.email).slice(0, 10),
    links,
    event_date: l.eventDate ? String(l.eventDate).slice(0, 100) : undefined,
    deadline: iso.test(l.deadline || '') ? l.deadline : undefined,
    fit: [1, 2, 3].includes(l.fit as number) ? l.fit : undefined,
    why: cut(l.why, 2000),
    action: cut(l.action, 2000),
    support: cut(l.support, 2000),
    verified: cut(l.verified, 500),
    radar_status: cut(l.status || 'nouveau', 100),
    stage: STATUS_TO_STAGE[l.status || ''],
  };
  if (l.crmId) delete o.stage; // resync: never move an advanced CRM stage back
  if (!(o.emails as string[]).length) delete o.emails;
  if (!(o.links as unknown[]).length) delete o.links;
  Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]);
  return o;
}
