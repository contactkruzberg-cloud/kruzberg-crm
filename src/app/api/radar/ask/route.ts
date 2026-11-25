import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fireRoutine } from '@/lib/relance/wake';
import type { RadarAsk } from '@/lib/radar/types';

// "Demander à Claude" on the radar: a free request (a region, an event, a
// kind of venue…) sent to the booking-search routine. The request is saved in
// config/ask-<id>; the routine adds the leads it finds (tagged ask: <id>) and
// writes its answer back on that same document.

export const maxDuration = 30;

function instructions(id: string, brief: string) {
  return `Demande précise de Greg depuis le CRM (Booking Radar → Demander à Claude), id de demande : ${id}.

« ${brief} »

Ne fais QUE cette recherche (pas la veille habituelle des rubriques). Cherche sur le web ce qui répond à la demande, avec tes règles habituelles du radar : vérifie les doublons avec radar_known_check, puis ajoute les pistes utiles avec radar_batch dans la collection leads (même format que d'habitude) en mettant dans chaque piste ajoutée le champ "ask": "${id}".

À la fin, OBLIGATOIREMENT, mets à jour le document config / ${id} (radar_get puis radar_batch, op "update", avec if_version) avec :
- "answer" : ton compte rendu en français, 5 à 20 lignes, listes « - » bienvenues : ce que tu as trouvé, ce qui n'existe pas ou est déjà connu, et ce que Greg peut faire ensuite ;
- "added" : le nombre de pistes ajoutées ;
- "sources" : les principales pages consultées, [{ "title": …, "url": … }] ;
- "doneAt" : la date et l'heure ISO de fin.
Si tu ne peux pas aboutir, écris quand même doneAt et "error" avec la raison.`;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Session expirée : reconnecte-toi au CRM.' }, { status: 401 });
  if (user.id !== process.env.MCP_OWNER_ID) return NextResponse.json({ error: 'Compte non autorisé.' }, { status: 403 });
  if (!process.env.VEILLE_ROUTINE_ID || !process.env.VEILLE_ROUTINE_TOKEN)
    return NextResponse.json({ error: 'Routine de recherche non configurée (VEILLE_ROUTINE_ID / VEILLE_ROUTINE_TOKEN).' }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { brief?: string };
  const brief = String(body.brief ?? '').trim().slice(0, 1500);
  if (brief.length < 3) return NextResponse.json({ error: 'Écris ta demande.' }, { status: 400 });

  const id = `ask-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const doc: RadarAsk = { brief, requestedAt: new Date().toISOString() };
  const save = (data: RadarAsk) => supabase.from('radar_docs').upsert({ user_id: user.id, collection: 'config', id, data }, { onConflict: 'user_id,collection,id' });
  const { error: wErr } = await save(doc);
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

  const fired = await fireRoutine(process.env.VEILLE_ROUTINE_ID, process.env.VEILLE_ROUTINE_TOKEN, instructions(id, brief)).catch(() => ({ ok: false as const, status: undefined, sessionUrl: undefined }));
  if (!fired.ok) {
    const error = fired.status === 401 || fired.status === 403 ? 'Jeton de la routine refusé : régénère-le.' : fired.status === 429 ? 'Trop de lancements, réessaie plus tard.' : 'Impossible de joindre Claude.';
    await save({ ...doc, doneAt: new Date().toISOString(), error });
    return NextResponse.json({ error }, { status: 502 });
  }
  await save({ ...doc, sessionUrl: fired.sessionUrl });
  return NextResponse.json({ id });
}
