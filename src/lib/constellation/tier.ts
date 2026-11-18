import type { Band, Db } from './types';

// « Groupes émergents » : la vue du classement qui ne garde que les groupes de
// notre échelle, pas plus gros qu'Enola Gay, DITZ, Johnnie Carwash ou Johnny
// Mafia. Les groupes établis (têtes d'affiche de salles de 1 000 places et plus,
// grandes scènes de festival) tirent le classement vers des acteurs hors de
// portée. Les jauges relevées sont trop rares pour le décider seules : on part
// de cette liste, et chaque fiche de groupe permet de corriger (champ `tier`).
export const DEFAULT_ESTABLISHED = new Set([
  'fontaines-d-c',
  'idles',
  'shame',
  'the-murder-capital',
  'last-train',
  'protomartyr',
  'preoccupations',
  'bar-italia',
  'sprints',
]);

export function isEstablished(b: Pick<Band, 'id' | 'tier'>): boolean {
  return b.tier ? b.tier === 'etabli' : DEFAULT_ESTABLISHED.has(b.id);
}

/** La base réduite aux groupes émergents et à leurs faits. */
export function emergingOnly(db: Db): Db {
  const keep = new Set(db.bands.filter((b) => !isEstablished(b)).map((b) => b.id));
  return { ...db, bands: db.bands.filter((b) => keep.has(b.id)), findings: db.findings.filter((f) => keep.has(f.bandId)) };
}
