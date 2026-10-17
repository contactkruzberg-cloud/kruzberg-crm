import { loadDb, mutate } from '@/lib/constellation/docs';
import { seed } from '@/lib/constellation/engine';
import { crmKnown, kick, ownerStore, routineConfigured } from '@/lib/constellation/server';

// Données de la page /constellation. La page calcule elle-même le classement
// (aggregate) : on n'envoie les faits qu'une fois. Avec ?light=1, seulement la
// file des recherches et un tampon : la page ne recharge tout que s'il a changé.

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
  const [last] = await store.select('constellation_docs', { order: [{ col: 'updated_at', asc: false }], limit: 1 });
  const stamp = `${last?.updated_at ?? ''}|${db.bands.length}|${db.jobs.length}`;
  const jobs = db.jobs.slice(-40).reverse();
  const routine = { configured: routineConfigured(), error: launch.error, sessionUrl: launch.sessionUrl, activeAt: launch.activeAt };

  if (new URL(request.url).searchParams.get('light')) return json({ stamp, jobs, routine });

  const crm = await crmKnown(store);
  return json({
    stamp,
    bands: db.bands,
    findings: db.findings,
    overrides: db.overrides,
    watch: db.watch,
    jobs,
    crm,
    synthesis: db.synthesis,
    routine,
  });
}
