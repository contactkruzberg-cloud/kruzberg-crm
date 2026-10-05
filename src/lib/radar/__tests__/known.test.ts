import { describe, expect, it } from 'vitest';
import { buildKnownIndex, knownHit, markKnown, type KnownData } from '../known';
import { baseSet, live, needsCrm } from '../logic';
import type { Lead } from '../types';

const L = (over: Partial<Lead>): Lead => ({ id: 'x', cat: 'booking_fr', name: 'Le Sonic', city: 'Lyon', country: 'FR', status: 'nouveau', ...over }) as Lead;
const data: KnownData = {
  scannedAt: '2026-10-05T00:00:00Z',
  entities: [
    { kind: 'venue', id: 'v1', name: 'Le Sonic', city: 'Lyon', emails: ['prog@sonic-lyon.fr'], websites: ['https://www.sonic-lyon.fr/agenda'], path: '/venues?id=v1' },
    { kind: 'venue', id: 'v2', name: 'La Maroquinerie', city: 'Paris', emails: [], websites: ['https://www.facebook.com/maroquinerie'], path: '/venues?id=v2' },
    { kind: 'contact', id: 'c1', name: 'Paul', emails: ['paul@gmail.com'], websites: [], path: '/venues?contact=c1' },
  ],
  sent: [{ email: 'booking@lepetitbain.fr', lastAt: '2026-06-01T10:00:00Z', subject: 'KRUZBERG – date ?', count: 2 }],
};
const idx = buildKnownIndex(data);

describe('radar anti-duplicate (pipeline + sent mail)', () => {
  it('matches on email, domain, website, name + city', () => {
    expect(knownHit(L({ name: 'Autre', email: 'prog@sonic-lyon.fr' }), idx)?.source).toBe('pipeline');
    expect(knownHit(L({ name: 'Autre', email: 'contact@sonic-lyon.fr' }), idx)?.why).toContain('même domaine');
    expect(knownHit(L({ name: 'Autre', links: [{ url: 'https://sonic-lyon.fr/' }] }), idx)?.path).toBe('/venues?id=v1');
    expect(knownHit(L({ name: 'Sonic', city: 'Lyon 7e' }), idx)?.path).toBe('/venues?id=v1');
    expect(knownHit(L({ name: 'Autre', city: 'Nantes', email: 'booking@lepetitbain.fr' }), idx)?.source).toBe('sent');
    expect(knownHit(L({ name: 'Autre', city: 'Nantes', email: 'paul@gmail.com' }), idx)?.source).toBe('pipeline');
  });

  it('does not match on webmail domains, social sites, same name elsewhere', () => {
    expect(knownHit(L({ name: 'Autre', email: 'jean@gmail.com' }), idx)).toBeNull();
    expect(knownHit(L({ name: 'Autre', links: [{ url: 'https://facebook.com/maroquinerie' }] }), idx)).toBeNull();
    expect(knownHit(L({ name: 'Le Sonic', city: 'Nantes' }), idx)).toBeNull();
  });

  it('only booking tabs, and respects "pas un doublon" and leads already sent to the pipeline', () => {
    expect(knownHit(L({ cat: 'support', email: 'prog@sonic-lyon.fr' }), idx)).toBeNull();
    expect(knownHit(L({ knownIgnore: true }), idx)).toBeNull();
    expect(knownHit(L({ crmId: 'd1' }), idx)).toBeNull();
  });

  it('known leads leave the live tabs and go to "Déjà connues"', () => {
    const leads = markKnown([L({ id: 'a' }), L({ id: 'b', name: 'Neuf', city: 'Nantes' }), L({ id: 'c', status: 'contacté' })], data);
    expect(live(leads[0])).toBe(false);
    expect(needsCrm(leads[2])).toBe(false);
    expect(baseSet(leads, 'booking_fr', {}).map((l) => l.id)).toEqual(['b']);
    expect(baseSet(leads, 'known', {}).map((l) => l.id)).toEqual(['a', 'c']);
  });
});
