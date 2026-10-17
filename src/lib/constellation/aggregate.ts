import { entityKey, isNoise } from './normalize';
import type { Db, Entity, EntityKind, Finding } from './types';

export interface CrmKnown {
  /** clé normalisée → structure du CRM */
  [key: string]: { name: string; city?: string };
}

function mostCommon<T>(xs: (T | undefined)[]): T | undefined {
  const m = new Map<T, number>();
  for (const x of xs) if (x !== undefined) m.set(x, (m.get(x) ?? 0) + 1);
  let best: T | undefined;
  let n = 0;
  for (const [k, v] of m) if (v > n) [best, n] = [k, v];
  return best;
}

function resolve(key: string, db: Db): string {
  const seen = new Set<string>();
  let k = key;
  while (db.overrides[k]?.mergedInto && !seen.has(k)) {
    seen.add(k);
    k = db.overrides[k].mergedInto!;
  }
  return k;
}

/**
 * Regroupe les faits par acteur et calcule le score de la « règle de Francis » :
 * nombre de groupes de la niche chez qui on retrouve l'acteur, avec un bonus
 * pour les groupes lyonnais (notre terrain d'abord), pour les groupes à succès
 * (leurs passages tracent le chemin) et pour l'activité récente.
 */
export function aggregate(db: Db, crm: CrmKnown = {}, opts: { includeHidden?: boolean } = {}): Entity[] {
  const scene = new Map(db.bands.map((b) => [b.id, b.scene]));
  const refs = new Set(db.bands.filter((b) => b.reference).map((b) => b.id));
  const groups = new Map<string, Finding[]>();
  for (const f of db.findings) {
    if (isNoise(f)) continue;
    const k = resolve(entityKey(f.kind, f.name), db);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(f);
  }
  for (const w of db.watch) if (!groups.has(resolve(w.key, db))) groups.set(resolve(w.key, db), []);

  const out: Entity[] = [];
  for (const [key, fs] of groups) {
    const ov = db.overrides[key];
    if (ov?.hidden && !opts.includeHidden) continue;
    const watch = db.watch.find((w) => resolve(w.key, db) === key);
    const bandIds = [...new Set(fs.map((f) => f.bandId))];
    const kind: EntityKind = mostCommon(fs.map((f) => f.kind)) ?? watch!.kind;
    const years = fs.map((f) => parseInt(f.when ?? '', 10)).filter((y) => y > 1990);
    const lastYear = years.length ? Math.max(...years) : undefined;
    const lyonBands = bandIds.filter((id) => scene.get(id) === 'lyon').length;
    const refBands = bandIds.filter((id) => refs.has(id)).length;
    // Chemin emprunté par les groupes à succès : un demi-point de plus par groupe.
    const score = bandIds.length + 0.5 * lyonBands + 0.5 * refBands + (lastYear && lastYear >= 2025 ? 0.25 : 0);
    // À égalité, le nom de l'acteur cible d'une fusion l'emporte sur ceux qu'on y a fusionnés.
    const own = (f: Finding) => (entityKey(f.kind, f.name) === key ? 0 : 1);
    const name = mostCommon([...fs].sort((a, b) => own(a) - own(b)).map((f) => f.name)) ?? watch!.name;
    const city = mostCommon(fs.map((f) => f.city)) ?? watch?.city;
    out.push({
      key,
      name,
      kind,
      city,
      country: mostCommon(fs.map((f) => f.country)),
      scale: mostCommon(fs.map((f) => f.scale)) ?? watch?.scale,
      capacity: mostCommon(fs.map((f) => f.capacity)),
      website: mostCommon(fs.map((f) => f.website)),
      bandIds,
      lyonBands,
      refBands,
      findings: fs,
      lastYear,
      score,
      watch,
      inCrm: crm[key] ?? crm[entityKey('salle', name)],
      note: ov?.note,
    });
  }
  return out.sort((a, b) => b.score - a.score || b.findings.length - a.findings.length || a.name.localeCompare(b.name));
}
