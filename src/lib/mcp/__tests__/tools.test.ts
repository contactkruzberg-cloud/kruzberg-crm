/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-RPC payloads in tests */
import { beforeEach, describe, expect, it } from 'vitest';
import { createMcpHandler } from 'mcp-handler';
import { registerRadarTools, runTool } from '../tools';
import { RADAR_NOTE_PREFIX } from '../service';
import { createMemoryStore } from './memory-store';

const BASE = 'https://crm.test';
let mem: ReturnType<typeof createMemoryStore>;
let handler: (req: Request) => Promise<Response>;
let rpcId = 0;

async function rpc(method: string, params?: unknown) {
  const res = await handler(
    new Request(`${BASE}/api/mcp/secret`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    }),
  );
  const body = await res.text();
  const data = body.split('\n').find((l) => l.startsWith('data: '));
  return JSON.parse(data ? data.slice(6) : body);
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const { result, error } = await rpc('tools/call', { name, arguments: args });
  if (error) throw new Error(JSON.stringify(error));
  return result as { isError?: boolean; content: { text: string }[]; structuredContent?: any };
}

const lead = (over: Record<string, unknown> = {}) => ({
  external_id: 'sp-013',
  category: 'booking_fr',
  name: 'Le Ferrailleur',
  type: 'bar-concert',
  city: 'Nantes',
  capacity: '250 debout',
  contact_name: 'Julie Prog',
  emails: ['Booking@Ferrailleur.fr'],
  links: [
    { label: 'Site', url: 'https://leferrailleur.fr' },
    { label: 'Insta', url: 'https://instagram.com/leferrailleur' },
  ],
  event_date: '2027-03-14',
  deadline: '2026-11-30',
  fit: 3,
  why: 'Programmation stoner/metal régulière',
  action: 'Envoyer le kit promo',
  verified: '2026-09-20',
  radar_status: 'nouveau',
  ...over,
});

beforeEach(() => {
  mem = createMemoryStore();
  handler = createMcpHandler((s) => registerRadarTools(s, { store: mem.store, baseUrl: BASE, actor: 'test', take: () => 0 }), {
    serverInfo: { name: 'kruzberg-crm', version: 'test' },
  });
});

describe('tools/list', () => {
  it('exposes the 4 tools with read-only annotations', async () => {
    const { result } = await rpc('tools/list');
    const tools = Object.fromEntries(result.tools.map((t: any) => [t.name, t]));
    expect(Object.keys(tools).sort()).toEqual(['add_to_pipeline', 'find_opportunity', 'list_pipeline_stages', 'update_stage']);
    expect(tools.find_opportunity.annotations.readOnlyHint).toBe(true);
    expect(tools.list_pipeline_stages.annotations.readOnlyHint).toBe(true);
    expect(tools.add_to_pipeline.annotations.readOnlyHint).toBe(false);
    expect(tools.update_stage.annotations.readOnlyHint).toBe(false);
    expect(tools.add_to_pipeline.inputSchema.additionalProperties).toBe(false);
  });
});

describe('list_pipeline_stages', () => {
  it('returns the stages in pipeline order', async () => {
    const r = await call('list_pipeline_stages');
    expect(r.structuredContent.entry_stage).toBe('a_contacter');
    expect(r.structuredContent.stages.map((s: any) => s.id)).toEqual([
      'a_contacter', 'contacte', 'relance', 'repondu', 'a_suivre', 'confirme', 'termine', 'refuse',
    ]);
    expect(r.structuredContent.stages[0]).toEqual({ id: 'a_contacter', label: 'À contacter' });
  });
});

