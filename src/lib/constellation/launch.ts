import type { Store } from '@/lib/mcp/store';
import { fireConstellation } from '@/lib/relance/wake';
import { mutate } from './docs';
import { workersToFire } from './engine';

// Réveil de la routine Constellation (déclencheur API, sur l'abonnement Claude).

export const routineConfigured = () => !!process.env.CONSTELLATION_ROUTINE_ID && !!process.env.CONSTELLATION_ROUTINE_TOKEN;

/**
 * Réveille la routine si des recherches attendent et qu'aucune routine ne s'en
 * occupe (jusqu'à MAX_WORKERS en parallèle). Appelé après chaque action qui met
 * en file et à chaque rafraîchissement de la page. handoff : une routine qui
 * s'arrête passe le relais (une seule relance, sans délai de grâce).
 */
export async function kick(store: Store, opts: { handoff?: boolean } = {}): Promise<{ fired: number; error?: string }> {
  if (!routineConfigured()) return { fired: 0, error: 'Routine Constellation non configurée.' };
  const now = new Date().toISOString();
  const plan = await mutate(store, (l) => {
    const queued = l.db.jobs.filter((j) => j.status === 'queued').length;
    const n = opts.handoff ? Math.min(1, queued) : workersToFire(l.db, l.launch);
    if (n) l.launch.fires = [...l.launch.fires, ...Array.from({ length: n }, () => now)].slice(-20);
    return { n, queued };
  });
  if (!plan.n) return { fired: 0 };
  const results = await Promise.all(
    Array.from({ length: plan.n }, () => fireConstellation(plan.queued).catch(() => ({ ok: false as const, status: undefined, sessionUrl: undefined }))),
  );
  const ok = results.find((r) => r.ok);
  const failed = results.find((r) => !r.ok);
  const error = !failed
    ? undefined
    : failed.status === 401 || failed.status === 403
      ? 'Jeton de la routine Constellation refusé : régénère-le.'
      : failed.status === 429
        ? 'Trop de lancements de la routine, nouvel essai dans quelques minutes.'
        : 'Impossible de lancer la routine Constellation.';
  await mutate(store, (l) => {
    if (ok?.sessionUrl) l.launch.sessionUrl = ok.sessionUrl;
    if (error) l.launch.error = error;
    else delete l.launch.error;
  });
  return { fired: results.filter((r) => r.ok).length, error };
}
