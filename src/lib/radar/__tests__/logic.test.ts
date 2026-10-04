import { describe, expect, it } from 'vitest';
import { buildIndex, chance, crmInput, DEFAULT_FILTERS, dupsOf, filterLeads, keyDate, todoOf, triQueue, zone } from '../logic';
import { buildMail, kindOf, langOf } from '../mail-templates';
import type { Lead } from '../types';

const d = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const L = (over: Partial<Lead>): Lead => ({ id: 'x', cat: 'booking_fr', name: 'Le Sonic', city: 'Lyon', country: 'FR', fit: 2, status: 'nouveau', dismissed: false, addedAt: d(0), ...over }) as Lead;
const meta = { date: d(0) };

describe('radar logic (ported from the artifact)', () => {
  it('chances: Claude evaluation from ASSESS, contact and proximity points, Greg adjustment', () => {
    const be001 = chance(L({ id: 'be-001', country: 'BE', city: 'Bruxelles', email: 'prog@x.be' }));
    expect(be001).toMatchObject({ lv: 3, st: 2, src: 'évaluation Claude' });
    expect(be001.sc).toBe(Math.round(52 * 0.82) + 12 + 2);
    const bar = chance(L({ id: 'n1', type: 'bar-concert post-punk', capacity: 120, email: 'booking@sonic.fr' }));
    expect(bar.sc).toBe(70 + 12 + 12); // à portée, cœur post-punk, email, Lyon
    expect(chance(L({ id: 'n2', type: 'bar-concert post-punk', capacity: 120, email: 'booking@sonic.fr', chanceAdj: -10 })).sc).toBe(84);
    expect(chance(L({ id: 'n3', cat: 'support', decider: 'tournée (fermé)' })).lv).toBe(1);
  });

  it('zones and key dates', () => {
    expect(zone(L({ city: 'Villeurbanne' }))).toBe('Lyon / AURA');
    expect(zone(L({ city: 'Nantes' }))).toBe('France');
    expect(zone(L({ country: 'CH', city: 'Genève' }))).toBe('Europe');
    expect(keyDate(L({ deadline: d(5), eventDate: d(30) }))).toMatchObject({ kind: 'Candidater avant', n: 5 });
    expect(keyDate(L({ eventDate: d(30) }))).toMatchObject({ kind: 'Concert', n: 30 });
  });

  it('to-do reasons: contacted but not in the pipeline, close deadline, new lead', () => {
    expect(todoOf(L({ status: 'contacté' }), meta)!.why[0].t).toContain('pas encore dans le pipeline');
    expect(todoOf(L({ status: 'à contacter', deadline: d(3) }), meta)!.why[0].t).toContain('J-3');
    expect(todoOf(L({}), meta)!.why[0].t).toContain('Nouvelle piste');
    expect(todoOf(L({ crmId: 'abc' }), meta)).toBeNull();
    expect(todoOf(L({ dismissed: true }), meta)).toBeNull();
  });

  it('filters, tabs, duplicates and triage queue', () => {
    const leads = [
      L({ id: 'a', name: 'Le Sonic', email: 'prog@sonic.fr' }),
      L({ id: 'b', name: 'Sonic', city: 'Lyon (69)' }),
      L({ id: 'c', name: 'Botanique', cat: 'booking_eu', country: 'BE', city: 'Bruxelles' }),
      L({ id: 'd', name: 'Écartée', dismissed: true }),
      L({ id: 'e', name: 'Au pipeline', crmId: 'x', crmAt: d(0) }),
    ];
    const idx = buildIndex(leads);
    expect(dupsOf(idx, leads[0]).map((x) => x.id)).toEqual(['b']);
    expect(filterLeads(leads, 'all', DEFAULT_FILTERS, meta, idx).map((l) => l.id).sort()).toEqual(['a', 'b', 'c']);
    expect(filterLeads(leads, 'trash', DEFAULT_FILTERS, meta, idx).map((l) => l.id)).toEqual(['d']);
    expect(filterLeads(leads, 'crm', DEFAULT_FILTERS, meta, idx).map((l) => l.id)).toEqual(['e']);
    expect(filterLeads(leads, 'all', { ...DEFAULT_FILTERS, zone: 'Europe' }, meta, idx).map((l) => l.id)).toEqual(['c']);
    expect(filterLeads(leads, 'all', { ...DEFAULT_FILTERS, q: 'botaniqu' }, meta, idx).map((l) => l.id)).toEqual(['c']);
    expect(filterLeads(leads, 'all', { ...DEFAULT_FILTERS, withEmail: true }, meta, idx).map((l) => l.id)).toEqual(['a']);
    expect(triQueue(leads, meta, new Set(['a'])).map((l) => l.id).sort()).toEqual(['b', 'c']);
  });

  it('pipeline hand-off input matches add_to_pipeline (and never moves a linked deal back)', () => {
    const l = L({ id: 'sp-1', cat: 'support', email: 'Prog@X.fr, booking@x.fr', status: 'contacté', deadline: d(10), links: [{ label: 'Site', url: 'https://x.fr' }, { url: 'pas une url' }] });
    expect(crmInput(l)).toMatchObject({ external_id: 'sp-1', category: 'support', emails: ['prog@x.fr', 'booking@x.fr'], stage: 'contacte', links: [{ label: 'Site', url: 'https://x.fr' }] });
    expect(crmInput({ ...l, crmId: 'deal' })).not.toHaveProperty('stage');
  });

  it("mail templates keep Greg's wording", () => {
    const l = L({ name: 'Le Brin de Zinc', contact: 'Julie — prog' });
    expect(kindOf(l)).toBe('venue');
    expect(langOf(L({ country: 'DE', city: 'Berlin' }))).toBe('en');
    const m = buildMail(l, 'venue', 'fr');
    expect(m.subject).toBe('Programmation - Kruzberg - Post-Punk');
    expect(m.body).toContain('Bonjour Julie,');
    expect(m.body).toContain('venir jouer au Brin de Zinc');
    expect(m.body).toContain('booking@kruzberg.com');
  });
});
