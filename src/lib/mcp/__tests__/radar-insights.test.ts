import { beforeEach, describe, expect, it } from 'vitest';
import { radarFeedback, radarKnownCheck } from '../radar-insights';
import { createMemoryStore } from './memory-store';

let mem: ReturnType<typeof createMemoryStore>;
const sent = async () => ({ data: [{ email: 'prog@lepetitbain.fr', lastAt: '2026-06-01T10:00:00Z', subject: 'Date ?', count: 1 }] });

beforeEach(async () => {
  mem = createMemoryStore();
  const s = mem.store;
  const sonic = await s.insert('venues', { name: 'Le Sonic', city: 'Lyon', email: 'prog@sonic-lyon.fr', type: 'salle' });
  const gone = await s.insert('venues', { name: 'Salle Archivée', city: 'Lyon', email: 'x@archivee.fr', type: 'salle' });
  await s.update('venues', [{ col: 'id', op: 'eq', value: gone.id as string }], { deleted_at: '2026-09-01T00:00:00Z' });
  const d1 = await s.insert('deals', { venue_id: sonic.id, stage: 'repondu', external_source: 'radar', external_id: 'bf-1' });
  await s.insert('deals', { venue_id: sonic.id, stage: 'refuse', external_source: 'radar', external_id: 'bf-2', response: 'complet' });
  await s.insert('activities', { deal_id: d1.id, type: 'reply_received', content: 'ok' });
  await s.insert('radar_docs', { collection: 'leads', id: 'bf-1', data: { cat: 'booking_fr', name: 'Le Sonic', type: 'péniche', city: 'Lyon', crmId: d1.id } });
  await s.insert('radar_docs', { collection: 'leads', id: 'bf-2', data: { cat: 'booking_fr', name: 'Autre', city: 'Lyon' } });
  await s.insert('radar_docs', { collection: 'leads', id: 'bf-3', data: { cat: 'booking_fr', name: 'Trop Gros', dismissed: true, dismissReason: 'Trop gros', dismissedAt: '2026-10-01' } });
  await s.insert('radar_docs', { collection: 'leads', id: 'ps-1', data: { cat: 'presse', name: 'Zine', status: 'nouveau', addedAt: '2026-09-01', chanceAdj: -10 } });
});

describe('veille tools', () => {
  it('radar_known_check: CRM (active only) and sent mail', async () => {
    const r = await radarKnownCheck({ store: mem.store, sent }, {
      candidates: [
        { ref: 'a', name: 'Sonic', city: 'Lyon 5e' },
        { ref: 'b', name: 'Le Petit Bain', city: 'Paris', email: 'booking@lepetitbain.fr' },
        { ref: 'c', name: 'Salle Archivée', city: 'Lyon', email: 'x@archivee.fr' },
        { ref: 'd', name: 'Nouveau Bar', city: 'Grenoble', email: 'prog@gmail.com' },
      ],
    });
    expect(r.results.map((x) => [x.ref, x.known, x.source])).toEqual([
      ['a', true, 'pipeline'],
      ['b', true, 'sent'],
      ['c', false, null],
      ['d', false, null],
    ]);
    expect(r.scanned).toMatchObject({ sent_addresses: 1, sent_error: null });
  });

  it('radar_feedback: outcomes by rubric, dismiss reasons, adjustments, ignored leads', async () => {
    const f = await radarFeedback({ store: mem.store });
    expect(f.pipeline.by_cat.booking_fr).toEqual({ sent: 2, replied: 1, confirmed: 0, refused: 1, waiting: 0 });
    expect(f.pipeline.positive[0]).toMatchObject({ name: 'Le Sonic', type: 'péniche', stage: 'repondu' });
    expect(f.pipeline.refused[0]).toMatchObject({ radar_id: 'bf-2', response: 'complet' });
    expect(f.dismissed.by_cat_reason).toEqual({ booking_fr: { 'Trop gros': 1 } });
    expect(f.greg_adjustments).toEqual([expect.objectContaining({ id: 'ps-1', adj: -10 })]);
    expect(f.ignored_14d_by_cat).toEqual({ presse: 1 });
  });
});
