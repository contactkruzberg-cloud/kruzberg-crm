/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-RPC payloads in tests */
import { beforeEach, describe, expect, it } from 'vitest';
import { createMcpHandler } from 'mcp-handler';
import { registerFullCrmTools } from '@/lib/mcp/crm-tools';
import { createMemoryStore } from '@/lib/mcp/__tests__/memory-store';
import { aggregate } from '../aggregate';
import { loadDb, mutate } from '../docs';
import { applyAction, seed, workersToFire, STALE_MS } from '../engine';

let mem: ReturnType<typeof createMemoryStore>;
let handler: (req: Request) => Promise<Response>;
let rpcId = 0;

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await handler(
    new Request('https://crm.test/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
    }),
  );
  const body = await res.text();
  const data = body.split('\n').find((l) => l.startsWith('data: '));
  const { result } = JSON.parse(data ? data.slice(6) : body);
  return result as { isError?: boolean; content: { text: string }[]; structuredContent?: any };
}
const ok = async (n: string, a: Record<string, unknown> = {}) => {
  const r = await call(n, a);
  if (r.isError) throw new Error(r.content[0].text);
  return r.structuredContent;
};

const bandOutput = (venue = 'Le Périscope') => ({
  band: { city: 'Lyon', country: 'France', genre: 'garage', summary: 'Parcours.', lesson: 'Leçon.' },
  findings: [
    { kind: 'salle', name: venue, city: 'Lyon', when: '2025', sourceUrl: 'https://example.org/a' },
    { kind: 'label', name: "Howlin' Banana Records", sourceUrl: 'https://example.org/b' },
    { kind: 'label', name: 'Autoproduction', sourceUrl: 'https://example.org/c' },
    { kind: 'salle', name: 'Sans source' },
  ],
  milestones: [{ year: 2019, stage: 'formation', title: 'Formation', sourceUrl: 'https://example.org/d' }],
});

beforeEach(async () => {
  mem = createMemoryStore();
  const ctx = { store: mem.store, baseUrl: 'https://crm.test', actor: 'test', take: () => 0 };
  handler = createMcpHandler((s) => registerFullCrmTools(s, ctx), { serverInfo: { name: 'kruzberg-crm', version: 'test' } });
  await mutate(mem.store, (l) => seed(l.db));
});

describe('constellation : stockage', () => {
  it('seeds the niche once and reads it back from the document table', async () => {
    const { db } = await loadDb(mem.store);
    expect(db.bands.map((b) => b.id)).toContain('johnnie-carwash');
    expect(db.watch.length).toBeGreaterThan(0);
    await mutate(mem.store, (l) => seed(l.db));
    expect((await loadDb(mem.store)).db.bands).toHaveLength(db.bands.length);
  });

  it('writes only the documents that changed', async () => {
    const before = await mem.store.select('constellation_docs');
    await mutate(mem.store, (l) => applyAction(l, { type: 'entity', key: 'lieu:sonic', note: 'Contact : la prog' }));
    const after = await mem.store.select('constellation_docs');
    expect(after.length).toBe(before.length + 1);
    expect(after.filter((r) => Number(r.version) > 1)).toHaveLength(0);
  });
});

