import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fireVeille } from '@/lib/relance/wake';
import { CATL, CATS } from '@/lib/radar/logic';
import type { RadarCat, RadarLaunch } from '@/lib/radar/types';

// "Lancer une recherche" on the radar page: fires the booking-search routine
// (API trigger only, no schedule). The request goes in config/launch BEFORE the
// fire: the routine reads its scope there ("all" or one rubric, the radar menu
// Greg was in), then writes doneAt when it ends. Also avoids double launches.

export const maxDuration = 30;

/** A search takes 10 to 20 minutes: a second click within this window is refused. */
const COOLDOWN_MS = 20 * 60_000;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Session expirée : reconnecte-toi au CRM.' }, { status: 401 });
  if (user.id !== process.env.MCP_OWNER_ID) return NextResponse.json({ error: 'Compte non autorisé.' }, { status: 403 });
  if (!process.env.VEILLE_ROUTINE_ID || !process.env.VEILLE_ROUTINE_TOKEN)
    return NextResponse.json({ error: 'Routine de recherche non configurée (VEILLE_ROUTINE_ID / VEILLE_ROUTINE_TOKEN).' }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { scope?: string; force?: boolean };
  const scope: 'all' | RadarCat = CATS.some((c) => c.id === body.scope) ? (body.scope as RadarCat) : 'all';

  const { data: prev } = await supabase.from('radar_docs').select('data').eq('collection', 'config').eq('id', 'launch').maybeSingle();
  const last = (prev?.data ?? {}) as RadarLaunch;
  const running = last.requestedAt && !(last.doneAt && last.doneAt >= last.requestedAt) && Date.now() - Date.parse(last.requestedAt) < COOLDOWN_MS;
  if (!body.force && running) return NextResponse.json({ error: 'Une recherche est déjà en cours.', requestedAt: last.requestedAt }, { status: 409 });

  const save = (data: RadarLaunch) =>
    supabase.from('radar_docs').upsert({ user_id: user.id, collection: 'config', id: 'launch', data }, { onConflict: 'user_id,collection,id' });
  const launch: RadarLaunch = { requestedAt: new Date().toISOString(), scope };
  const { error: wErr } = await save(launch);
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

  const fired = await fireVeille(scope === 'all' ? 'toutes les rubriques' : CATL[scope]).catch(() => ({ ok: false as const, status: undefined, sessionUrl: undefined }));
  if (!fired.ok) {
    // Not running after all: give the button back.
    await save({ ...launch, doneAt: launch.requestedAt });
    const error = fired.status === 401 || fired.status === 403 ? 'Jeton de la routine refusé : régénère-le.' : fired.status === 429 ? 'Trop de lancements, réessaie plus tard.' : 'Impossible de lancer la recherche.';
    return NextResponse.json({ error }, { status: 502 });
  }

  const done = { ...launch, sessionUrl: fired.sessionUrl ?? '' };
  await save(done);
  return NextResponse.json(done);
}
