import { describe, expect, test } from 'vitest';
import { addressesIn, buildConversations, matches, peersOf, replySubject, replyTarget, venueMatch, type EmailRow } from '../messages';

const row = (p: Partial<EmailRow>): EmailRow => ({
  id: Math.random().toString(36),
  message_id: null,
  folder: 'INBOX',
  uid: 1,
  direction: 'in',
  from_addr: '',
  from_name: null,
  to_addrs: [],
  cc_addrs: [],
  peers: [],
  peer_domains: [],
  subject: '',
  sent_at: '2026-11-01T10:00:00Z',
  body_text: '',
  full_text: null,
  in_reply_to: null,
  refs: null,
  has_attachments: false,
  seen: true,
  ...p,
});

describe('peersOf', () => {
  test('drops our own addresses, keeps non-webmail domains', () => {
    const r = peersOf({ from: 'Booking@Kruzberg.com', to: ['prog@lefarmer.fr', 'jean@gmail.com'], cc: ['greg@kruzberg.com'] }, 'kruzberg.com');
    expect(r.peers).toEqual(['prog@lefarmer.fr', 'jean@gmail.com']);
    expect(r.domains).toEqual(['lefarmer.fr']);
  });
});

describe('addressesIn', () => {
  test('several addresses in one field', () => {
    expect(addressesIn('Contact@Sonic.fr ; prog@sonic.fr')).toEqual(['contact@sonic.fr', 'prog@sonic.fr']);
  });
});

describe('venue conversations', () => {
  const venues = [
    { id: 'v1', name: 'Le Farmer', city: 'Lyon', email: 'contact@lefarmer.fr' },
    { id: 'v2', name: 'Bar Gmail', email: 'bargmail@gmail.com' },
  ];
  const contacts = [
    { id: 'c1', name: 'Julie', email: 'julie@lefarmer.fr', venue_id: 'v1' },
    { id: 'c2', name: 'Solo', email: 'solo@outlook.fr', venue_id: null },
  ];

  test('venue match: own + contacts addresses, own domain only', () => {
    expect(venueMatch(venues[0], contacts)).toEqual({ addresses: ['contact@lefarmer.fr', 'julie@lefarmer.fr'], domains: ['lefarmer.fr'] });
    expect(venueMatch(venues[1], contacts).domains).toEqual([]);
  });

  test('a new address at the venue domain joins the venue conversation', () => {
    const e = row({ peers: ['prog@lefarmer.fr'], peer_domains: ['lefarmer.fr'] });
    expect(matches(e, venueMatch(venues[0], contacts))).toBe(true);
  });

  test('grouping: venue (with its contacts), contact without venue, unknown address', () => {
    const emails = [
      row({ direction: 'out', to_addrs: ['julie@lefarmer.fr'], peers: ['julie@lefarmer.fr'], peer_domains: ['lefarmer.fr'], sent_at: '2026-11-01T10:00:00Z' }),
      row({ direction: 'in', from_addr: 'contact@lefarmer.fr', peers: ['contact@lefarmer.fr'], peer_domains: ['lefarmer.fr'], seen: false, sent_at: '2026-11-03T10:00:00Z' }),
      row({ direction: 'in', from_addr: 'solo@outlook.fr', peers: ['solo@outlook.fr'], sent_at: '2026-11-02T10:00:00Z' }),
      row({ direction: 'in', from_addr: 'x@unknown.org', from_name: 'Xavier', peers: ['x@unknown.org'], peer_domains: ['unknown.org'], sent_at: '2026-10-01T10:00:00Z' }),
    ];
    const conv = buildConversations(emails, venues, contacts);
    expect(conv.map((c) => [c.key, c.title, c.count, c.unread])).toEqual([
      ['venue:v1', 'Le Farmer', 2, 1],
      ['contact:c2', 'Solo', 1, 0],
      ['address:x@unknown.org', 'Xavier', 1, 0],
    ]);
  });
});

describe('replying', () => {
  test('subject prefixes do not pile up', () => {
    expect(replySubject('RE: Re: TR: Date en mars')).toBe('Re: Date en mars');
  });

  test('answer the sender of the last incoming message, threaded', () => {
    const t = replyTarget(
      [
        row({ direction: 'out', to_addrs: ['prog@sonic.fr'], subject: 'KRUZBERG', message_id: '<a@k>', sent_at: '2026-10-01T00:00:00Z' }),
        row({ direction: 'in', from_addr: 'Prog@Sonic.fr', subject: 'Re: KRUZBERG', message_id: '<b@s>', refs: '<a@k>', sent_at: '2026-10-02T00:00:00Z' }),
      ],
      [],
    );
    expect(t).toEqual({ to: ['prog@sonic.fr'], subject: 'Re: KRUZBERG', inReplyTo: '<b@s>', references: '<a@k> <b@s>' });
  });
});
