/* eslint-disable @typescript-eslint/no-explicit-any -- documents in tests */
import { beforeEach, describe, expect, it } from 'vitest';
import { radarBatch, radarGet } from '../radar';
import { merge3, radarSyncAck, radarSyncBaseline, radarSyncPush, radarSyncRefetch, radarSyncStatus, type ArtifactWrite } from '../radar-sync';
import { createMemoryStore } from './memory-store';

// Simulated artifact database, with the ArtifactData rules: versions bumped on
// every write, writes to existing docs pinned with if_version, __delete__ in updates.
function createArtifact() {
  const docs = new Map<string, { version: number; data: Record<string, unknown> }>();
  return {
    docs,
    put(id: string, data: Record<string, unknown>) {
      const cur = docs.get(id);
      docs.set(id, { version: (cur?.version ?? 0) + 1, data });
    },
    patch(id: string, patch: Record<string, unknown>) {
      const cur = docs.get(id)!;
      this.put(id, { ...cur.data, ...patch });
    },
    versions: () => Object.fromEntries([...docs].map(([id, d]) => [id, d.version])),
    /** Applies writes like ArtifactData batch; returns acks for the successful ones. */
    apply(writes: ArtifactWrite[]) {
      const acks: { id: string; version: number }[] = [];
      for (const w of writes) {
        const cur = docs.get(w.doc_id);
        if (cur && w.if_version !== cur.version) continue; // conflict: refused
        if (w.op === 'set') docs.set(w.doc_id, { version: (cur?.version ?? 0) + 1, data: w.data });
        else {
          const next: Record<string, unknown> = { ...cur!.data };
          for (const [k, v] of Object.entries(w.data)) {
            if (v && typeof v === 'object' && (v as any).__delete__) delete next[k];
            else next[k] = v;
          }
          docs.set(w.doc_id, { version: cur!.version + 1, data: next });
        }
        acks.push({ id: w.doc_id, version: docs.get(w.doc_id)!.version });
      }
      return acks;
    },
  };
}

let mem: ReturnType<typeof createMemoryStore>;
let art: ReturnType<typeof createArtifact>;
const deps = () => ({ store: mem.store });

/** One full hourly pass of the sync task, as the cloud task performs it. */
async function syncPass(collection: 'leads' | 'outbox' = 'leads') {
  const status = await radarSyncStatus(deps(), { collection, artifact_versions: art.versions() });
  let writes = [...status.artifact_writes];
  if (status.fetch.length) {
    const pushed = await radarSyncPush(deps(), {
      collection,
      docs: status.fetch.map((id) => ({ id, version: art.docs.get(id)!.version, data: structuredClone(art.docs.get(id)!.data) })),
    });
    writes = writes.concat(pushed.artifact_writes);
  }
  const acks = art.apply(writes);
  await radarSyncAck(deps(), { collection, results: acks });
  return { fetched: status.fetch.length, written: writes.length, acked: acks.length };
}
const crm = async (id: string) => (await radarGet(deps(), { collection: 'leads', id })).data as any;
const crmUpdate = async (id: string, data: Record<string, unknown>) => {
  const cur = await radarGet(deps(), { collection: 'leads', id });
  await radarBatch(deps(), { allow_owner_fields: true, writes: [{ op: 'update', collection: 'leads', id, data, if_version: cur.version }] });
};
const lead = (name: string, over: Record<string, unknown> = {}) => ({ name, city: 'Lyon', cat: 'booking_fr', status: 'nouveau', dismissed: false, ...over });

beforeEach(async () => {
  mem = createMemoryStore();
  art = createArtifact();
  // Initial state: artifact docs, imported into the CRM, then baselined.
  art.put('a', lead('A', { email: 'prog@a.fr' }));
  art.put('a', lead('A', { email: 'prog@a.fr', fit: 3 })); // version 2
  art.put('b', lead('B'));
  await radarBatch(deps(), { writes: [...art.docs].map(([id, d]) => ({ op: 'set' as const, collection: 'leads' as const, id, data: structuredClone(d.data) })) });
  await radarSyncBaseline(deps(), { collection: 'leads' });
});

