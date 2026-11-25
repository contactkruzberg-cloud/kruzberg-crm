import { loadDb, mutate, pruneJobs, KEEP_ASKS, KEEP_DONE_JOBS } from '@/lib/constellation/docs';
import { enqueueManagers, needsManagersBackfill, needsScrub, scrub, seed } from '@/lib/constellation/engine';
import { crmKnown, kick, ownerStore, routineConfigured } from '@/lib/constellation/server';
import type { Store } from '@/lib/mcp/store';
import type { Job } from '@/lib/constellation/types';

// Données de la page /constellation. La page calcule elle-même le classement
// (aggregate) : on n'envoie les faits qu'une fois. Avec ?light=1, seulement la
// file des recherches et un tampon du réseau (groupes, faits, réglages) : la
// page ne recharge tout que si le réseau a changé, pas à chaque recherche.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** Changes when the network itself changes (not the queue). */
async function networkStamp(store: Store) {
  const [last] = await store.select('constellation_docs', {
    filters: [{ col: 'collection', op: 'in', value: ['bands', 'findings', 'overrides', 'watch'] }],
    order: [{ col: 'updated_at', asc: false }],
    limit: 1,
  });
  const [syn] = await store.select('constellation_docs', {
    filters: [
      { col: 'collection', op: 'eq', value: 'config' },
      { col: 'id', op: 'eq', value: 'synthesis' },
    ],
    limit: 1,
  });
  return `${last?.updated_at ?? ''}|${syn?.updated_at ?? ''}`;
}

/** The last searches, plus the recent questions asked from the page (their answers live on the job). */
const visibleJobs = (jobs: Job[]) => {
  const asks = jobs.filter((j) => j.kind === 'ask').slice(-KEEP_ASKS);
  return [...jobs.filter((j) => j.kind !== 'ask').slice(-40), ...asks].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
};

export async function GET(request: Request) {
  const auth = await ownerStore();
  if ('error' in auth) return auth.error;
  const { store } = auth;
  const light = !!new URL(request.url).searchParams.get('light');

  // Une routine arrêtée en route est relancée (lecture de la file seule).
  await kick(store).catch((e) => console.error('[constellation] kick failed', e));

  if (light) {
    const [{ db, launch }, stamp] = await Promise.all([loadDb(store, ['jobs', 'config']), networkStamp(store)]);
    const routine = { configured: routineConfigured(), error: launch.error, sessionUrl: launch.sessionUrl, activeAt: launch.activeAt };
    return json({ stamp, jobs: visibleJobs(db.jobs), routine });
  }

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
  // Old finished searches piled up: clear them (queue only, cheap).
  if (db.jobs.filter((j) => j.status === 'done' || j.status === 'error').length > KEEP_DONE_JOBS + KEEP_ASKS + 20) {
    await mutate(store, (l) => pruneJobs(l.db), ['jobs']).catch((e) => console.error('[constellation] prune failed', e));
  }

  const [crm, stamp] = await Promise.all([crmKnown(store), networkStamp(store)]);
  const routine = { configured: routineConfigured(), error: launch.error, sessionUrl: launch.sessionUrl, activeAt: launch.activeAt };
  return json({
    stamp,
    bands: db.bands,
    findings: db.findings,
    overrides: db.overrides,
    watch: db.watch,
    jobs: visibleJobs(db.jobs),
    crm,
    synthesis: db.synthesis,
    routine,
  });
}
