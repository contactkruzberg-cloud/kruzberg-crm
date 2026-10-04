/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-RPC payloads in tests */
import { beforeEach, describe, expect, it } from 'vitest';
import { createMcpHandler } from 'mcp-handler';
import { registerFullCrmTools } from '../crm-tools';
import { registerRadarTools } from '../tools';
import { createMemoryStore } from './memory-store';

const BASE = 'https://crm.test';
const MISSING = '00000000-0000-4000-8000-000000000000';
let mem: ReturnType<typeof createMemoryStore>;
let handler: (req: Request) => Promise<Response>;
let rpcId = 0;

async function rpc(method: string, params?: unknown) {
  const res = await handler(
    new Request(`${BASE}/api/mcp`, {
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

/** Calls a tool that must succeed and returns its structured result. */
async function ok(name: string, args: Record<string, unknown> = {}) {
  const r = await call(name, args);
  if (r.isError) throw new Error(`${name} failed: ${r.content[0].text}`);
  return r.structuredContent;
}

/** Calls a tool that must fail and returns its error text. */
async function fails(name: string, args: Record<string, unknown> = {}) {
  const r = await call(name, args);
  expect(r.isError, `${name} should fail`).toBe(true);
  return r.content[0].text;
}

beforeEach(() => {
  mem = createMemoryStore();
  const ctx = { store: mem.store, baseUrl: BASE, actor: 'claude.ai (OAuth : test)', take: () => 0 };
  handler = createMcpHandler(
    (s) => {
      registerRadarTools(s, ctx);
      registerFullCrmTools(s, ctx);
    },
    { serverInfo: { name: 'kruzberg-crm', version: 'test' } },
  );
});

async function seed() {
  const venue = await ok('create_venue', { name: 'Le Périscope', type: 'salle', city: 'Lyon', email: 'prog@periscope-lyon.com', website: 'https://periscope-lyon.com', capacity: 120 });
  const contact = await ok('create_contact', { name: 'Julie Prog', email: 'julie@periscope-lyon.com', venue_id: venue.id, role: 'Programmatrice' });
  const deal = await ok('create_deal', { venue_id: venue.id, contact_id: contact.id, title: 'Date Périscope 2027', tags: ['lyon'] });
  return { venue, contact, deal };
}

// ------------------------------------------------------------------ catalogue

describe('tools/list', () => {
  it('exposes every tool, with strict schemas and the right annotations', async () => {
    const { result } = await rpc('tools/list');
    const tools = Object.fromEntries(result.tools.map((t: any) => [t.name, t]));
    const expected = [
      'add_to_pipeline', 'find_opportunity', 'list_pipeline_stages', 'update_stage',
      'get_schema', 'search', 'find_duplicates', 'get_audit_log',
      'list_venues', 'list_contacts', 'list_deals', 'list_tasks', 'list_activities', 'list_tours', 'list_templates',
      'get_venue', 'get_contact', 'get_deal', 'get_task', 'get_tour', 'get_template',
      'create_venue', 'create_contact', 'create_deal', 'create_task', 'create_tour', 'create_tour_stop', 'create_tour_expense', 'create_template',
      'update_venue', 'update_contact', 'update_deal', 'update_task', 'update_activity', 'update_tour', 'update_tour_stop', 'update_tour_expense', 'update_template',
      'archive_venue', 'archive_contact', 'archive_deal', 'archive_task', 'archive_activity', 'archive_tour', 'archive_tour_stop', 'archive_tour_expense', 'archive_template',
      'restore', 'add_note', 'log_activity', 'move_stage', 'set_follow_up', 'bulk_update',
      'list_bands', 'get_band', 'create_band', 'update_band', 'archive_band',
      'list_application_deadlines', 'link_band_to_deal', 'unlink_band_from_deal', 'save_briefing', 'get_briefing',
    ];
    expect(Object.keys(tools).sort()).toEqual([...expected].sort());
    for (const name of expected) {
      const t = tools[name];
      expect(t.description.length, name).toBeGreaterThan(40);
      expect(t.inputSchema.additionalProperties, name).toBe(false);
      const readOnly = /^(get_|list_|search|find_)/.test(name);
      expect(t.annotations.readOnlyHint, name).toBe(readOnly);
      if (/^archive_|^bulk_update$/.test(name)) expect(t.annotations.destructiveHint, name).toBe(true);
      if (/^(create_|update_|add_note|log_activity|move_stage|set_follow_up|restore)/.test(name)) {
        expect(t.annotations.destructiveHint, name).toBe(false);
      }
    }
  });
});

// ------------------------------------------------------------------ read

describe('get_schema', () => {
  it('lists entities, real stage ids, enums and conventions', async () => {
    const s = await ok('get_schema');
    expect(s.pipeline.stages.map((x: any) => x.id)).toEqual(['a_contacter', 'contacte', 'relance', 'repondu', 'a_suivre', 'confirme', 'termine', 'refuse']);
    expect(s.entities.map((e: any) => e.entity)).toEqual(['venue', 'contact', 'deal', 'task', 'activity', 'tour', 'tour_stop', 'tour_expense', 'template', 'band']);
    expect(s.enums.style_fits.map((x: any) => x.id)).toEqual(['yes', 'maybe', 'no']);
    const deal = s.entities.find((e: any) => e.entity === 'deal');
    expect(deal.writable_fields.properties.stage.enum).toContain('a_suivre');
    expect(deal.writable_fields.properties.external_id).toBeDefined();
    expect(s.enums.channels.map((c: any) => c.id)).toContain('instagram');
    expect(s.conventions.versioning).toContain('expected_updated_at');
  });
});

describe('search', () => {
  it('finds across entities, accent- and case-insensitive, best match first', async () => {
    const { venue, deal } = await seed();
    await ok('add_note', { deal_id: deal.id, content: 'Julie veut un plateau post-punk en mars' });
    const r = await ok('search', { query: 'PERISCOPE' });
    expect(r.results[0]).toMatchObject({ entity: 'venue', id: venue.id, name: 'Le Périscope', city: 'Lyon' });
    expect(r.results.map((x: any) => x.entity)).toEqual(expect.arrayContaining(['venue', 'contact', 'deal']));
    const notes = await ok('search', { query: 'plateau post punk', entities: ['activity'] });
    expect(notes.results).toHaveLength(1);
    expect(notes.results[0].snippet).toContain('post-punk');
    const multi = await ok('search', { query: 'periscope lyon', entities: ['venue'] });
    expect(multi.results).toHaveLength(1);
  });

  it('rejects a too-short query', async () => {
    expect(await fails('search', { query: 'a' })).toMatch(/query/);
  });
});

describe('list_* tools', () => {
  it('list_venues filters by category and city, sorts and paginates with a cursor', async () => {
    for (const [name, type, city] of [
      ['A Bar', 'bar', 'Lyon'], ['B Salle', 'salle', 'Lyon'], ['C Salle', 'salle', 'Lyon'], ['D Salle', 'salle', 'Grenoble'],
    ]) await ok('create_venue', { name, type, city });
    const page1 = await ok('list_venues', { type: 'salle', city: 'lyon', limit: 1 });
    expect(page1.items.map((v: any) => v.name)).toEqual(['B Salle']);
    expect(page1.next_cursor).toBeTruthy();
    const page2 = await ok('list_venues', { type: 'salle', city: 'lyon', limit: 1, cursor: page1.next_cursor });
    expect(page2.items.map((v: any) => v.name)).toEqual(['C Salle']);
    expect(page2.next_cursor).toBeNull();
    const byType = await ok('list_venues', { type: ['bar', 'salle'], sort: 'name', order: 'desc' });
    expect(byType.items.map((v: any) => v.name)).toEqual(['D Salle', 'C Salle', 'B Salle', 'A Bar']);
  });

  it('rejects a cursor reused with other filters, an unknown sort and a limit over 200', async () => {
    for (const n of ['A', 'B']) await ok('create_venue', { name: n });
    const p = await ok('list_venues', { limit: 1 });
    expect(await fails('list_venues', { limit: 1, city: 'Lyon', cursor: p.next_cursor })).toContain('Curseur invalide');
    expect(await fails('list_venues', { sort: 'email' })).toMatch(/Tri inconnu|Valeurs possibles/);
    expect(await fails('list_venues', { limit: 201 })).toMatch(/200|limit/);
  });

  it('list_deals filters by stage, venue category, city, follow-up date and radar id', async () => {
    const { venue, deal } = await seed();
    const fest = await ok('create_venue', { name: 'Motocultor', type: 'festival', city: 'Carhaix' });
    const d2 = await ok('create_deal', { venue_id: fest.id, stage: 'contacte', external_source: 'radar', external_id: 'fe-001' });
    await ok('set_follow_up', { deal_id: d2.id, date: '2026-10-01' });
    expect((await ok('list_deals', { stage: 'contacte' })).items.map((d: any) => d.id)).toEqual([d2.id]);
    expect((await ok('list_deals', { venue_type: 'salle' })).items.map((d: any) => d.id)).toEqual([deal.id]);
    expect((await ok('list_deals', { city: 'carhaix' })).items[0]).toMatchObject({ id: d2.id, venue_name: 'Motocultor', venue_city: 'Carhaix' });
    expect((await ok('list_deals', { follow_up_before: '2026-10-04' })).items.map((d: any) => d.id)).toEqual([d2.id]);
    expect((await ok('list_deals', { external_id: 'fe-001' })).items).toHaveLength(1);
    expect((await ok('list_deals', { venue_id: venue.id })).items.map((d: any) => d.id)).toEqual([deal.id]);
    expect(await fails('list_deals', { stage: 'booké' })).toContain('a_contacter, contacte, relance');
  });

  it('list_contacts, list_tasks, list_activities, list_tours, list_templates filter correctly', async () => {
    const { venue, contact, deal } = await seed();
    await ok('create_contact', { name: 'Sans mail' });
    expect((await ok('list_contacts', { venue_id: venue.id })).items.map((c: any) => c.id)).toEqual([contact.id]);
    expect((await ok('list_contacts', { has_email: false })).items.map((c: any) => c.name)).toEqual(['Sans mail']);

    const t1 = await ok('create_task', { title: 'Envoyer EPK', deal_id: deal.id, due_date: '2026-10-10' });
    await ok('create_task', { title: 'Déjà fait', completed_at: '2026-09-01T10:00:00Z' });
    expect((await ok('list_tasks', { status: 'open' })).items.map((t: any) => t.id)).toEqual([t1.id]);
    expect((await ok('list_tasks', { due_before: '2026-10-31', deal_id: deal.id })).items).toHaveLength(1);

    await ok('log_activity', { deal_id: deal.id, kind: 'call', channel: 'phone', date: '2026-09-20T10:00:00Z' });
    expect((await ok('list_activities', { deal_id: deal.id, type: 'call' })).items).toHaveLength(1);
    expect((await ok('list_activities', { channel: 'phone', after: '2026-09-01' })).items).toHaveLength(1);

    await ok('create_tour', { name: 'Tournée printemps', status: 'confirmee', start_date: '2027-03-01' });
    await ok('create_tour', { name: 'Brouillon été' });
    expect((await ok('list_tours', { status: 'confirmee' })).items.map((t: any) => t.name)).toEqual(['Tournée printemps']);
    expect((await ok('list_tours', { start_after: '2027-01-01' })).items).toHaveLength(1);

    await ok('create_template', { name: 'Relance douce', category: 'relance_1', subject: 'Petite relance', body: 'Bonjour {{contact}}' });
    expect((await ok('list_templates', { category: 'relance_1' })).items.map((t: any) => t.name)).toEqual(['Relance douce']);
  });
});

describe('get_* tools', () => {
  it('get_deal returns venue, contacts, stage history, notes and tasks', async () => {
    const { venue, contact, deal } = await seed();
    await ok('create_contact', { name: 'Régisseur', venue_id: venue.id });
    await ok('move_stage', { id: deal.id, stage: 'contacte', note: 'Premier mail' });
    await ok('create_task', { title: 'Relancer', deal_id: deal.id });
    const d = await ok('get_deal', { id: deal.id });
    expect(d).toMatchObject({ id: deal.id, display_name: 'Date Périscope 2027', stage: 'contacte', archived: false, url: `${BASE}/pipeline?deal=${deal.id}` });
    expect(d.venue).toMatchObject({ id: venue.id, name: 'Le Périscope' });
    expect(d.contact).toMatchObject({ id: contact.id });
    expect(d.other_contacts.map((c: any) => c.name)).toEqual(['Régisseur']);
    expect(d.stage_history).toEqual([expect.objectContaining({ from: 'a_contacter', to: 'contacte' })]);
    expect(d.notes_and_activities.map((a: any) => a.content)).toEqual(['Premier mail']);
    expect(d.tasks).toHaveLength(1);
    expect(d.user_id).toBeUndefined();
  });

  it('get_venue, get_contact, get_task, get_tour, get_template return relations', async () => {
    const { venue, contact, deal } = await seed();
    const v = await ok('get_venue', { id: venue.id });
    expect(v.contacts.map((c: any) => c.id)).toEqual([contact.id]);
    expect(v.deals.map((x: any) => x.id)).toEqual([deal.id]);
    const c = await ok('get_contact', { id: contact.id });
    expect(c.venue.id).toBe(venue.id);
    expect(c.deals.map((x: any) => x.id)).toEqual([deal.id]);
    const task = await ok('create_task', { title: 'X', deal_id: deal.id });
    expect((await ok('get_task', { id: task.id })).deal.id).toBe(deal.id);
    const tour = await ok('create_tour', { name: 'T' });
    await ok('create_tour_stop', { tour_id: tour.id, stop_date: '2027-03-01', fee: 500, hotel_cost: 120, deal_id: deal.id });
    await ok('create_tour_expense', { tour_id: tour.id, amount: 42.5, category: 'toll', label: 'A7' });
    const t = await ok('get_tour', { id: tour.id });
    expect(t.totals).toEqual({ fees: 500, hotels: 120, expenses: 42.5, shows: 1 });
    const tpl = await ok('create_template', { name: 'Premier contact' });
    expect((await ok('get_template', { id: tpl.id })).name).toBe('Premier contact');
  });

  it('get_* errors on unknown ids and invalid UUIDs', async () => {
    expect(await fails('get_deal', { id: MISSING })).toContain('Opportunité introuvable');
    expect(await fails('get_venue', { id: 'abc' })).toContain('UUID attendu');
  });
});

describe('find_duplicates', () => {
  it('groups venues by normalized name + city, email and domain', async () => {
    const a = await ok('create_venue', { name: 'Le Sonic', city: 'Lyon', email: 'booking@sonic-lyon.fr' });
    const b = await ok('create_venue', { name: 'SONIC', city: 'lyon', website: 'https://www.sonic-lyon.fr' });
    await ok('create_venue', { name: 'Sonic', city: 'Paris', email: 'x@gmail.com' });
    await ok('create_venue', { name: 'Autre', city: 'Lyon', email: 'y@gmail.com' });
    const r = await ok('find_duplicates', { entity: 'venue', by: ['name_city', 'domain'] });
    const byCrit = Object.fromEntries(r.groups.map((g: any) => [g.criterion, g.items.map((i: any) => i.id).sort()]));
    expect(byCrit.name_city).toEqual([a.id, b.id].sort());
    expect(byCrit.domain).toEqual([a.id, b.id].sort()); // gmail.com ignored
    const byName = await ok('find_duplicates', { entity: 'venue', by: ['name'] });
    expect(byName.groups[0].items).toHaveLength(3);
  });

  it('groups contacts by email and rejects an unknown criterion', async () => {
    await ok('create_contact', { name: 'A', email: 'Same@X.fr' });
    await ok('create_contact', { name: 'B', email: 'same@x.fr' });
    expect((await ok('find_duplicates', { entity: 'contact', by: ['email'] })).groups_found).toBe(1);
    expect(await fails('find_duplicates', { entity: 'contact', by: ['phone'] })).toContain('name, name_city, email, domain');
  });
});

describe('get_audit_log', () => {
  it('records who, when, which tool, before/after for every write, including the radar tools', async () => {
    const { deal } = await seed();
    await ok('update_deal', { id: deal.id, expected_updated_at: deal.updated_at, patch: { fee: 800 } });
    await ok('add_to_pipeline', { external_id: 'sp-1', category: 'booking_fr', name: 'Le Ferrailleur', city: 'Nantes' });
    const log = await ok('get_audit_log', { entity_id: deal.id });
    const upd = log.items.find((e: any) => e.tool === 'update_deal');
    expect(upd).toMatchObject({ actor: 'claude.ai (OAuth : test)', action: 'update', entity: 'deal' });
    expect(upd.before.fee).toBeNull();
    expect(upd.after.fee).toBe(800);
    expect(upd.after.user_id).toBeUndefined();
    const radar = await ok('get_audit_log', { tool: 'add_to_pipeline' });
    expect(radar.items.map((e: any) => e.entity).sort()).toEqual(['activity', 'deal', 'venue']);
    const paged = await ok('get_audit_log', { limit: 2 });
    expect(paged.items).toHaveLength(2);
    expect(paged.next_cursor).toBeTruthy();
  });
});

// ------------------------------------------------------------------ write: generic CRUD for every entity

const CASES: { entity: string; plural: string; create: (ids: any) => Record<string, unknown>; patch: Record<string, unknown>; bad: Record<string, unknown> }[] = [
  { entity: 'venue', plural: 'venues', create: () => ({ name: 'V', city: 'Lyon' }), patch: { capacity: 300 }, bad: { capacity: -1 } },
  { entity: 'contact', plural: 'contacts', create: () => ({ name: 'C' }), patch: { role: 'Booker' }, bad: { email: 'pas-un-mail' } },
  { entity: 'deal', plural: 'deals', create: (i) => ({ venue_id: i.venue.id }), patch: { priority: 'high' }, bad: { stage: 'booké' } },
  { entity: 'task', plural: 'tasks', create: () => ({ title: 'T' }), patch: { due_date: '2026-12-01' }, bad: { due_date: '01/12/2026' } },
  { entity: 'tour', plural: 'tours', create: () => ({ name: 'Tour' }), patch: { status: 'confirmee' }, bad: { status: 'validee' } },
  { entity: 'tour_stop', plural: 'tour_stops', create: (i) => ({ tour_id: i.tour.id, stop_date: '2027-03-01' }), patch: { set_time: '21:30' }, bad: { set_time: '9h30' } },
  { entity: 'tour_expense', plural: 'tour_expenses', create: (i) => ({ tour_id: i.tour.id, amount: 10 }), patch: { category: 'toll' }, bad: { category: 'peage' } },
  { entity: 'template', plural: 'templates', create: () => ({ name: 'Tpl' }), patch: { subject: 'Hello' }, bad: { category: 'spam' } },
  { entity: 'band', plural: 'bands', create: () => ({ name: 'Rendez-Vous' }), patch: { exchange_status: 'we_owe' }, bad: { exchange_status: 'maybe' } },
];

describe.each(CASES)('create/update/archive/restore $entity', ({ entity, create, patch, bad }) => {
  let ids: any;
  beforeEach(async () => {
    const venue = await ok('create_venue', { name: 'Base' });
    const tour = await ok('create_tour', { name: 'Base tour' });
    ids = { venue, tour };
  });

  it(`create_${entity} returns the full object`, async () => {
    const row = await ok(`create_${entity}`, create(ids));
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.updated_at).toBeTruthy();
    expect(row.archived).toBe(false);
  });

  it(`create_${entity} rejects unknown fields`, async () => {
    expect(await fails(`create_${entity}`, { ...create(ids), nope: 1 })).toMatch(/nope|Unrecognized/i);
  });

  it(`update_${entity} patches only the given fields and returns the full object`, async () => {
    const row = await ok(`create_${entity}`, create(ids));
    const updated = await ok(`update_${entity}`, { id: row.id, expected_updated_at: row.updated_at, patch });
    expect(updated).toMatchObject({ ...patch, id: row.id });
    expect(updated.updated_at).not.toBe(row.updated_at);
    for (const [k, v] of Object.entries(row)) if (!(k in patch) && k !== 'updated_at') expect(updated[k], k).toEqual(v);
  });

  it(`update_${entity} refuses a stale expected_updated_at (version conflict) and writes nothing`, async () => {
    const row = await ok(`create_${entity}`, create(ids));
    mem.touch(`${entity === 'tour_stop' ? 'tour_stops' : entity === 'tour_expense' ? 'tour_expenses' : `${entity}s`}` as any, row.id);
    const msg = await fails(`update_${entity}`, { id: row.id, expected_updated_at: row.updated_at, patch });
    expect(msg).toContain('Conflit de version');
    expect(msg).toContain('Version actuelle');
    expect((await ok('get_audit_log', { entity_id: row.id })).items.filter((e: any) => e.action === 'update')).toHaveLength(0);
  });

  it(`update_${entity} returns readable validation errors`, async () => {
    const row = await ok(`create_${entity}`, create(ids));
    const msg = await fails(`update_${entity}`, { id: row.id, expected_updated_at: row.updated_at, patch: bad });
    expect(msg.length).toBeGreaterThan(10);
    expect(await fails(`update_${entity}`, { id: row.id, patch })).toMatch(/expected_updated_at/);
    expect(await fails(`update_${entity}`, { id: MISSING, expected_updated_at: row.updated_at, patch })).toContain('introuvable');
  });

  it(`archive_${entity} hides it (soft delete) and restore brings it back`, async () => {
    const row = await ok(`create_${entity}`, create(ids));
    const archived = await ok(`archive_${entity}`, { id: row.id });
    expect(archived.archived).toMatchObject({ id: row.id, archived: true });
    expect(archived.how_to_undo).toContain('restore');
    const plural = CASES.find((c) => c.entity === entity)!.plural;
    if (['venues', 'deals', 'tasks', 'tours', 'templates', 'contacts', 'bands'].includes(plural)) {
      expect((await ok(`list_${plural}`, {})).items.map((x: any) => x.id)).not.toContain(row.id);
      expect((await ok(`list_${plural}`, { archived: 'only' })).items.map((x: any) => x.id)).toEqual([row.id]);
    }
    expect(await fails(`update_${entity}`, { id: row.id, expected_updated_at: archived.archived.updated_at, patch })).toContain('archivé');
    expect(await fails(`archive_${entity}`, { id: row.id })).toContain('déjà archivé');
    const restored = await ok('restore', { entity, id: row.id });
    expect(restored.restored).toMatchObject({ id: row.id, archived: false });
    expect(await fails('restore', { entity, id: row.id })).toContain("n'est pas archivé");
  });
});

describe('update_activity / archive_activity', () => {
  it('edits and archives a note with version control', async () => {
    const { deal } = await seed();
    const note = await ok('add_note', { deal_id: deal.id, content: 'Brouillon' });
    const upd = await ok('update_activity', { id: note.id, expected_updated_at: note.updated_at, patch: { content: 'Version finale' } });
    expect(upd.content).toBe('Version finale');
    expect(await fails('update_activity', { id: note.id, expected_updated_at: note.updated_at, patch: { content: 'x' } })).toContain('Conflit de version');
    await ok('archive_activity', { id: note.id });
    expect((await ok('get_deal', { id: deal.id })).notes_and_activities).toHaveLength(0);
  });
});

describe('create_* relations', () => {
  it('create_deal requires a venue or a contact, and existing ones', async () => {
    expect(await fails('create_deal', { title: 'Orpheline' })).toContain('venue_id');
    expect(await fails('create_deal', { venue_id: MISSING })).toContain('structure introuvable');
  });

  it('create_deal refuses a duplicate external_id (radar dedup)', async () => {
    const v = await ok('create_venue', { name: 'X' });
    await ok('create_deal', { venue_id: v.id, external_source: 'radar', external_id: 'sp-9' });
    expect(await fails('create_deal', { venue_id: v.id, external_source: 'radar', external_id: 'sp-9' })).toContain('Doublon');
  });

  it('create_tour_expense refuses a stop of another tour', async () => {
    const t1 = await ok('create_tour', { name: 'T1' });
    const t2 = await ok('create_tour', { name: 'T2' });
    const stop = await ok('create_tour_stop', { tour_id: t2.id, stop_date: '2027-01-01' });
    expect(await fails('create_tour_expense', { tour_id: t1.id, stop_id: stop.id, amount: 5 })).toContain("n'appartient pas");
  });

  it('update_deal cannot detach both venue and contact', async () => {
    const { deal } = await seed();
    expect(await fails('update_deal', { id: deal.id, expected_updated_at: deal.updated_at, patch: { venue_id: null, contact_id: null } })).toContain('rattachée');
  });
});

// ------------------------------------------------------------------ archive cascade

describe('archive cascade', () => {
  it('archiving a venue archives its contacts, deals and tasks, hides the show from the website; restore brings all back', async () => {
    const { venue, contact, deal } = await seed();
    const task = await ok('create_task', { title: 'T', deal_id: deal.id });
    await ok('update_deal', { id: deal.id, expected_updated_at: deal.updated_at, patch: { show_on_website: true, stage: 'confirme', concert_date: '2027-03-01' } });
    const r = await ok('archive_venue', { id: venue.id });
    expect(r.also_archived.map((x: any) => x.entity).sort()).toEqual(['contact', 'deal', 'task']);
    expect(mem.db.deals[0]).toMatchObject({ show_on_website: false, deleted_show_on_website: true });
    expect((await ok('list_deals', {})).items).toHaveLength(0);

    const back = await ok('restore', { entity: 'deal', id: deal.id }); // same batch: restores the venue too
    expect(back.also_restored.map((x: any) => x.id).sort()).toEqual([venue.id, contact.id, task.id].sort());
    expect(mem.db.deals[0]).toMatchObject({ show_on_website: true, deleted_at: null });
  });

  it('refuses to restore a child whose parent was archived separately', async () => {
    const { venue, deal } = await seed();
    await ok('archive_deal', { id: deal.id });
    await ok('archive_venue', { id: venue.id });
    expect(await fails('restore', { entity: 'deal', id: deal.id })).toContain('Restaure-la d\'abord');
    await ok('restore', { entity: 'venue', id: venue.id });
    await ok('restore', { entity: 'deal', id: deal.id });
  });

  it('archive with a stale expected_updated_at is a version conflict', async () => {
    const { deal } = await seed();
    mem.touch('deals', deal.id);
    expect(await fails('archive_deal', { id: deal.id, expected_updated_at: deal.updated_at })).toContain('Conflit de version');
  });

  it('add_to_pipeline restores an archived radar deal instead of duplicating it', async () => {
    const first = await ok('add_to_pipeline', { external_id: 'sp-77', category: 'booking_fr', name: 'Le Ferrailleur', city: 'Nantes' });
    const venueId = mem.db.deals[0].venue_id as string;
    await ok('archive_venue', { id: venueId });
    const again = await ok('add_to_pipeline', { external_id: 'sp-77', category: 'booking_fr', name: 'Le Ferrailleur', city: 'Nantes' });
    expect(again).toMatchObject({ id: first.id, created: false, restored: true, matched_by: 'external_id' });
    expect(mem.db.venues).toHaveLength(1);
    expect(mem.db.venues[0].deleted_at).toBeNull();
  });
});

// ------------------------------------------------------------------ notes, activities, stage, follow-up

describe('add_note', () => {
  it('adds a dated note and links venue/contact from the deal', async () => {
    const { venue, contact, deal } = await seed();
    const n = await ok('add_note', { deal_id: deal.id, content: 'Appel sympa', date: '2026-09-30T18:00:00Z' });
    expect(n).toMatchObject({ type: 'note', content: 'Appel sympa', venue_id: venue.id, contact_id: contact.id, created_at: '2026-09-30T18:00:00Z' });
  });

  it('needs a target and refuses an archived one', async () => {
    expect(await fails('add_note', { content: 'x' })).toContain('deal_id, venue_id ou contact_id');
    const { deal } = await seed();
    await ok('archive_deal', { id: deal.id });
    expect(await fails('add_note', { deal_id: deal.id, content: 'x' })).toContain('archivé');
  });
});

describe('log_activity', () => {
  it('logs a relance by DM and updates the deal dates, channel and follow-up', async () => {
    const { deal } = await seed();
    await ok('move_stage', { id: deal.id, stage: 'contacte' });
    const r = await ok('log_activity', { deal_id: deal.id, kind: 'relance', channel: 'instagram', date: '2026-10-01T10:00:00.000Z', stage: 'relance' });
    expect(r.activity).toMatchObject({ type: 'relance', channel: 'instagram', content: 'Relance (Instagram)', created_at: '2026-10-01T10:00:00.000Z' });
    expect(r.deal).toMatchObject({
      stage: 'relance',
      last_message_at: '2026-10-01T10:00:00.000Z',
      first_contact_at: '2026-10-01T10:00:00.000Z',
      last_relance_method: 'instagram',
      next_relance_at: '2026-10-08T10:00:00.000Z',
    });
  });

  it('does not move last_message_at back for an older action, and update_deal=false leaves the deal alone', async () => {
    const { deal } = await seed();
    await ok('log_activity', { deal_id: deal.id, kind: 'email_sent', channel: 'email', date: '2026-10-02T10:00:00Z' });
    const r = await ok('log_activity', { deal_id: deal.id, kind: 'call', channel: 'phone', date: '2026-09-01T10:00:00Z' });
    expect(r.deal.last_message_at).toBe('2026-10-02T10:00:00Z');
    const r2 = await ok('log_activity', { deal_id: deal.id, kind: 'message', channel: 'whatsapp', update_deal: false });
    expect(r2.deal.last_relance_method).toBe('phone');
  });

  it('rejects an unknown kind or channel with the valid values', async () => {
    const { deal } = await seed();
    expect(await fails('log_activity', { deal_id: deal.id, kind: 'pigeon' })).toContain('email_sent');
    expect(await fails('log_activity', { deal_id: deal.id, kind: 'call', channel: 'fax' })).toContain('whatsapp');
    expect(await fails('log_activity', { kind: 'call' })).toContain('deal_id');
  });
});

describe('move_stage', () => {
  it('changes the stage like update_stage, logs history and returns the full deal', async () => {
    const { deal } = await seed();
    const r = await ok('move_stage', { id: deal.id, stage: 'a_suivre', note: 'Intéressés pour 2027', expected_updated_at: deal.updated_at });
    expect(r.previous_stage).toBe('a_contacter');
    expect(r.deal).toMatchObject({ id: deal.id, stage: 'a_suivre', display_name: 'Date Périscope 2027' });
    expect(r.note.content).toBe('Intéressés pour 2027');
    expect((await ok('get_deal', { id: deal.id })).stage_history).toHaveLength(1);
  });

  it('refuses an unknown stage (listing valid ones) and a version conflict', async () => {
    const { deal } = await seed();
    expect(await fails('move_stage', { id: deal.id, stage: 'booké' })).toContain('a_contacter, contacte, relance, repondu, a_suivre, confirme, termine, refuse');
    mem.touch('deals', deal.id);
    expect(await fails('move_stage', { id: deal.id, stage: 'contacte', expected_updated_at: deal.updated_at })).toContain('Conflit de version');
    expect(mem.db.deals[0].stage).toBe('a_contacter');
  });
});

describe('set_follow_up', () => {
  it('sets and clears the follow-up date (kept even when the stage auto-computes one)', async () => {
    const { deal } = await seed();
    await ok('log_activity', { deal_id: deal.id, kind: 'email_sent', channel: 'email', date: '2026-10-01T10:00:00.000Z', stage: 'contacte' });
    const r = await ok('set_follow_up', { deal_id: deal.id, date: '2026-10-20' });
    expect(r.next_relance_at).toBe('2026-10-20');
    expect((await ok('set_follow_up', { deal_id: deal.id, date: null })).next_relance_at).toBeNull();
  });

  it('refuses a follow-up on a closed deal and an invalid date', async () => {
    const { deal } = await seed();
    await ok('move_stage', { id: deal.id, stage: 'refuse' });
    expect(await fails('set_follow_up', { deal_id: deal.id, date: '2026-12-01' })).toContain('move_stage');
    expect(await fails('set_follow_up', { deal_id: deal.id, date: '31/12/2026' })).toContain('YYYY-MM-DD');
  });
});

// ------------------------------------------------------------------ bulk

describe('bulk_update', () => {
  async function three() {
    const v = await ok('create_venue', { name: 'V' });
    return [await ok('create_deal', { venue_id: v.id }), await ok('create_deal', { venue_id: v.id }), await ok('create_deal', { venue_id: v.id, priority: 'high' })];
  }

  it('is a dry run by default: shows before → after and writes nothing', async () => {
    const deals = await three();
    const r = await ok('bulk_update', { entity: 'deal', items: deals.map((d: any) => ({ id: d.id, patch: { priority: 'high' } })) });
    expect(r.dry_run).toBe(true);
    expect(r.summary).toMatchObject({ total: 3, will_change: 2, unchanged: 1, errors: 0 });
    expect(r.items[0].changes).toEqual({ priority: { from: 'medium', to: 'high' } });
    expect(r.next_step).toContain('dry_run=false');
    expect(mem.db.deals.filter((d) => d.priority === 'high')).toHaveLength(1);
  });

  it('applies with dry_run=false and returns the full objects', async () => {
    const deals = await three();
    const r = await ok('bulk_update', { entity: 'deal', dry_run: false, items: deals.map((d: any) => ({ id: d.id, patch: { tags: ['festival-2027'] }, expected_updated_at: d.updated_at })) });
    expect(r.summary.applied).toBe(3);
    expect(r.items[0]).toMatchObject({ tags: ['festival-2027'], archived: false });
    expect(mem.db.deals.every((d) => (d.tags as string[]).includes('festival-2027'))).toBe(true);
  });

  it('applies nothing when one item is invalid or in conflict', async () => {
    const deals = await three();
    mem.touch('deals', deals[2].id);
    const items = [
      { id: deals[0].id, patch: { stage: 'booké' } },
      { id: deals[1].id, patch: { priority: 'low' } },
      { id: deals[2].id, patch: { priority: 'low' }, expected_updated_at: deals[2].updated_at },
    ];
    const preview = await ok('bulk_update', { entity: 'deal', items });
    expect(preview.items.map((i: any) => i.status)).toEqual(['error', 'will_change', 'error']);
    expect(preview.items[2].error).toContain('Conflit de version');
    expect(await fails('bulk_update', { entity: 'deal', items, dry_run: false })).toContain("Rien n'a été appliqué");
    expect(mem.db.deals.filter((d) => d.priority === 'low')).toHaveLength(0);
  });

  it('caps at 50 items and refuses duplicate ids', async () => {
    const items = Array.from({ length: 51 }, () => ({ id: MISSING, patch: { priority: 'low' } }));
    expect(await fails('bulk_update', { entity: 'deal', items })).toMatch(/50/);
    expect(await fails('bulk_update', { entity: 'deal', items: items.slice(0, 2) })).toContain('plusieurs fois');
  });
});

// ------------------------------------------------------------------ radar compatibility

describe('radar compatibility', () => {
  it('a radar lead is visible to the full toolset by its external_id, and update_stage still works', async () => {
    const r = await ok('add_to_pipeline', { external_id: 'fe-042', category: 'festivals', name: 'Hellfest', city: 'Clisson' });
    const found = await ok('list_deals', { external_source: 'radar', external_id: 'fe-042' });
    expect(found.items.map((d: any) => d.id)).toEqual([r.id]);
    const u = await ok('update_stage', { id: r.id, stage: 'contacte' });
    expect(u).toEqual({ id: r.id, previous_stage: 'a_contacter', stage: 'contacte', url: `${BASE}/pipeline?deal=${r.id}` });
    const audit = await ok('get_audit_log', { tool: 'update_stage' });
    expect(audit.items[0]).toMatchObject({ entity: 'deal', entity_id: r.id, action: 'update' });
  });
});

// ------------------------------------------------------------------ prospection

describe('venue qualification fields', () => {
  it('stores style, similar bands, lead time and do-not-contact date; list_venues filters on them', async () => {
    const a = await ok('create_venue', { name: 'Le Sonic', style_fit: 'yes', similar_bands: 'Lebanon Hanover, Rendez-Vous', booking_lead_months: 6 });
    const b = await ok('create_venue', { name: 'Bar Rock', style_fit: 'no', do_not_contact_until: '2099-01-01' });
    await ok('create_venue', { name: 'Pas évalué' });
    expect((await ok('list_venues', { style_fit: 'yes' })).items.map((v: any) => v.id)).toEqual([a.id]);
    expect((await ok('list_venues', { style_fit: ['yes', 'maybe'] })).items).toHaveLength(1);
    expect((await ok('list_venues', { contactable: false })).items.map((v: any) => v.id)).toEqual([b.id]);
    expect((await ok('list_venues', { contactable: true })).items.map((v: any) => v.id)).not.toContain(b.id);
    expect(await fails('create_venue', { name: 'X', style_fit: 'oui' })).toContain('yes, maybe, no');
    expect(await fails('create_venue', { name: 'X', application_deadline: '15/01' })).toContain('MM-DD');
    expect((await ok('search', { query: 'lebanon hanover' })).results[0].id).toBe(a.id);
  });
});

describe('list_application_deadlines', () => {
  const md = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(5, 10);

  it('lists the next annual deadlines within the window, most urgent first, with the pipeline flag', async () => {
    const soon = await ok('create_venue', { name: 'Fest Soon', type: 'festival', application_deadline: md(10), application_url: 'https://fest.example/apply' });
    const later = await ok('create_venue', { name: 'Fest Later', type: 'festival', application_opens: md(20), application_deadline: md(40) });
    await ok('create_venue', { name: 'Fest Far', type: 'festival', application_deadline: md(200) });
    await ok('create_deal', { venue_id: later.id });
    const r = await ok('list_application_deadlines', {});
    expect(r.items.map((i: any) => i.name)).toEqual(['Fest Soon', 'Fest Later']);
    expect(r.items[0]).toMatchObject({ venue_id: soon.id, status: 'open', days_left: 10, application_url: 'https://fest.example/apply', in_pipeline: false });
    expect(r.items[1]).toMatchObject({ status: 'upcoming', in_pipeline: true });
    expect((await ok('list_application_deadlines', { include_in_pipeline: false })).items.map((i: any) => i.name)).toEqual(['Fest Soon']);
    expect((await ok('list_application_deadlines', { within_days: 365 })).items).toHaveLength(3);
    expect((await ok('get_venue', { id: soon.id })).application_window).toMatchObject({ days_left: 10 });
  });

  it('rejects an out-of-range window', async () => {
    expect(await fails('list_application_deadlines', { within_days: 0 })).toMatch(/within_days|>=|1/);
  });
});

describe('groupes amis on deals', () => {
  it('link_band_to_deal / unlink_band_from_deal manage the bill, reversibly, and show on both sides', async () => {
    const { deal } = await seed();
    const band = await ok('create_band', { name: 'Rendez-Vous', city: 'Paris', exchange_status: 'they_owe' });
    let r = await ok('link_band_to_deal', { deal_id: deal.id, band_id: band.id, role: 'support' });
    expect(r.bands).toEqual([expect.objectContaining({ role: 'support', band: expect.objectContaining({ id: band.id }) })]);
    r = await ok('link_band_to_deal', { deal_id: deal.id, band_id: band.id, role: 'co_bill' });
    expect(r.bands).toHaveLength(1);
    expect(r.bands[0].role).toBe('co_bill');
    expect((await ok('get_deal', { id: deal.id })).bands).toHaveLength(1);
    expect((await ok('get_band', { id: band.id })).deals_together[0].deal.id).toBe(deal.id);
    expect((await ok('list_bands', { exchange_status: 'they_owe' })).items.map((b: any) => b.id)).toEqual([band.id]);

    const un = await ok('unlink_band_from_deal', { deal_id: deal.id, band_id: band.id });
    expect(un.bands).toEqual([]);
    expect(mem.db.deal_bands[0].deleted_at).not.toBeNull(); // soft: never deleted
    expect(await fails('unlink_band_from_deal', { deal_id: deal.id, band_id: band.id })).toContain("n'est pas associé");
    r = await ok('link_band_to_deal', { deal_id: deal.id, band_id: band.id });
    expect(r.bands[0].role).toBe('co_bill');
    expect(mem.db.deal_bands).toHaveLength(1);
  });

  it('refuses unknown or archived bands and unknown roles', async () => {
    const { deal } = await seed();
    expect(await fails('link_band_to_deal', { deal_id: deal.id, band_id: MISSING })).toContain('introuvable');
    const band = await ok('create_band', { name: 'X' });
    expect(await fails('link_band_to_deal', { deal_id: deal.id, band_id: band.id, role: 'opener' })).toContain('headliner, support, co_bill');
    await ok('archive_band', { id: band.id });
    expect(await fails('link_band_to_deal', { deal_id: deal.id, band_id: band.id })).toContain('archivé');
  });
});

describe('briefings', () => {
  it('save_briefing stores one briefing per week (replacing it) and get_briefing returns the latest', async () => {
    const a = await ok('save_briefing', { title: 'Semaine 41', content: '# Relances\n- Le Périscope', week_start: '2026-10-07' });
    expect(a).toMatchObject({ week_start: '2026-10-05', replaced: false, title: 'Semaine 41' });
    const b = await ok('save_briefing', { title: 'Semaine 41 (v2)', content: 'maj', week_start: '2026-10-05' });
    expect(b).toMatchObject({ id: a.id, replaced: true });
    await ok('save_briefing', { title: 'Semaine 40', content: 'old', week_start: '2026-09-28' });
    expect((await ok('get_briefing')).title).toBe('Semaine 41 (v2)');
    expect((await ok('get_briefing', { week_start: '2026-09-30' })).title).toBe('Semaine 40');
    expect(await fails('get_briefing', { week_start: '2020-01-01' })).toContain('Aucun briefing');
    expect((await ok('get_audit_log', { entity: 'briefing' })).items.length).toBeGreaterThan(0);
  });

  it('rejects an empty briefing', async () => {
    expect(await fails('save_briefing', { title: 'x', content: '' })).toMatch(/content/);
  });
});
