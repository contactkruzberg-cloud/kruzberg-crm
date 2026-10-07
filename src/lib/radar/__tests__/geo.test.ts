import { describe, expect, it } from 'vitest';
import { distanceKm, geoPlace } from '../geo';
import type { Lead } from '../types';

const at = (city: string, country?: string) => geoPlace({ id: 'x', cat: 'booking_fr', name: 'X', city, country } as Lead);

describe('geoPlace', () => {
  it('keeps the town before details in brackets, slashes or arrondissements', () => {
    expect(at('Barberaz (Chambéry)', 'FR')).toMatchObject({ query: 'Barberaz', country: 'fr' });
    expect(at('Lyon 7e (Guillotière)', 'FR')).toMatchObject({ query: 'Lyon', key: 'lyon|FR' });
    expect(at('Lyon 1er')?.query).toBe('Lyon');
    expect(at('Marseille (6e, Cours Julien)')?.query).toBe('Marseille');
    expect(at('Bienne/Biel', 'CH')).toMatchObject({ query: 'Bienne', country: 'ch' });
    expect(at('Clermont-Ferrand')?.query).toBe('Clermont-Ferrand');
  });

  it('groups the same city whatever the details', () => {
    expect(at('Lyon 3e (Guillotière, quai Victor Augagneur)')?.key).toBe(at('Lyon')?.key);
  });

  it('maps UK to GB and ignores non-places', () => {
    expect(at('Londres (Dalston)', 'UK')?.country).toBe('gb');
    expect(at('France', 'FR')).toBeNull();
    expect(at('', 'FR')).toBeNull();
  });
});

describe('distanceKm', () => {
  it('measures Lyon → Genève and Lyon → Berlin', () => {
    const lyon = { lat: 45.764, lng: 4.8357 };
    expect(Math.round(distanceKm(lyon, { lat: 46.2044, lng: 6.1432 }))).toBeGreaterThan(105);
    expect(Math.round(distanceKm(lyon, { lat: 46.2044, lng: 6.1432 }))).toBeLessThan(118);
    expect(Math.round(distanceKm(lyon, { lat: 52.52, lng: 13.405 }))).toBeGreaterThan(900);
  });
});
