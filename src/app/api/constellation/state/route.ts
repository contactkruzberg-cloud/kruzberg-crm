import { loadDb, mutate } from '@/lib/constellation/docs';
import { enqueueManagers, needsManagersBackfill, needsScrub, scrub, seed } from '@/lib/constellation/engine';
import { crmKnown, kick, ownerStore, routineConfigured } from '@/lib/constellation/server';
import { packFindings, slimBand } from '@/lib/constellation/wire';

// Données de la page /constellation. La page calcule elle-même le classement
// (aggregate) : on n'envoie les faits qu'une fois, en version allégée (wire.ts) ;
// les fiches chargent le reste à leur ouverture (../detail). Avec ?light=1,
// seulement la file des recherches et un tampon : la page ne recharge tout que
// s'il a changé.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function GET(request: Request) {
  const auth = await ownerStore();
  if ('error' in auth) return auth.error;
  const { store } = auth;

  // Une routine arrêtée en route est relancée ; un lancement raté est signalé sur la page.
  await kick(store).catch((e) => console.error('[constellation] kick failed', e));

  let { db, launch } = await loadDb(store);
  if (!db.bands.length && !db.watch.length) {
    await mutate(store, (l) => seed(l.db));
    ({ db, launch } = await loadDb(store));
  }
  if (needsScrub(db)) {
    await mutate(store, (l) => scrub(l.db));
    ({ db, launch } = await loadDb(store));
  }
  // One-time: managers of the bands explored before managers were tracked.
  if (needsManagersBackfill(db)) {
    await mutate(store, (l) => {
      if (needsManagersBackfill(l.db)) enqueueManagers(l.db);
    });
    await kick(store).catch((e) => console.error('[constellation] kick failed', e));
    ({ db, launch } = await loadDb(store));
  }
  const [last] = await store.select('constellation_docs', { order: [{ col: 'updated_at', asc: false }], limit: 1 });
  const stamp = `${last?.updated_at ?? ''}|${db.bands.length}|${db.jobs.length}`;
  // The last searches, plus every recent question asked from the page (their answers live on the job).
  const asks = db.jobs.filter((j) => j.kind === 'ask').slice(-30);
  const jobs = [...db.jobs.filter((j) => j.kind !== 'ask').slice(-40), ...asks].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const routine = { configured: routineConfigured(), error: launch.error, sessionUrl: launch.sessionUrl, activeAt: launch.activeAt };

  if (new URL(request.url).searchParams.get('light')) return json({ stamp, jobs, routine });

  const crm = await crmKnown(store);
  return json({
    stamp,
    bands: db.bands.map(slimBand),
    findings: packFindings(db.findings),
    overrides: db.overrides,
    watch: db.watch,
    jobs,
    crm,
    synthesis: db.synthesis,
    routine,
  });
}