describe('constellation : file des recherches par la routine', () => {
  it('hands the next search with its instructions, files the sourced findings and drops noise', async () => {
    await mutate(mem.store, (l) => applyAction(l, { type: 'exploreBand', id: 'johnnie-carwash' }));
    const brief = await ok('constellation_next_job');
    expect(brief.job).toMatchObject({ kind: 'band', label: 'Johnnie Carwash' });
    expect(brief.instructions).toContain('Johnnie Carwash');
    expect(brief.output_schema).toHaveProperty('properties.findings');
    expect(brief.web_search).toBe(true);

    const r = await ok('constellation_submit_job', { job_id: brief.job.id, output: bandOutput() });
    expect(r).toMatchObject({ status: 'done', added: 2, remaining: 0 });

    const { db } = await loadDb(mem.store);
    const b = db.bands.find((x) => x.id === 'johnnie-carwash')!;
    expect(b).toMatchObject({ status: 'done', city: 'Lyon', scene: 'lyon' });
    expect(b.milestones).toHaveLength(1);
    expect(db.findings.map((f) => f.name).sort()).toEqual(["Howlin' Banana Records", 'Le Périscope']);
    expect(aggregate(db).find((e) => e.key === 'lieu:periscope')?.bandIds).toEqual(['johnnie-carwash']);
    expect(await ok('constellation_next_job')).toEqual({ job: null, remaining: 0 });
  });

  it('replaces the previous findings of a band when it is explored again', async () => {
    for (const venue of ['Le Périscope', 'Le Sonic']) {
      await mutate(mem.store, (l) => applyAction(l, { type: 'exploreBand', id: 'sunday-panic' }));
      const brief = await ok('constellation_next_job');
      await ok('constellation_submit_job', { job_id: brief.job.id, output: bandOutput(venue) });
    }
    const { db } = await loadDb(mem.store);
    expect(db.findings.filter((f) => f.bandId === 'sunday-panic').map((f) => f.name)).toContain('Le Sonic');
    expect(db.findings.some((f) => f.name === 'Le Périscope')).toBe(false);
  });

  it('records a failed search on the band, and refuses a result for a search that is not running', async () => {
    await mutate(mem.store, (l) => applyAction(l, { type: 'exploreBand', id: 'cust' }));
    const brief = await ok('constellation_next_job');
    await ok('constellation_submit_job', { job_id: brief.job.id, error: 'Aucune source trouvée.' });
    const { db } = await loadDb(mem.store);
    expect(db.bands.find((b) => b.id === 'cust')).toMatchObject({ status: 'error', error: 'Aucune source trouvée.' });
    const again = await call('constellation_submit_job', { job_id: brief.job.id, output: bandOutput() });
    expect(again.isError).toBe(true);
    expect(again.content[0].text).toContain('n’est pas en cours');
  });

  it('refuses an output that does not follow the schema, and keeps the search running', async () => {
    await mutate(mem.store, (l) => applyAction(l, { type: 'exploreBand', id: 'cust' }));
    const brief = await ok('constellation_next_job');
    const bad = await call('constellation_submit_job', { job_id: brief.job.id, output: { nope: true } });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toContain('output_schema');
    expect((await loadDb(mem.store)).db.jobs[0].status).toBe('running');
  });

  it('serves discoveries before bands, and adds very close discoveries as retained bands', async () => {
    await mutate(mem.store, (l) => {
      applyAction(l, { type: 'exploreBand', id: 'cust' });
      applyAction(l, { type: 'discover', angle: 'france_niche' });
    });
    const brief = await ok('constellation_next_job');
    expect(brief.job.kind).toBe('discover');
    await ok('constellation_submit_job', {
      job_id: brief.job.id,
      output: { bands: [{ name: 'Nouveau Groupe', city: 'Paris', country: 'France', fit: 5, why: 'Très proche' }, { name: 'Loin', fit: 2 }, { name: 'CUST', fit: 5 }] },
    });
    const { db } = await loadDb(mem.store);
    expect(db.bands.find((b) => b.id === 'nouveau-groupe')).toMatchObject({ status: 'idle', origin: 'decouverte', fit: 5 });
    expect(db.bands.find((b) => b.id === 'loin')?.status).toBe('suggested');
    expect(db.bands.filter((b) => b.id === 'cust')).toHaveLength(1);
  });
});

describe('constellation : réveil de la routine', () => {
  it('fires one routine per queued search up to the cap, waits for a recent launch, and requeues abandoned searches', async () => {
    const l = await loadDb(mem.store);
    for (const id of ['cust', 'gliitch', 'bleakness', 'gurriers']) applyAction(l, { type: 'exploreBand', id });
    const now = Date.now();
    expect(workersToFire(l.db, { fires: [] }, now)).toBe(3);
    expect(workersToFire(l.db, { fires: [new Date(now - 60_000).toISOString()] }, now)).toBe(0);
    l.db.jobs[0].status = 'running';
    l.db.jobs[0].startedAt = new Date(now - 60_000).toISOString();
    expect(workersToFire(l.db, { fires: [] }, now)).toBe(2);

    await mutate(mem.store, (m) => {
      m.db.jobs = l.db.jobs;
      m.db.jobs[0].startedAt = new Date(now - STALE_MS - 1000).toISOString();
    });
    const brief = await ok('constellation_next_job');
    expect(brief.remaining).toBe(3);
    const { db } = await loadDb(mem.store);
    expect(db.jobs.filter((j) => j.status === 'running')).toHaveLength(1);
  });

  it('hands off to a new routine only when one is configured', async () => {
    expect(await ok('constellation_handoff')).toEqual({ fired: 0, error: 'Routine Constellation non configurée.' });
  });
});
