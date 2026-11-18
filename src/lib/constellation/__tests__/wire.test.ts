import { describe, expect, it } from 'vitest';
import { aggregate } from '../aggregate';
import type { Band, Db, Finding } from '../types';
import { factsOf, packFindings, slimBand, unpackFindings, unslimBand } from '../wire';

const f = (bandId: string, name: string, extra: Partial<Finding> = {}): Finding => ({
  id: `${bandId}-${name}`,
  bandId,
  kind: 'salle',
  name,
  sourceUrl: `https://example.org/${bandId}/${encodeURIComponent(name)}`,
  ...extra,
});

const bands: Band[] = [
  { id: 'cust', name: 'CUST', origin: 'radar', status: 'done', addedAt: '2026-01-01', scene: 'lyon', summary: 'Long résumé', lesson: 'Leçon' },
  {
    id: 'gliitch',
    name: 'Gliitch',
    origin: 'radar',
    status: 'done',
    addedAt: '2026-01-02',
    reference: true,
    milestones: [{ year: 2022, stage: 'tremplin', title: 'Tremplin', actor: 'Ninkasi', sourceUrl: 'https://example.org/m' }],
  },
];

const findings: Finding[] = [
  f('cust', 'Le Périscope', { city: 'Lyon', country: 'France', when: '2025-03-01', detail: 'Avec Gliitch', capacity: 300 }),
  f('gliitch', 'Le Périscope', { city: 'Lyon', country: 'France', when: '2024' }),
  f('cust', 'Vedette Booking', { kind: 'tourneur', scale: 'national', website: 'https://vedette.fr' }),
  f('gliitch', 'Vedette', { kind: 'tourneur', scale: 'national', detail: 'Roster' }),
  f('cust', 'Autoproduction', { kind: 'label' }),
  f('cust', 'Le Sonic', { city: 'Lyon', when: '2099-05-04', detail: 'Date à venir' }),
];

const db: Db = { version: 1, bands, findings, overrides: { 'tourneur:vedette': { note: 'Contact' } }, watch: [], jobs: [] };

describe('constellation : données allégées de la page', () => {
  it('gives the same ranking from the packed findings as from the full ones', () => {
    const wire = JSON.parse(JSON.stringify(packFindings(findings, '2026-10-17')));
    const slim: Db = { ...db, findings: unpackFindings(wire) };
    const strip = (es: ReturnType<typeof aggregate>) => es.map(({ findings: fs, ...e }) => ({ ...e, n: fs.length }));
    expect(strip(aggregate(slim))).toEqual(strip(aggregate(db)));
  });

  it('keeps only what the ranking needs, plus context and source for upcoming dates', () => {
    const byId = new Map(unpackFindings(packFindings(findings, '2026-10-17')).map((x) => [x.id, x]));
    const [periscope, vedette, sonic] = ['cust#0', 'cust#1', 'cust#3'].map((id) => byId.get(id));
    expect(periscope).toEqual({ id: 'cust#0', bandId: 'cust', kind: 'salle', name: 'Le Périscope', city: 'Lyon', country: 'France', when: '2025-03-01', capacity: 300, sourceUrl: '' });
    expect(vedette).toMatchObject({ id: 'cust#1', kind: 'tourneur', scale: 'national', website: 'https://vedette.fr' });
    expect(sonic).toMatchObject({ id: 'cust#3', detail: 'Date à venir', sourceUrl: findings[5].sourceUrl });
  });

  it('serves context and source by the same ids, for a band or an actor', () => {
    const ids = new Map(unpackFindings(packFindings(findings)).map((x) => [`${x.bandId}|${x.name}`, x.id]));
    const ofBand = factsOf(db, (x) => x.bandId === 'gliitch');
    expect(ofBand[ids.get('gliitch|Vedette')!]).toEqual({ detail: 'Roster', sourceUrl: findings[3].sourceUrl });
    expect(Object.keys(ofBand)).toHaveLength(2);

    const vedette = new Set(aggregate(db).find((e) => e.key === 'tourneur:vedette')!.findings);
    expect(Object.keys(factsOf(db, (x) => vedette.has(x))).sort()).toEqual([ids.get('cust|Vedette Booking'), ids.get('gliitch|Vedette')].sort());
  });

  it('leaves summary, lesson and step sources to the band panel', () => {
    const [cust, gliitch] = bands.map((b) => unslimBand(JSON.parse(JSON.stringify(slimBand(b)))));
    expect(cust).not.toHaveProperty('summary');
    expect(cust).not.toHaveProperty('lesson');
    expect(gliitch.milestones).toEqual([{ year: 2022, stage: 'tremplin', title: 'Tremplin', actor: 'Ninkasi', sourceUrl: '' }]);
  });
});
