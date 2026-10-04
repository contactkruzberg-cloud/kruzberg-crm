/* eslint-disable @typescript-eslint/no-explicit-any -- JSON-RPC payloads in tests */
import { beforeEach, describe, expect, it } from 'vitest';
import { createMcpHandler } from 'mcp-handler';
import { registerFullCrmTools } from '../crm-tools';
import { registerRadarTools } from '../tools';
import { createMemoryStore } from './memory-store';

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
const fails = async (n: string, a: Record<string, unknown> = {}) => {
  const r = await call(n, a);
  expect(r.isError, n).toBe(true);
  return r.content[0].text;
};

const lead = (over: Record<string, unknown> = {}) => ({
  cat: 'booking_fr', name: 'Le Sonic', city: 'Lyon', status: 'nouveau', dismissed: false, addedAt: '2026-10-04', source: 'veille auto', fit: 3, ...over,
});

beforeEach(() => {
  mem = createMemoryStore();
  const ctx = { store: mem.store, baseUrl: 'https://crm.test', actor: 'test', take: () => 0 };
  handler = createMcpHandler((s) => {
    registerRadarTools(s, ctx);
    registerFullCrmTools(s, ctx);
  }, { serverInfo: { name: 'kruzberg-crm', version: 'test' } });
});

describe('radar_batch', () => {
  it('creates documents with "set" (version 1) and refuses an existing one without if_version', async () => {
    const r = await ok('radar_batch', { writes: [
      { op: 'set', collection: 'leads', id: 'bf-20261005-01', data: lead() },
      { op: 'set', collection: 'config', id: 'meta', data: { date: '2026-10-05', added: 1, summary: 'x' } },
    ] });
    expect(r.results).toEqual([
      expect.objectContaining({ id: 'bf-20261005-01', op: 'create', version: 1 }),
      expect.objectContaining({ id: 'meta', op: 'create', version: 1 }),
    ]);
    const msg = await fails('radar_batch', { writes: [{ op: 'set', collection: 'config', id: 'meta', data: { date: 'y' } }] });
    expect(msg).toContain('if_version');
  });

  it('updates with a shallow merge pinned to the version, supports __delete__, and refuses stale versions without writing anything', async () => {
    await ok('radar_batch', { writes: [{ op: 'set', collection: 'leads', id: 'a', data: lead({ email: 'old@x.fr', emailGeneric: 'info@x.fr' }) }] });
    const u = await ok('radar_batch', { writes: [{ op: 'update', collection: 'leads', id: 'a', if_version: 1, data: { email: 'prog@x.fr', emailGeneric: { __delete__: true } } }] });
    expect(u.results[0].version).toBe(2);
    const doc = await ok('radar_get', { collection: 'leads', id: 'a' });
    expect(doc.data).toMatchObject({ name: 'Le Sonic', email: 'prog@x.fr' });
    expect(doc.data).not.toHaveProperty('emailGeneric');

    await ok('radar_batch', { writes: [{ op: 'set', collection: 'leads', id: 'b', data: lead({ name: 'B' }) }] });
    const msg = await fails('radar_batch', { writes: [
      { op: 'update', collection: 'leads', id: 'b', if_version: 1, data: { fit: 2 } },
      { op: 'update', collection: 'leads', id: 'a', if_version: 1, data: { fit: 1 } }, // stale (now 2)
    ] });
    expect(msg).toContain('Conflit de version');
    expect((await ok('radar_get', { collection: 'leads', id: 'b' })).data.fit).toBe(3); // nothing written
  });

  it("protects Greg's fields on leads unless allow_owner_fields", async () => {
    await ok('radar_batch', { writes: [{ op: 'set', collection: 'leads', id: 'a', data: lead() }] });
    expect(await fails('radar_batch', { writes: [{ op: 'update', collection: 'leads', id: 'a', if_version: 1, data: { status: 'contacté', crmId: 'x' } }] })).toContain('champs réservés à Greg');
    await ok('radar_batch', { allow_owner_fields: true, writes: [{ op: 'update', collection: 'leads', id: 'a', if_version: 1, data: { status: 'à contacter' } }] });
    expect((await ok('radar_get', { collection: 'leads', id: 'a' })).data.status).toBe('à contacter');
  });

  it('validates collections, ids, update targets, duplicates, the 50-write cap and __delete__ in set', async () => {
    expect(await fails('radar_batch', { writes: [{ op: 'set', collection: 'deals', id: 'a', data: {} }] })).toContain('leads, config, runs, outbox');
    expect(await fails('radar_batch', { writes: [{ op: 'set', collection: 'leads', id: 'a/b', data: {} }] })).toContain('Id de document invalide');
    expect(await fails('radar_batch', { writes: [{ op: 'update', collection: 'leads', id: 'nope', data: { fit: 1 } }] })).toContain('introuvable');
    expect(await fails('radar_batch', { writes: [{ op: 'set', collection: 'leads', id: 'a', data: {} }, { op: 'set', collection: 'leads', id: 'a', data: {} }] })).toContain('plusieurs fois');
    expect(await fails('radar_batch', { writes: Array.from({ length: 51 }, (_, i) => ({ op: 'set', collection: 'runs', id: `r${i}`, data: {} })) })).toMatch(/50/);
    expect(await fails('radar_batch', { writes: [{ op: 'set', collection: 'leads', id: 'a', data: { x: { __delete__: true } } }] })).toContain('__delete__');
  });
});

describe('radar_list / radar_get', () => {
  beforeEach(async () => {
    await ok('radar_batch', { writes: [
      { op: 'set', collection: 'leads', id: 'a', data: lead({ name: 'A', email: 'a@x.fr' }) },
      { op: 'set', collection: 'leads', id: 'b', data: lead({ name: 'B', dismissed: true, dismissReason: 'Pas le style' }) },
      { op: 'set', collection: 'leads', id: 'c', data: lead({ name: 'C' }) },
    ] });
  });

  it('projects fields, filters with where and paginates with a cursor', async () => {
    const p1 = await ok('radar_list', { collection: 'leads', fields: ['name', 'dismissed'], limit: 2 });
    expect(p1.total).toBe(3);
    expect(p1.docs).toEqual([
      { id: 'a', version: 1, data: { name: 'A', dismissed: false } },
      { id: 'b', version: 1, data: { name: 'B', dismissed: true } },
    ]);
    const p2 = await ok('radar_list', { collection: 'leads', fields: ['name'], limit: 2, cursor: p1.next_cursor });
    expect(p2.docs.map((d: any) => d.id)).toEqual(['c']);
    expect(p2.next_cursor).toBeNull();
    expect((await ok('radar_list', { collection: 'leads', where: [['dismissed', 'eq', true]] })).docs.map((d: any) => d.data.dismissReason)).toEqual(['Pas le style']);
    expect((await ok('radar_list', { collection: 'leads', where: [['email', 'missing', null]] })).docs.map((d: any) => d.id)).toEqual(['b', 'c']);
  });

  it('radar_get errors on an unknown document', async () => {
    expect(await fails('radar_get', { collection: 'config', id: 'scope' })).toContain('introuvable');
  });
});
