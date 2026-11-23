// Mail ↔ CRM: who a message is with, and which conversation it belongs to.
// Pure, shared by the sync (server) and the conversations (client).

export interface EmailRow {
  id: string;
  message_id: string | null;
  folder: string;
  uid: number | null;
  direction: 'in' | 'out';
  from_addr: string;
  from_name: string | null;
  to_addrs: string[];
  cc_addrs: string[];
  peers: string[];
  peer_domains: string[];
  subject: string;
  sent_at: string;
  body_text: string;
  full_text: string | null;
  in_reply_to: string | null;
  refs: string | null;
  has_attachments: boolean;
  seen: boolean;
}

/** Webmail providers: sharing one does not make two people the same venue. */
export const GENERIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'live.com', 'live.fr',
  'msn.com', 'icloud.com', 'me.com', 'mac.com', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'neuf.fr', 'laposte.net', 'gmx.fr',
  'gmx.com', 'gmx.de', 'gmx.net', 'web.de', 'proton.me', 'protonmail.com', 'aol.com', 'bbox.fr', 'numericable.fr', 'yandex.com',
  'mail.com', 'zoho.com', 'libero.it', 'tiscali.it', 'hotmail.co.uk', 'btinternet.com', 'skynet.be', 'telenet.be', 'bluewin.ch',
]);

export const normAddr = (a: string | null | undefined) => (a || '').trim().toLowerCase();
export const domainOf = (a: string) => {
  const i = a.lastIndexOf('@');
  return i >= 0 ? a.slice(i + 1).toLowerCase() : '';
};

