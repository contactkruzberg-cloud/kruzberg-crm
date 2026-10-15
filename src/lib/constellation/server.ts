import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { storeFromEnv } from '@/lib/mcp/context';
import { isActive, selectAll, type Store } from '@/lib/mcp/store';
import type { CrmKnown } from './aggregate';
import { entityKey } from './normalize';
import type { EntityKind } from './types';

// Côté serveur de la page /constellation : accès réservé au propriétaire du
// CRM, base lue et écrite avec la clé service (filtrée sur le propriétaire),
// comme le « + Pipeline » du radar.

export async function ownerStore(): Promise<{ store: Store } | { error: Response }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: 'Session expirée : reconnecte-toi au CRM.' }, { status: 401 }) };
  if (user.id !== process.env.MCP_OWNER_ID) return { error: Response.json({ error: 'Compte non autorisé.' }, { status: 403 }) };
  const store = storeFromEnv();
  if (!store) return { error: Response.json({ error: 'CRM non configuré.' }, { status: 503 }) };
  return { store };
}

export { kick, routineConfigured } from './launch';

/** Structures déjà dans le CRM, par clé d'acteur (badge « CRM », filtre « pas encore dans le CRM »). */
export async function crmKnown(store: Store): Promise<CrmKnown> {
  const venues = (await selectAll(store, 'venues')).filter(isActive);
  const out: CrmKnown = {};
  for (const v of venues) {
    const name = String(v.name ?? '');
    if (!name) continue;
    const info = { name, city: (v.city as string) || undefined };
    const kind: EntityKind = v.type === 'festival' ? 'festival' : v.type === 'media' ? 'media' : v.type === 'organisateur' ? 'organisateur' : 'salle';
    out[entityKey(kind, name)] ??= info;
  }
  return out;
}
