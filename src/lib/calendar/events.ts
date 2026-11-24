// Every dated thing of the CRM on one calendar: confirmed concerts, options
// (a date discussed but not confirmed), tour days and festival / tremplin
// application windows. Pure: used by the /calendrier page and the iCal feed.

import { isMonthDay } from '@/lib/application-dates';

export type CalKind = 'concert' | 'option' | 'tour' | 'deadline' | 'opening' | 'plan';

export interface CalEvent {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  kind: CalKind;
  title: string;
  sub?: string;
  /** HH:MM (set time of a tour show). */
  time?: string;
  /** Page of the CRM to open. */
  href: string;
}

export const CAL_KINDS: { key: CalKind; label: string; dot: string }[] = [
  { key: 'concert', label: 'Concerts', dot: 'hsl(var(--stage-confirme))' },
  { key: 'option', label: 'Options', dot: 'hsl(var(--stage-repondu))' },
  { key: 'tour', label: 'Tournées', dot: 'hsl(var(--primary))' },
  { key: 'deadline', label: 'Clôtures de candidature', dot: 'hsl(var(--stage-refuse))' },
  { key: 'opening', label: 'Ouvertures de candidature', dot: 'hsl(var(--stage-a-contacter))' },
  { key: 'plan', label: 'Plan de route', dot: 'hsl(280 60% 55%)' },
];

export interface CalPlan {
  projects: { id: string; title: string; target_date: string; archived_at?: string | null }[];
  steps: { id: string; project_id: string; title: string; offset_days: number; done_at: string | null }[];
}

type Named = { name: string; city?: string | null } | null | undefined;

export interface CalDeal {
  id: string;
  title?: string | null;
  stage: string;
  concert_date: string | null;
  venue?: Named;
  contact?: { name: string } | null;
}
export interface CalStop {
  id: string;
  tour_id: string;
  deal_id: string | null;
  stop_date: string;
  type: 'show' | 'day_off' | 'travel';
  city: string | null;
  set_time?: string | null;
  venue?: Named;
}
export interface CalTour {
  id: string;
  name: string;
}
export interface CalVenue {
  id: string;
  name: string;
  city?: string | null;
  application_opens?: string | null;
  application_deadline?: string | null;
  style_fit?: string | null;
}

const CONFIRMED = ['confirme', 'termine'];
const DEAD = ['refuse'];
const day = (iso: string) => iso.slice(0, 10);
const label = (d: CalDeal) => d.title?.trim() || d.venue?.name || d.contact?.name || 'Concert';

export function buildEvents(
  { deals = [], stops = [], tours = [], venues = [], plan }: { deals?: CalDeal[]; stops?: CalStop[]; tours?: CalTour[]; venues?: CalVenue[]; plan?: CalPlan },
  today = new Date(),
): CalEvent[] {
  const out: CalEvent[] = [];

  for (const d of deals) {
    if (!d.concert_date || DEAD.includes(d.stage)) continue;
    const confirmed = CONFIRMED.includes(d.stage);
    out.push({
      id: `deal-${d.id}`,
      date: day(d.concert_date),
      kind: confirmed ? 'concert' : 'option',
      title: label(d),
      sub: [d.venue?.city, confirmed ? null : 'option, pas encore confirmée'].filter(Boolean).join(' · ') || undefined,
      href: `/pipeline?deal=${d.id}`,
    });
  }

  // A tour show linked to a deal already shows as that deal's concert.
  const dealDays = new Set(deals.filter((d) => d.concert_date && !DEAD.includes(d.stage)).map((d) => d.id));
  const tourName = new Map(tours.map((t) => [t.id, t.name]));
  for (const s of stops) {
    if (s.type === 'show' && s.deal_id && dealDays.has(s.deal_id)) continue;
    const tour = tourName.get(s.tour_id) ?? 'Tournée';
    const place = s.venue?.name || s.city || '';
    out.push({
      id: `stop-${s.id}`,
      date: day(s.stop_date),
      kind: 'tour',
      title: s.type === 'show' ? place || 'Concert' : s.type === 'day_off' ? 'Jour off' : `Route${s.city ? ` → ${s.city}` : ''}`,
      sub: tour,
      time: s.type === 'show' && s.set_time ? s.set_time.slice(0, 5) : undefined,
      href: `/tours/${s.tour_id}`,
    });
  }

  // Annual windows: shown on last, this and next year so the calendar can be browsed.
  const y = today.getFullYear();
  for (const v of venues) {
    if (v.style_fit === 'no') continue;
    for (const year of [y - 1, y, y + 1]) {
      if (isMonthDay(v.application_deadline))
        out.push({ id: `deadline-${v.id}-${year}`, date: `${year}-${v.application_deadline}`, kind: 'deadline', title: v.name, sub: 'clôture des candidatures', href: '/venues' });
      if (isMonthDay(v.application_opens))
        out.push({ id: `opening-${v.id}-${year}`, date: `${year}-${v.application_opens}`, kind: 'opening', title: v.name, sub: 'ouverture des candidatures', href: '/venues' });
    }
  }

  // Plan de route: each project's day J and the steps still to do.
  if (plan) {
    const live = plan.projects.filter((p) => !p.archived_at);
    const byId = new Map(live.map((p) => [p.id, p]));
    for (const p of live) out.push({ id: `plan-${p.id}`, date: p.target_date.slice(0, 10), kind: 'plan', title: p.title, sub: 'jour J', href: '/plan' });
    for (const st of plan.steps) {
      const p = byId.get(st.project_id);
      if (!p || st.done_at || st.offset_days === 0) continue;
      const d = new Date(`${p.target_date.slice(0, 10)}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + st.offset_days);
      out.push({ id: `step-${st.id}`, date: d.toISOString().slice(0, 10), kind: 'plan', title: st.title, sub: p.title, href: '/plan' });
    }
  }

  const order: Record<CalKind, number> = { concert: 0, tour: 1, option: 2, deadline: 3, opening: 4, plan: 5 };
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------- iCal (RFC 5545)

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const compact = (iso: string) => iso.replace(/-/g, '');

/** Folds lines longer than 75 octets, as the RFC asks. */
const utf8 = new TextEncoder();
const octets = (s: string) => utf8.encode(s).length;

function fold(line: string) {
  if (octets(line) <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (octets(cur + ch) > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const ICS_PREFIX: Record<CalKind, string> = {
  concert: '🎸 ',
  option: 'Option · ',
  tour: '🚐 ',
  deadline: 'Clôture candidature · ',
  opening: 'Ouverture candidature · ',
  plan: '◆ ',
};

/** All-day events; an agenda app subscribed to the feed refreshes it on its own. */
export function toIcs(events: CalEvent[], baseUrl: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KRUZBERG//CRM//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:KRUZBERG', 'X-WR-TIMEZONE:Europe/Paris'];
  for (const e of events) {
    const next = new Date(`${e.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const desc = [e.sub, e.time ? `Set à ${e.time}` : null, `${baseUrl}${e.href}`].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@kruzberg-crm`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${compact(next.toISOString().slice(0, 10))}`,
      `SUMMARY:${esc(ICS_PREFIX[e.kind] + e.title + (e.time ? ` (${e.time})` : ''))}`,
      `DESCRIPTION:${esc(desc)}`,
      `URL:${baseUrl}${e.href}`,
      `TRANSP:${e.kind === 'concert' || e.kind === 'tour' ? 'OPAQUE' : 'TRANSPARENT'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