/** Addresses list from a free-text field ("a@x.fr, b@y.com"). */
export function addressesIn(text: string | null | undefined): string[] {
  return [...new Set((text || '').toLowerCase().match(/[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? [])];
}

/** Everyone in the message except us; their non-generic domains. */
export function peersOf(m: { from: string; to: string[]; cc: string[] }, ownDomain: string) {
  const all = [m.from, ...m.to, ...m.cc].map(normAddr).filter((a) => a.includes('@'));
  const peers = [...new Set(all.filter((a) => domainOf(a) !== ownDomain))];
  const domains = [...new Set(peers.map(domainOf).filter((d) => d && !GENERIC_DOMAINS.has(d)))];
  return { peers, domains };
}

// ---------------------------------------------------------------- conversations

export interface VenueLike {
  id: string;
  name: string;
  city?: string | null;
  email?: string | null;
  website?: string | null;
}
export interface ContactLike {
  id: string;
  name: string;
  email?: string | null;
  venue_id?: string | null;
}

/** What a conversation is matched on. */
export interface Match {
  addresses: string[];
  domains: string[];
}

const websiteDomain = (w: string | null | undefined) => {
  const m = (w || '').toLowerCase().match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/);
  return m ? m[1] : '';
};

/** A venue's conversation: its address(es), its contacts', and its own domain (not a webmail one). */
export function venueMatch(venue: VenueLike, contacts: ContactLike[]): Match {
  const addresses = [...addressesIn(venue.email), ...contacts.filter((c) => c.venue_id === venue.id).flatMap((c) => addressesIn(c.email))];
  const domains = [...new Set([...addresses.map(domainOf), websiteDomain(venue.website)])].filter((d) => d && !GENERIC_DOMAINS.has(d));
  return { addresses: [...new Set(addresses)], domains };
}

export function contactMatch(contact: ContactLike): Match {
  return { addresses: addressesIn(contact.email), domains: [] };
}

export const mergeMatch = (...ms: Match[]): Match => ({
  addresses: [...new Set(ms.flatMap((m) => m.addresses))],
  domains: [...new Set(ms.flatMap((m) => m.domains))],
});

export function matches(e: Pick<EmailRow, 'peers' | 'peer_domains'>, m: Match): boolean {
  return e.peers.some((p) => m.addresses.includes(p)) || e.peer_domains.some((d) => m.domains.includes(d));
}

export type ConversationKind = 'venue' | 'contact' | 'address';

export interface Conversation {
  key: string;
  kind: ConversationKind;
  /** venue / contact id, or the address. */
  ref: string;
  title: string;
  subtitle: string;
  match: Match;
  last: EmailRow;
  unread: number;
  count: number;
}

/**
 * One conversation per venue (its contacts included), per contact without a
 * venue, and per unknown correspondent. Most recent first.
 */
export function buildConversations(emails: EmailRow[], venues: VenueLike[], contacts: ContactLike[]): Conversation[] {
  const byAddr = new Map<string, { kind: ConversationKind; ref: string }>();
  const byDomain = new Map<string, string>();
  const venueById = new Map(venues.map((v) => [v.id, v]));
  for (const c of contacts)
    for (const a of addressesIn(c.email)) byAddr.set(a, c.venue_id && venueById.has(c.venue_id) ? { kind: 'venue', ref: c.venue_id } : { kind: 'contact', ref: c.id });
  for (const v of venues) {
    for (const a of addressesIn(v.email)) if (!byAddr.has(a)) byAddr.set(a, { kind: 'venue', ref: v.id });
    for (const d of venueMatch(v, contacts).domains) if (!byDomain.has(d)) byDomain.set(d, v.id);
  }

  const groups = new Map<string, { kind: ConversationKind; ref: string; emails: EmailRow[] }>();
  for (const e of emails) {
    let target: { kind: ConversationKind; ref: string } | undefined;
    for (const p of e.peers) {
      target = byAddr.get(p);
      if (target) break;
    }
    if (!target)
      for (const d of e.peer_domains) {
        const v = byDomain.get(d);
        if (v) {
          target = { kind: 'venue', ref: v };
          break;
        }
      }
    if (!target) {
      const p = e.peers[0];
      if (!p) continue;
      target = { kind: 'address', ref: p };
    }
    const key = `${target.kind}:${target.ref}`;
    const g = groups.get(key) ?? { ...target, emails: [] };
    g.emails.push(e);
    groups.set(key, g);
  }

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const out: Conversation[] = [];
  for (const [key, g] of groups) {
    const sorted = g.emails.sort((a, b) => b.sent_at.localeCompare(a.sent_at));
    const last = sorted[0];
    let title = g.ref;
    let subtitle = '';
    let match: Match = { addresses: [g.ref], domains: [] };
    if (g.kind === 'venue') {
      const v = venueById.get(g.ref)!;
      title = v.name;
      subtitle = v.city || '';
      match = venueMatch(v, contacts);
    } else if (g.kind === 'contact') {
      const c = contactById.get(g.ref)!;
      title = c.name;
      subtitle = c.email || '';
      match = contactMatch(c);
    } else {
      const named = sorted.find((e) => e.direction === 'in' && normAddr(e.from_addr) === g.ref && e.from_name);
      title = named?.from_name || g.ref;
      subtitle = named ? g.ref : '';
    }
    out.push({ key, kind: g.kind, ref: g.ref, title, subtitle, match, last, count: sorted.length, unread: sorted.filter((e) => e.direction === 'in' && !e.seen).length });
  }
  return out.sort((a, b) => b.last.sent_at.localeCompare(a.last.sent_at));
}

// ---------------------------------------------------------------- replying

/** "Re: …" without piling up prefixes. */
export function replySubject(subject: string) {
  const base = subject.replace(/^\s*((re|tr|fwd?|aw)\s*:\s*)+/i, '').trim();
  return `Re: ${base || '(sans objet)'}`;
}

/** Who to answer and what to thread on, from the latest message of a conversation. */
export function replyTarget(thread: EmailRow[], fallbackTo: string[]): { to: string[]; subject: string; inReplyTo: string | null; references: string | null } {
  const last = [...thread].sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0];
  if (!last) return { to: fallbackTo, subject: '', inReplyTo: null, references: null };
  const to = last.direction === 'in' ? [normAddr(last.from_addr)] : last.to_addrs.length ? last.to_addrs : fallbackTo;
  return {
    to: [...new Set(to.filter(Boolean))],
    subject: replySubject(last.subject),
    inReplyTo: last.message_id,
    references: [last.refs, last.message_id].filter(Boolean).join(' ') || null,
  };
}
