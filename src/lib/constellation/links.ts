import type { Band, Entity, EntityKind } from './types';

// Les liens de second niveau : deux acteurs sont reliés quand les mêmes groupes
// de la niche passent par les deux (« les groupes de Ground Control Touring
// jouent au Brudenell »), deux groupes quand ils partagent des acteurs (même
// tourneur, mêmes salles). C'est ce qui dessine les circuits.

export interface EntityLink {
  key: string;
  /** Groupes passés par les deux acteurs. */
  bands: string[];
}

export interface BandLink {
  id: string;
  /** Acteurs que les deux groupes ont en commun. */
  keys: string[];
}

export interface Pair {
  a: string;
  b: string;
  bands: string[];
}

/** Acteurs reliés par au moins un groupe commun, du lien le plus fort au plus faible. */
export function entityPairs(entities: Entity[]): Pair[] {
  const byBand = new Map<string, string[]>();
  for (const e of entities) for (const id of e.bandIds) (byBand.get(id) ?? byBand.set(id, []).get(id)!).push(e.key);
  const pairs = new Map<string, Pair>();
  for (const [band, keys] of byBand) {
    keys.sort();
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) {
        const id = `${keys[i]}|${keys[j]}`;
        (pairs.get(id) ?? pairs.set(id, { a: keys[i], b: keys[j], bands: [] }).get(id)!).bands.push(band);
      }
  }
  return [...pairs.values()].sort((x, y) => y.bands.length - x.bands.length);
}

/** Pour chaque acteur, les autres acteurs avec qui il partage des groupes. */
export function entityLinks(pairs: Pair[]): Map<string, EntityLink[]> {
  const out = new Map<string, EntityLink[]>();
  const push = (k: string, l: EntityLink) => (out.get(k) ?? out.set(k, []).get(k)!).push(l);
  for (const p of pairs) {
    push(p.a, { key: p.b, bands: p.bands });
    push(p.b, { key: p.a, bands: p.bands });
  }
  return out;
}

/** Pour chaque groupe, les groupes avec qui il partage des acteurs (médias exclus : trop généraux). */
export function bandLinks(entities: Entity[], bands: Band[]): Map<string, BandLink[]> {
  const ok = new Set(bands.filter((b) => b.status !== 'rejected').map((b) => b.id));
  const pairs = new Map<string, { a: string; b: string; keys: string[] }>();
  for (const e of entities) {
    if (e.kind === 'media') continue;
    const ids = e.bandIds.filter((id) => ok.has(id)).sort();
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const id = `${ids[i]}|${ids[j]}`;
        (pairs.get(id) ?? pairs.set(id, { a: ids[i], b: ids[j], keys: [] }).get(id)!).keys.push(e.key);
      }
  }
  const out = new Map<string, BandLink[]>();
  const push = (k: string, l: BandLink) => (out.get(k) ?? out.set(k, []).get(k)!).push(l);
  for (const p of pairs.values()) {
    push(p.a, { id: p.b, keys: p.keys });
    push(p.b, { id: p.a, keys: p.keys });
  }
  for (const ls of out.values()) ls.sort((x, y) => y.keys.length - x.keys.length);
  return out;
}

const PRO: EntityKind[] = ['tourneur', 'label'];
const PLACE: EntityKind[] = ['salle', 'festival', 'organisateur'];

/** Titre d'un groupe de liens vu depuis un acteur : ce que l'autre acteur est pour lui. */
export function relationTitle(self: EntityKind, other: EntityKind): string {
  if (PLACE.includes(self) && other === 'tourneur') return 'Tourneurs des groupes passés ici';
  if (PLACE.includes(self) && other === 'label') return 'Labels des groupes passés ici';
  if (self === 'salle' && other === 'salle') return 'Salles du même circuit';
  if (PLACE.includes(self) && other === 'festival') return 'Festivals joués par les mêmes groupes';
  if (PLACE.includes(self) && other === 'salle') return 'Salles où jouent les mêmes groupes';
  if (PRO.includes(self) && other === 'salle') return 'Salles où passent ses groupes';
  if (PRO.includes(self) && other === 'festival') return 'Festivals où passent ses groupes';
  if (PRO.includes(self) && other === 'organisateur') return 'Organisateurs qui font jouer ses groupes';
  if (self === 'tourneur' && other === 'label') return 'Labels de ses groupes';
  if (self === 'label' && other === 'tourneur') return 'Tourneurs de ses groupes';
  if (self === other) return `Autres ${KIND_WORD[other]} des mêmes groupes`;
  return `${KIND_WORD[other][0].toUpperCase()}${KIND_WORD[other].slice(1)} des mêmes groupes`;
}

const KIND_WORD: Record<EntityKind, string> = {
  tourneur: 'tourneurs',
  label: 'labels',
  salle: 'salles',
  festival: 'festivals',
  organisateur: 'organisateurs',
  tete_affiche: 'têtes d’affiche',
  plateau: 'co-plateaux',
  media: 'médias',
  dispositif: 'dispositifs',
};

/** Ordre d'affichage des liens depuis un acteur : d'abord ce qui mène à des dates. */
export function relationOrder(self: EntityKind): EntityKind[] {
  if (PRO.includes(self)) return ['salle', 'festival', 'organisateur', 'tourneur', 'label', 'dispositif', 'tete_affiche', 'plateau', 'media'];
  return ['tourneur', 'label', 'salle', 'festival', 'organisateur', 'dispositif', 'tete_affiche', 'plateau', 'media'];
}
