import { describe, expect, it } from 'vitest';
import { contactsByVenue, matchesQuery, searchDeals } from '../search';
import type { Contact, Deal, Venue } from '@/types/database';

const venue = { id: 'v1', name: "L'Épicerie Moderne", city: 'Feyzin', postal_code: '69320', country: 'France', email: 'prog@epicerie.fr' } as Venue;
const contact = { id: 'c1', venue_id: 'v1', name: 'Jérôme Martin', role: 'Programmateur', email: 'jerome@epicerie.fr' } as Contact;
const deals = [
  { id: 'd1', title: null, venue_id: 'v1', contact_id: null, venue, stage: 'contacte', tags: ['salle'], notes: 'Rappeler après le festival Nuits Sonores' },
  { id: 'd2', title: 'Tremplin Rock', venue_id: null, contact_id: 'c2', contact: { id: 'c2', name: 'Anne Dupré' }, stage: 'a_contacter', tags: [] },
] as unknown as Deal[];
const byVenue = contactsByVenue([contact]);
const ids = (q: string) => searchDeals(deals, q, byVenue).map((m) => m.deal.id);

describe('searchDeals', () => {
  it('ignores accents and case', () => {
    expect(ids('epicerie')).toEqual(['d1']);
    expect(ids('DUPRE')).toEqual(['d2']);
  });
  it('matches words in any order, across fields', () => {
    expect(ids('feyzin moderne')).toEqual(['d1']);
    expect(ids('moderne lyon')).toEqual([]);
  });
  it('finds a deal through a contact of its venue', () => {
    const [m] = searchDeals(deals, 'jerome', byVenue);
    expect(m.deal.id).toBe('d1');
    expect(m.hint).toBe('Contact du lieu : Jérôme Martin (Programmateur)');
  });
  it('searches emails, postal codes and notes', () => {
    expect(ids('prog@epicerie')).toEqual(['d1']);
    expect(ids('69320')).toEqual(['d1']);
    expect(ids('nuits sonores')).toEqual(['d1']);
  });
  it('tolerates missing spaces', () => {
    expect(ids('epiceriemoderne')).toEqual(['d1']);
    expect(ids('tremplinrock')).toEqual(['d2']);
  });
  it('gives no hint when the match is already visible', () => {
    expect(searchDeals(deals, 'feyzin', byVenue)[0].hint).toBeNull();
  });
});

describe('matchesQuery', () => {
  it('matches venues without an opportunity', () => {
    expect(matchesQuery(['Le Périscope', 'Lyon'], 'periscope lyon')).toBe(true);
    expect(matchesQuery(['Le Périscope', 'Lyon'], 'paris')).toBe(false);
  });
});
