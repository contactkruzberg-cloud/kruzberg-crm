import { aggregate } from '@/lib/constellation/aggregate';
import { loadDb } from '@/lib/constellation/docs';
import { ownerStore } from '@/lib/constellation/server';
import { factsOf, type BandExtra, type Facts } from '@/lib/constellation/wire';

// Ce que la page /constellation n'a pas au chargement, demandé à l'ouverture
// d'une fiche : ?band=<id> → résumé, leçon, étapes sourcées et faits du groupe ;
// ?entity=<clé> → contexte et source des faits de l'acteur.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function GET(request: Request) {
  const auth = await ownerStore();
  if ('error' in auth) return auth.error;
  const params = new URL(request.url).searchParams;
  const bandId = params.get('band');
  const key = params.get('entity');
  if (!bandId && !key) return json({ error: 'Groupe ou acteur manquant.' }, 400);

  const { db } = await loadDb(auth.store);
  if (bandId) {
    const b = db.bands.find((x) => x.id === bandId);
    if (!b) return json({ error: 'Groupe introuvable.' }, 404);
    const band: BandExtra = { summary: b.summary, lesson: b.lesson, milestones: b.milestones };
    return json({ band, facts: factsOf(db, (f) => f.bandId === bandId) satisfies Facts });
  }
  const e = aggregate(db, {}, { includeHidden: true }).find((x) => x.key === key);
  if (!e) return json({ error: 'Acteur introuvable.' }, 404);
  const mine = new Set(e.findings);
  return json({ facts: factsOf(db, (f) => mine.has(f)) satisfies Facts });
}
