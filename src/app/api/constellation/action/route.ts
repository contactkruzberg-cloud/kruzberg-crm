import { ConflictError, mutate } from '@/lib/constellation/docs';
import { ActionError, applyAction, type Action } from '@/lib/constellation/engine';
import { kick, ownerStore } from '@/lib/constellation/server';

// Actions de la page /constellation (retenir, explorer, fusionner, écarter…).
// Une action qui met des recherches en file réveille la routine.

export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await ownerStore();
  if ('error' in auth) return auth.error;
  const a = (await request.json().catch(() => null)) as Action | null;
  if (!a?.type) return Response.json({ error: 'Action manquante' }, { status: 400 });
  try {
    const out = await mutate(auth.store, (l) => applyAction(l, a));
    await kick(auth.store).catch((e) => console.error('[constellation] kick failed', e));
    return Response.json(out);
  } catch (e) {
    if (e instanceof ActionError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof ConflictError) return Response.json({ error: e.message }, { status: 409 });
    console.error('[constellation] action failed', e);
    return Response.json({ error: 'Erreur interne du CRM.' }, { status: 500 });
  }
}
