import { describe, expect, test } from 'vitest';
import { buildEvents, toIcs } from '../events';

const today = new Date('2026-11-23T10:00:00Z');

describe('buildEvents', () => {
  test('confirmed deal = concert, open deal = option, refused deal = nothing', () => {
    const ev = buildEvents(
      {
        deals: [
          { id: 'a', stage: 'confirme', concert_date: '2026-12-05', venue: { name: 'Le Farmer', city: 'Lyon' } },
          { id: 'b', stage: 'repondu', concert_date: '2026-12-10T00:00:00+00:00', title: 'Sonic' },
          { id: 'c', stage: 'refuse', concert_date: '2026-12-11' },
          { id: 'd', stage: 'contacte', concert_date: null },
        ],
      },
      today,
    );
    expect(ev.map((e) => [e.id, e.kind, e.date, e.title])).toEqual([
      ['deal-a', 'concert', '2026-12-05', 'Le Farmer'],
      ['deal-b', 'option', '2026-12-10', 'Sonic'],
    ]);
    expect(ev[0].href).toBe('/pipeline?deal=a');
  });

  test('a tour show linked to a dated deal is not shown twice; off days and travel are', () => {
    const ev = buildEvents(
      {
        deals: [{ id: 'a', stage: 'confirme', concert_date: '2027-05-02' }],
        tours: [{ id: 't', name: 'Europe 2027' }],
        stops: [
          { id: 's1', tour_id: 't', deal_id: 'a', stop_date: '2027-05-02', type: 'show', city: 'Bruxelles' },
          { id: 's2', tour_id: 't', deal_id: null, stop_date: '2027-05-03', type: 'show', city: 'Lille', set_time: '21:30:00' },
          { id: 's3', tour_id: 't', deal_id: null, stop_date: '2027-05-04', type: 'day_off', city: null },
          { id: 's4', tour_id: 't', deal_id: null, stop_date: '2027-05-05', type: 'travel', city: 'Paris' },
        ],
      },
      today,
    );
    expect(ev.map((e) => [e.id, e.title, e.time ?? null, e.sub ?? null])).toEqual([
      ['deal-a', 'Concert', null, null],
      ['stop-s2', 'Lille', '21:30', 'Europe 2027'],
      ['stop-s3', 'Jour off', null, 'Europe 2027'],
      ['stop-s4', 'Route → Paris', null, 'Europe 2027'],
    ]);
  });

  test('application windows repeat over last, this and next year, not for venues out of style', () => {
    const ev = buildEvents(
      {
        venues: [
          { id: 'v', name: 'iNOUïS', application_opens: '10-01', application_deadline: '11-12' },
          { id: 'w', name: 'Hors style', application_deadline: '03-01', style_fit: 'no' },
        ],
      },
      today,
    );
    expect(ev.filter((e) => e.kind === 'deadline').map((e) => e.date)).toEqual(['2025-11-12', '2026-11-12', '2027-11-12']);
    expect(ev.filter((e) => e.kind === 'opening')).toHaveLength(3);
    expect(ev.some((e) => e.title === 'Hors style')).toBe(false);
  });
});

describe('toIcs', () => {
  test('all-day events, escaped text, folded lines, CRLF', () => {
    const ics = toIcs(
      [{ id: 'deal-a', date: '2026-12-31', kind: 'concert', title: 'Salle; avec, virgules', sub: 'Lyon', href: '/pipeline?deal=a' }],
      'https://crm.example',
      today,
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
    expect(ics).toContain(String.raw`SUMMARY:🎸 Salle\; avec\, virgules`);
    expect(ics).toContain('UID:deal-a@kruzberg-crm');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