describe('add_to_pipeline', () => {
  it('is idempotent: same external_id twice → created true then false, one deal in base', async () => {
    const first = await call('add_to_pipeline', lead());
    expect(first.isError).toBeFalsy();
    expect(first.structuredContent).toMatchObject({ created: true, stage: 'a_contacter', matched_by: null });
    expect(first.structuredContent.url).toBe(`${BASE}/pipeline?deal=${first.structuredContent.id}`);

    const second = await call('add_to_pipeline', lead());
    expect(second.structuredContent).toMatchObject({ id: first.structuredContent.id, created: false, matched_by: 'external_id' });

    expect(mem.db.deals).toHaveLength(1);
    expect(mem.db.venues).toHaveLength(1);
    expect(mem.db.contacts).toHaveLength(1);
    expect(mem.db.activities.filter((a) => a.type === 'note')).toHaveLength(1);
    expect(mem.db.tasks).toHaveLength(1);
  });

  it('maps the lead onto venue, contact, deal, note and task', async () => {
    await call('add_to_pipeline', lead());
    const [venue] = mem.db.venues;
    expect(venue).toMatchObject({
      name: 'Le Ferrailleur', type: 'bar', city: 'Nantes', country: 'France', capacity: 250,
      email: 'booking@ferrailleur.fr', website: 'https://leferrailleur.fr',
      instagram: 'https://instagram.com/leferrailleur', fit_score: 5,
    });
    expect(mem.db.contacts[0]).toMatchObject({ name: 'Julie Prog', email: 'booking@ferrailleur.fr', venue_id: venue.id });
    expect(mem.db.deals[0]).toMatchObject({
      venue_id: venue.id, contact_id: mem.db.contacts[0].id, priority: 'high', concert_date: '2027-03-14',
      tags: ['radar', 'booking_fr'], external_source: 'radar', external_id: 'sp-013',
    });
    const note = String(mem.db.activities.find((a) => a.type === 'note')!.content);
    expect(note.startsWith(`${RADAR_NOTE_PREFIX} — sp-013`)).toBe(true);
    expect(note).toContain('Pourquoi : Programmation stoner/metal régulière');
    expect(note).toContain('Action : Envoyer le kit promo');
    expect(note).toContain('Vérifié : 2026-09-20');
    expect(mem.db.tasks[0]).toMatchObject({ title: 'Deadline radar : Le Ferrailleur', due_date: '2026-11-30' });
  });

  it('adds a new note only when the radar content changed', async () => {
    await call('add_to_pipeline', lead());
    await call('add_to_pipeline', lead({ radar_status: 'contacté', deadline: '2026-12-15' }));
    expect(mem.db.activities.filter((a) => a.type === 'note')).toHaveLength(2);
    expect(mem.db.tasks).toHaveLength(1);
    expect(mem.db.tasks[0].due_date).toBe('2026-12-15');
  });

  it('dedups by email onto an existing manual deal and anchors the external_id', async () => {
    const venue = await mem.repo.insertVenue({
      name: 'Ferrailleur (Le)', type: 'bar', city: 'Nantes', country: 'France', capacity: null,
      email: null, instagram: null, website: null, fit_score: 3,
    });
    const contact = await mem.repo.insertContact({ venue_id: venue.id, name: 'Julie', email: 'booking@ferrailleur.fr', notes: null });
    const deal = await mem.repo.insertDeal({
      venue_id: venue.id, contact_id: contact.id, stage: 'contacte', priority: 'medium', concert_date: null,
      tags: [], external_source: null, external_id: null,
    });

    const r = await call('add_to_pipeline', lead());
    expect(r.structuredContent).toMatchObject({ id: deal.id, created: false, stage: 'contacte', matched_by: 'email' });
    expect(mem.db.deals).toHaveLength(1);
    expect(mem.db.contacts).toHaveLength(1);
    expect(mem.db.deals[0]).toMatchObject({ external_id: 'sp-013', tags: ['radar', 'booking_fr'] });
    expect(mem.db.venues[0]).toMatchObject({ name: 'Ferrailleur (Le)', email: 'booking@ferrailleur.fr', capacity: 250 });
  });

  it('dedups by normalized name + city, ignoring accents and case', async () => {
    await mem.repo.insertVenue({
      name: 'Le Café de la Danse', type: 'salle', city: 'Saint-Étienne', country: 'France', capacity: 400,
      email: null, instagram: null, website: null, fit_score: 4,
    });
    const r = await call('add_to_pipeline', lead({ external_id: 'bf-002', name: 'le cafe de la danse', city: 'Saint Etienne', emails: null, contact_name: null }));
    expect(r.structuredContent).toMatchObject({ created: true, matched_by: 'name_city' });
    expect(mem.db.venues).toHaveLength(1);
    expect(mem.db.deals[0].venue_id).toBe(mem.db.venues[0].id);
  });

  it('creates a separate deal when the venue deal already tracks another radar lead', async () => {
    await call('add_to_pipeline', lead());
    const r = await call('add_to_pipeline', lead({ external_id: 'sp-020', event_date: '2027-06-01' }));
    expect(r.structuredContent).toMatchObject({ created: true, matched_by: 'email' });
    expect(mem.db.deals).toHaveLength(2);
    expect(mem.db.venues).toHaveLength(1);
  });

  it('honours stage on creation, never moves it back on update, changes it when explicit', async () => {
    const a = await call('add_to_pipeline', lead({ stage: 'contacte' }));
    expect(a.structuredContent.stage).toBe('contacte');
    const b = await call('add_to_pipeline', lead());
    expect(b.structuredContent.stage).toBe('contacte');
    const c = await call('add_to_pipeline', lead({ stage: 'repondu' }));
    expect(c.structuredContent.stage).toBe('repondu');
  });

  it('handles support leads: venue = the room, headliner in the note', async () => {
    await call('add_to_pipeline', lead({
      external_id: 'su-004', category: 'support', name: 'Mastodon', venue: 'Le Transbordeur', city: 'Villeurbanne',
      type: 'salle', emails: ['prog@transbordeur.fr'], contact_name: null,
    }));
    expect(mem.db.venues[0]).toMatchObject({ name: 'Le Transbordeur', type: 'salle' });
    expect(mem.db.contacts[0].name).toBe('Booking Le Transbordeur');
    expect(mem.db.deals[0].tags).toEqual(['radar', 'support', '1re-partie']);
    expect(mem.db.activities.find((a) => a.type === 'note')!.content).toContain('Première partie de : Mastodon');
  });

  it('maps press leads to a media venue and converts the ISO country', async () => {
    await call('add_to_pipeline', lead({ external_id: 'pr-001', category: 'presse', name: 'Metalorgie', type: 'webzine', country: 'BE', city: 'Bruxelles' }));
    expect(mem.db.venues[0]).toMatchObject({ type: 'media', country: 'Belgique' });
  });

  it('keeps a free-text event date in the note instead of concert_date', async () => {
    await call('add_to_pipeline', lead({ event_date: 'printemps 2027' }));
    expect(mem.db.deals[0].concert_date).toBeNull();
    expect(mem.db.activities.find((a) => a.type === 'note')!.content).toContain('Date : printemps 2027');
  });

  it('returns explicit validation errors', async () => {
    const missing = await call('add_to_pipeline', { external_id: 'x-1', category: 'festivals' });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toMatch(/name/);

    const badStage = await call('add_to_pipeline', lead({ stage: 'signed' }));
    expect(badStage.isError).toBe(true);
    expect(badStage.content[0].text).toContain('Étape inconnue');

    const extra = await call('add_to_pipeline', lead({ foo: 'bar' }));
    expect(extra.isError).toBe(true);
    expect(mem.db.deals).toHaveLength(0);
  });
});