describe('radar sync artifact ⇄ CRM', () => {
  it('first pass after import adopts the artifact versions and changes nothing', async () => {
    expect(await syncPass()).toEqual({ fetched: 0, written: 0, acked: 0 });
    expect(await syncPass()).toEqual({ fetched: 0, written: 0, acked: 0 });
  });

  it('brings the daily search (new lead, updated contact) from the artifact into the CRM', async () => {
    await syncPass();
    art.put('c', lead('C', { addedAt: '2026-10-05', source: 'veille auto' }));
    art.patch('a', { email: 'booking@a.fr', emailSource: 'https://a.fr/contact' });
    expect(await syncPass()).toMatchObject({ fetched: 2, written: 0 });
    expect(await crm('c')).toMatchObject({ name: 'C', source: 'veille auto' });
    expect(await crm('a')).toMatchObject({ email: 'booking@a.fr', emailSource: 'https://a.fr/contact', fit: 3 });
    expect(await syncPass()).toEqual({ fetched: 0, written: 0, acked: 0 });
  });

  it("brings Greg's triage in the CRM back to the artifact", async () => {
    await syncPass();
    await crmUpdate('b', { dismissed: true, dismissReason: 'Pas le style', dismissedAt: '2026-10-05' });
    expect(await syncPass()).toMatchObject({ fetched: 0, written: 1, acked: 1 });
    expect(art.docs.get('b')!.data).toMatchObject({ dismissed: true, dismissReason: 'Pas le style' });
    expect(await syncPass()).toEqual({ fetched: 0, written: 0, acked: 0 });
  });

  it('merges changes made on both sides to different fields', async () => {
    await syncPass();
    art.patch('a', { email: 'booking@a.fr' });
    await crmUpdate('a', { status: 'à contacter', notes: 'Écrire en novembre' });
    await syncPass();
    const expected = { email: 'booking@a.fr', status: 'à contacter', notes: 'Écrire en novembre', fit: 3 };
    expect(await crm('a')).toMatchObject(expected);
    expect(art.docs.get('a')!.data).toMatchObject(expected);
    expect(await syncPass()).toEqual({ fetched: 0, written: 0, acked: 0 });
  });

  it('on a real conflict, keeps the CRM for triage fields and the artifact for factual fields', async () => {
    await syncPass();
    art.patch('a', { status: 'contacté', email: 'artifact@a.fr' });
    await crmUpdate('a', { status: 'refusé', email: 'crm@a.fr' });
    await syncPass();
    expect(await crm('a')).toMatchObject({ status: 'refusé', email: 'artifact@a.fr' });
    expect(art.docs.get('a')!.data).toMatchObject({ status: 'refusé', email: 'artifact@a.fr' });
  });

  it('creates in the artifact what was added in the CRM (manual lead, outbox draft)', async () => {
    await syncPass();
    await radarBatch(deps(), { writes: [{ op: 'set', collection: 'leads', id: 'manual1', data: lead('Manuelle', { source: 'manuel' }) }] });
    expect(await syncPass()).toMatchObject({ written: 1, acked: 1 });
    expect(art.docs.get('manual1')!.data).toMatchObject({ name: 'Manuelle' });
    expect(await syncPass()).toEqual({ fetched: 0, written: 0, acked: 0 });
  });

  it('propagates a removed field as __delete__', async () => {
    await syncPass();
    const cur = await radarGet(deps(), { collection: 'leads', id: 'a' });
    await radarBatch(deps(), { writes: [{ op: 'update', collection: 'leads', id: 'a', data: { email: { __delete__: true } }, if_version: cur.version }] });
    await syncPass();
    expect(art.docs.get('a')!.data).not.toHaveProperty('email');
  });

  it('loses nothing when the artifact changes between the status and the write (refused write, redone next hour)', async () => {
    await syncPass();
    await crmUpdate('b', { status: 'à contacter' });
    const status = await radarSyncStatus(deps(), { collection: 'leads', artifact_versions: art.versions() });
    art.patch('b', { email: 'new@b.fr' }); // the daily search writes meanwhile
    const acks = art.apply(status.artifact_writes);
    expect(acks).toEqual([]); // refused (version moved)
    await radarSyncAck(deps(), { collection: 'leads', results: acks });
    await syncPass();
    const expected = { status: 'à contacter', email: 'new@b.fr' };
    expect(await crm('b')).toMatchObject(expected);
    expect(art.docs.get('b')!.data).toMatchObject(expected);
  });

  it('baseline is resumable (only missing states are added)', async () => {
    expect(await radarSyncBaseline(deps(), { collection: 'leads' })).toMatchObject({ baselined: 0, already: 2 });
  });

  it('without any baseline, the first pass adopts docs present on both sides (interrupted initialisation)', async () => {
    mem = createMemoryStore();
    await radarBatch(deps(), { writes: [...art.docs].map(([id, d]) => ({ op: 'set' as const, collection: 'leads' as const, id, data: structuredClone(d.data) })) });
    const status = await radarSyncStatus(deps(), { collection: 'leads', artifact_versions: art.versions() });
    expect(status).toMatchObject({ initialised: 2, fetch: [], artifact_writes: [] });
    expect(await syncPass()).toEqual({ fetched: 0, written: 0, acked: 0 });
    art.patch('a', { email: 'x@a.fr' });
    expect(await syncPass()).toMatchObject({ fetched: 1 });
    expect(await crm('a')).toMatchObject({ email: 'x@a.fr' });
  });
});

describe('radar_sync_refetch', () => {
  it('repairs an artifact change that was adopted as identical', async () => {
    art.patch('a', { audit: 'ok' }); // changed before the first pass, then adopted as equal
    await syncPass();
    expect(await crm('a')).not.toHaveProperty('audit');
    await radarSyncRefetch(deps(), { collection: 'leads', ids: ['a'] });
    expect(await syncPass()).toMatchObject({ fetched: 1 });
    expect(await crm('a')).toMatchObject({ audit: 'ok' });
  });
});

describe('merge3', () => {
  it('takes the side that changed, and resolves conflicts by field kind', () => {
    const base = { a: 1, status: 'x', email: 'e' };
    expect(merge3(base, { a: 2, status: 'x', email: 'e' }, { a: 1, status: 'y', email: 'e' })).toEqual({ a: 2, status: 'y', email: 'e' });
    expect(merge3(base, { a: 1, status: 'p', email: 'art' }, { a: 1, status: 'q', email: 'crm' })).toEqual({ a: 1, status: 'q', email: 'art' });
    expect(merge3(null, { name: 'A', notes: 'art' }, { name: 'A', notes: 'crm' })).toEqual({ name: 'A', notes: 'crm' });
  });
});
