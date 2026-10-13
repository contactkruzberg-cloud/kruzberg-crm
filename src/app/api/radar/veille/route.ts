import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fireVeille } from '@/lib/relance/wake';

// "Lancer une recherche" on the radar page: fires the booking-search routine
// (API trigger only, no schedule) and remembers the launch in config/launch so
// the page can show that a search is running and avoid double launches.

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

  const { force } = (await request.json().catch(() => ({}))) as { force?: boolean };
  const { data: prev } = await supabase.from('radar_docs').select('data').eq('collection', 'config').eq('id', 'launch').maybeSingle();
  const last = (prev?.data as { requestedAt?: string } | null)?.requestedAt;
  if (!force && last && Date.now() - Date.parse(last) < COOLDOWN_MS)
    return NextResponse.json({ error: 'Une recherche est déjà en cours.', requestedAt: last }, { status: 409 });

  const fired = await fireVeille().catch(() => ({ ok: false as const, status: undefined, sessionUrl: undefined }));
  if (!fired.ok) {
    const error = fired.status === 401 || fired.status === 403 ? 'Jeton de la routine refusé : régénère-le.' : fired.status === 429 ? 'Trop de lancements, réessaie plus tard.' : 'Impossible de lancer la recherche.';
    return NextResponse.json({ error }, { status: 502 });
  }

  const launch = { requestedAt: new Date().toISOString(), sessionUrl: fired.sessionUrl ?? '' };
  await supabase.from('radar_docs').upsert({ user_id: user.id, collection: 'config', id: 'launch', data: launch }, { onConflict: 'user_id,collection,id' });
  return NextResponse.json(launch);
}