describe('find_opportunity', () => {
  beforeEach(async () => {
    await call('add_to_pipeline', lead());
    await call('add_to_pipeline', lead({ external_id: 'fe-001', category: 'festivals', name: 'Motocultor', city: 'Carhaix', emails: ['booking@motocultor.com'], contact_name: null }));
  });

  it('finds by external_id', async () => {
    const r = await call('find_opportunity', { external_id: 'fe-001' });
    expect(r.structuredContent.results).toHaveLength(1);
    expect(r.structuredContent.results[0]).toMatchObject({ name: 'Motocultor', city: 'Carhaix', stage: 'a_contacter', external_id: 'fe-001' });
    expect(r.structuredContent.results[0].url).toMatch(/\/pipeline\?deal=/);
  });

  it('finds by email, case-insensitive', async () => {
    const r = await call('find_opportunity', { email: 'BOOKING@ferrailleur.fr' });
    expect(r.structuredContent.results.map((x: any) => x.name)).toEqual(['Le Ferrailleur']);
  });

  it('finds by partial name, accent-insensitive', async () => {
    const r = await call('find_opportunity', { name: 'ferráill' });
    expect(r.structuredContent.results.map((x: any) => x.name)).toEqual(['Le Ferrailleur']);
  });

  it('requires at least one criterion', async () => {
    const r = await call('find_opportunity', {});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('au moins un critère');
  });
});

describe('update_stage', () => {
  it('changes the stage and adds the note', async () => {
    const { structuredContent: created } = await call('add_to_pipeline', lead());
    const r = await call('update_stage', { id: created.id, stage: 'contacte', note: 'Mail envoyé avec le kit' });
    expect(r.structuredContent).toEqual({ id: created.id, previous_stage: 'a_contacter', stage: 'contacte', url: created.url });
    expect(mem.db.deals[0].stage).toBe('contacte');
    expect(mem.db.activities.some((a) => a.type === 'status_change')).toBe(true);
    expect(mem.db.activities.some((a) => a.type === 'note' && a.content === 'Mail envoyé avec le kit')).toBe(true);
  });

  it('rejects an unknown opportunity', async () => {
    const r = await call('update_stage', { id: '00000000-0000-4000-8000-000000000000', stage: 'contacte' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('Opportunité introuvable');
  });

  it('rejects an unknown stage', async () => {
    const r = await call('update_stage', { id: '00000000-0000-4000-8000-000000000000', stage: 'signed' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('Étape inconnue');
  });
});

describe('runTool', () => {
  it('returns a rate-limit tool error when the limiter refuses', async () => {
    const r = await runTool(() => ({ ok: true }), () => 12);
    expect(r).toMatchObject({ isError: true });
    expect(r.content[0].text).toContain('Réessaie dans 12 s');
  });

  it('hides unexpected errors behind a generic message (no stack trace)', async () => {
    const r = await runTool(() => {
      throw new TypeError('secret internals at foo.ts:12');
    }, () => 0);
    expect(r).toEqual({ content: [{ type: 'text', text: 'Erreur interne du CRM. Réessaie plus tard.' }], isError: true });
  });
});
