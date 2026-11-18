import { describe, expect, it } from 'vitest';
import { aggregate } from '../aggregate';
import { emergingOnly, isEstablished } from '../tier';
import type { Band, Db, Finding } from '../types';

const band = (id: string, extra: Partial<Band> = {}): Band => ({ id, name: id, origin: 'manuel', status: 'done', addedAt: '2026-10-01', ...extra });
const salle = (bandId: string, name: string): Finding => ({ id: `${bandId}-${name}`, bandId, kind: 'salle', name, sourceUrl: 'https://example.org' });

const db = (): Db => ({
  version: 1,
  bands: [band('idles'), band('ditz'), band('johnnie-carwash'), band('enola-gay', { tier: 'etabli' }), band('shame', { tier: 'emergent' })],
  findings: [
    salle('idles', 'Olympia'),
    salle('shame', 'Olympia'),
    salle('ditz', 'Le Sonic'),
    salle('johnnie-carwash', 'Le Sonic'),
    salle('enola-gay', 'Le Sonic'),
  ],
  overrides: {},
  watch: [],
  jobs: [],
});

describe('groupes émergents', () => {
  it('classe par défaut les groupes établis, et la fiche du groupe a le dernier mot', () => {
    expect(isEstablished(band('idles'))).toBe(true);
    expect(isEstablished(band('ditz'))).toBe(false);
    expect(isEstablished(band('shame', { tier: 'emergent' }))).toBe(false);
    expect(isEstablished(band('enola-gay', { tier: 'etabli' }))).toBe(true);
  });

  it('le classement émergent ne compte plus les groupes établis', () => {
    const all = aggregate(db());
    const emerging = aggregate(emergingOnly(db()));
    const count = (es: typeof all, key: string) => es.find((e) => e.key === key)?.bandIds.length ?? 0;
    expect(count(all, 'lieu:olympia')).toBe(2);
    expect(count(emerging, 'lieu:olympia')).toBe(1); // shame repassé en émergent, IDLES exclu
    expect(count(all, 'lieu:sonic')).toBe(3);
    expect(count(emerging, 'lieu:sonic')).toBe(2); // Enola Gay passé en établi
  });
});
