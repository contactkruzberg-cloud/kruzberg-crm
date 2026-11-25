import type { Band, Db, EntityKind, Finding, Milestone } from './types';

// Ce que la page /constellation reçoit au chargement, en version allégée : le
// classement, les liens, la carte et les parcours se calculent sans les textes
// longs (résumé et leçon d'un groupe, contexte et source de chaque fait), que
// la fiche d'un groupe ou d'un acteur charge à son ouverture (detail).
// Les faits voyagent en lignes compactes, groupe par groupe, avec une table des
// valeurs répétées (ville, pays, échelle, site).

/** Référence stable d'un fait : groupe et rang dans les faits du groupe (sert d'id côté page). */
export const findingRef = (bandId: string, i: number) => `${bandId}#${i}`;

/** Références des faits, dans l'ordre de db.findings. */
export function findingRefs(findings: Finding[]): Map<Finding, string> {
  const n = new Map<string, number>();
  const out = new Map<Finding, string>();
  for (const f of findings) {
    const i = n.get(f.bandId) ?? 0;
    n.set(f.bandId, i + 1);
    out.set(f, findingRef(f.bandId, i));
  }
  return out;
}

/** Groupe sans résumé, leçon ni sources des étapes. */
export type SlimBand = Omit<Band, 'summary' | 'lesson' | 'milestones'> & { milestones?: Omit<Milestone, 'sourceUrl'>[] };

export function slimBand(b: Band): SlimBand {
  const out: Partial<Band> = { ...b };
  delete out.summary;
  delete out.lesson;
  delete out.milestones;
  if (!b.milestones) return out as SlimBand;
  return { ...(out as SlimBand), milestones: b.milestones.map((m) => omit(m, 'sourceUrl')) };
}

function omit<T extends object, K extends keyof T>(o: T, k: K): Omit<T, K> {
  const out = { ...o };
  delete out[k];
  return out;
}

/** Groupe pour la page : sources des étapes vides (la fiche les charge). */
export function unslimBand(b: SlimBand): Band {
  return b.milestones ? { ...b, milestones: b.milestones.map((m) => ({ ...m, sourceUrl: '' })) } : (b as Band);
}

/** Ce que la fiche d'un groupe ajoute à la version allégée. */
export type BandExtra = Pick<Band, 'summary' | 'lesson' | 'milestones'>;

/** Contexte et source d'un fait, par référence. */
export type Facts = Record<string, { detail?: string; sourceUrl: string }>;

const KINDS: EntityKind[] = ['tourneur', 'label', 'salle', 'festival', 'organisateur', 'tete_affiche', 'plateau', 'media', 'dispositif'];

/**
 * Un fait : [type, nom, ville, pays, date, échelle, jauge, site, contexte, source].
 * Ville, pays, échelle et site sont des rangs dans la table (0 = absent) ;
 * contexte et source ne sont envoyés que pour les dates à venir (bloc « À aller voir »).
 * Les champs vides en fin de ligne sont omis.
 */
type Row = [number, string, number?, number?, string?, number?, number?, number?, string?, string?];

export interface PackedFindings {
  strings: string[];
  /**
   * Suites de faits d'un même groupe, dans l'ordre de db.findings (un objet
   * mettrait les ids numériques en tête et changerait les égalités du classement).
   * Le rang d'un fait parmi ceux de son groupe donne sa référence.
   */
  runs: [bandId: string, rows: Row[]][];
}

const UPCOMING = /^\d{4}-\d{2}-\d{2}$/;

export function packFindings(findings: Finding[], today = new Date().toISOString().slice(0, 10)): PackedFindings {
  const strings = [''];
  const index = new Map<string, number>();
  const s = (v?: string) => {
    if (!v) return 0;
    let i = index.get(v);
    if (i === undefined) index.set(v, (i = strings.push(v) - 1));
    return i;
  };
  const runs: PackedFindings['runs'] = [];
  for (const f of findings) {
    const soon = UPCOMING.test(f.when ?? '') && f.when! >= today;
    const row: (string | number)[] = [
      KINDS.indexOf(f.kind),
      f.name,
      s(f.city),
      s(f.country),
      f.when ?? '',
      s(f.scale),
      f.capacity ?? 0,
      s(f.website),
      soon ? (f.detail ?? '') : '',
      soon ? f.sourceUrl : '',
    ];
    while (row.length > 2 && !row.at(-1)) row.pop();
    const last = runs.at(-1);
    if (last?.[0] === f.bandId) last[1].push(row as Row);
    else runs.push([f.bandId, [row as Row]]);
  }
  return { strings, runs };
}

/**
 * Faits allégés pour la page : id = référence du fait, sourceUrl vide quand la
 * source n'a pas été envoyée (la fiche la charge).
 */
export function unpackFindings(p: PackedFindings): Finding[] {
  const out: Finding[] = [];
  const s = (i?: number) => (i ? p.strings[i] : undefined);
  const n = new Map<string, number>();
  for (const [bandId, rows] of p.runs)
    for (const [kind, name, city, country, when, scale, capacity, website, detail, sourceUrl] of rows) {
      const i = n.get(bandId) ?? 0;
      n.set(bandId, i + 1);
      const f: Finding = { id: findingRef(bandId, i), bandId, kind: KINDS[kind], name, sourceUrl: sourceUrl ?? '' };
      if (city) f.city = s(city);
      if (country) f.country = s(country);
      if (when) f.when = when;
      if (scale) f.scale = s(scale) as Finding['scale'];
      if (capacity) f.capacity = capacity;
      if (website) f.website = s(website);
      if (detail) f.detail = detail;
      out.push(f);
    }
  return out;
}

/** Les faits d'un groupe (tous) ou d'un ensemble de faits, avec contexte et source. */
export function factsOf(db: Db, keep: (f: Finding) => boolean): Facts {
  const out: Facts = {};
  for (const [f, ref] of findingRefs(db.findings)) if (keep(f)) out[ref] = f.detail ? { detail: f.detail, sourceUrl: f.sourceUrl } : { sourceUrl: f.sourceUrl };
  return out;
}
