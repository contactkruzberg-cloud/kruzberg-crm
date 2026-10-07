import { describe, expect, it } from 'vitest';
import { buildRelancePrompt, relanceCount } from '../prompt';
import type { Deal } from '@/types/database';

const deal = (over: Partial<Deal> = {}): Deal =>
  ({
    id: 'd1', user_id: 'u', title: null, venue_id: 'v', contact_id: null, stage: 'contacte', priority: 'medium',
    first_contact_at: '2026-09-20T10:00:00Z', last_message_at: '2026-09-20T10:00:00Z', last_relance_method: 'email',
    next_relance_at: null, response: null, concert_date: '2026-11-21', fee: null, show_on_website: false, notes: null,
    tags: [], created_at: '', updated_at: '', ...over,
  }) as Deal;

describe('relance prompt', () => {
  it('counts follow-ups from the history', () => {
    expect(relanceCount({ deal: deal(), activities: [] })).toBe(0);
    expect(relanceCount({ deal: deal({ stage: 'relance' }), activities: [] })).toBe(1);
    const acts = [{ type: 'relance', content: '', created_at: '', channel: null }, { type: 'relance', content: '', created_at: '', channel: null }] as never;
    expect(relanceCount({ deal: deal(), activities: acts })).toBe(2);
  });

  it('includes the first email, the venue and the concert date, never the status changes', () => {
    const p = buildRelancePrompt({
      deal: deal(),
      venue: { name: 'Rock’n Eat', type: 'bar', city: 'Lyon', country: 'France', capacity: 200 } as never,
      contact: { name: 'Julie Martin', role: 'programmatrice', tone: 'tu' } as never,
      activities: [
        { type: 'status_change', channel: null, content: 'Stage changed from a_contacter to contacte', created_at: '2026-09-20T10:00:00Z' },
        { type: 'email_sent', channel: 'email', content: 'À : prog@x.fr', created_at: '2026-09-20T10:00:00Z' },
      ],
      lastSent: { subject: '1re partie Corpus Delicti 21/11 – KRUZBERG', date: '2026-09-20T10:00:00Z', to: 'booking@rockneat.com', text: 'Bonjour, …' },
      lead: { cat: 'support', name: 'Corpus Delicti', eventDate: '2026-11-21' },
      today: '2026-10-07',
    });
    expect(p).toContain('Objet : 1re partie Corpus Delicti 21/11 – KRUZBERG');
    expect(p).toContain('Rock’n Eat (bar), Lyon, France, 200 places');
    expect(p).toContain('Julie Martin, programmatrice · ton : tu');
    expect(p).toContain('Date de concert visée : 2026-11-21');
    expect(p).toContain('relance n° 1');
    expect(p).not.toContain('Stage changed');
  });
});
