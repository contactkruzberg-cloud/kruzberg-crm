import type { EntityKind } from './types';

export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Mots qui ne distinguent pas un acteur d'un autre (« Vedette Booking » =
// « Vedette », « Howlin' Banana Records » = « Howlin Banana »).
const NOISE: Partial<Record<EntityKind | 'any', RegExp>> = {
  any: /\b(the|le|la|les|l)\b/g,
  tourneur: /\b(booking|agency|agence|productions?|prod|tour(s|ing)?|music|musique|live|management|mgmt)\b/g,
  label: /\b(records?|recordings|label|disques?|music)\b/g,
  salle: /\b(club|salle|concert|concerts|live)\b/g,
  festival: /\b(festival|fest|edition|\d{4})\b/g,
};

/** Familles qui partagent un même espace de noms (un groupe peut être tête d'affiche puis co-plateau). */
function family(kind: EntityKind): string {
  if (kind === 'tete_affiche' || kind === 'plateau') return 'groupe';
  if (kind === 'salle' || kind === 'organisateur') return 'lieu';
  return kind;
}

export function entityKey(kind: EntityKind, name: string): string {
  let n = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[’']/g, '');
  n = n.replace(NOISE.any!, ' ');
  const noise = NOISE[kind];
  if (noise) n = n.replace(noise, ' ');
  let s = slug(n);
  if (!s) s = slug(name);
  return `${family(kind)}:${s}`;
}

// « Autoproduction », « Self-released », « (auto-organisé) », « aucun label »…
const NOT_AN_ACTOR = /auto-?prod|self[- ]?released|auto-?organis|aucun (label|tourneur)|sans label/i;

/** Faits qui ne désignent pas un acteur à contacter (autoproduction, studio d'enregistrement, le groupe lui-même). */
export function isNoise(f: { name: string; detail?: string; bandId: string }): boolean {
  if (NOT_AN_ACTOR.test(f.name)) return true;
  if (/\bstudio\b/i.test(f.name) && /enregistr|record/i.test(f.detail ?? '')) return true;
  const s = slug(f.name);
  return s === f.bandId || s.startsWith(`${f.bandId}-`);
}
