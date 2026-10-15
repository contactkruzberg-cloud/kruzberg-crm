// Constellation : la carte des noms qui reviennent dans la niche post-punk de
// KRUZBERG (idée de Marion Richeux, session 03 avec Francis Richert).
// On part de groupes de la niche, on relève leur parcours (tourneur, label,
// salles, festivals, premières parties…), et on classe les acteurs selon le
// nombre de groupes chez qui on les retrouve (la « règle de Francis »).

export type Scene = 'lyon' | 'france' | 'europe';

/** Pourquoi le groupe est dans la constellation. */
export type BandOrigin = 'radar' | 'seance' | 'lyon' | 'decouverte' | 'reference' | 'catalogue' | 'manuel';

export type BandStatus =
  | 'suggested' // proposé par une découverte, pas encore retenu
  | 'idle' // retenu, pas encore exploré
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'rejected'; // écarté (pas notre niche)

export interface Band {
  id: string;
  name: string;
  city?: string;
  country?: string;
  scene?: Scene;
  genre?: string;
  origin: BandOrigin;
  /** Pourquoi il est proposé / ce qu'on en sait (texte court). */
  why?: string;
  status: BandStatus;
  addedAt: string;
  exploredAt?: string;
  error?: string;
  /** Résumé du parcours rédigé par la recherche. */
  summary?: string;
  /** Ce que ce parcours nous apprend pour KRUZBERG. */
  lesson?: string;
  links?: { website?: string; bandcamp?: string; instagram?: string };
  /** Groupe « à succès » dont on étudie le parcours (Last Train, Fontaines D.C.…). */
  reference?: boolean;
  /** Proximité avec KRUZBERG estimée par la découverte (1 à 5). */
  fit?: number;
  formedYear?: number;
  /** Trajectoire datée depuis les débuts. */
  milestones?: Milestone[];
}

export type Stage =
  | 'formation'
  | 'premier_concert'
  | 'premiere_sortie'
  | 'premier_album'
  | 'tremplin'
  | 'accompagnement'
  | 'residence'
  | 'premiere_partie'
  | 'festival'
  | 'premier_tourneur'
  | 'signature_label'
  | 'tournee_france'
  | 'tournee_europe'
  | 'media'
  | 'session_live'
  | 'autre';

export interface Milestone {
  year: number;
  /** YYYY-MM ou YYYY-MM-DD si connu. */
  when?: string;
  stage: Stage;
  title: string;
  /** Acteur en jeu (tremplin, tourneur, label, salle…), relié à la constellation. */
  actor?: string;
  actorKind?: EntityKind;
  sourceUrl: string;
}

export interface Synthesis {
  generatedAt: string;
  summary: string;
  patterns: { title: string; evidence: string; bands: string[]; actors: string[]; forKruzberg: string }[];
  roadmap: { step: string; horizon: string; actions: string; actors: string[] }[];
}

export type EntityKind =
  | 'tourneur' // agence de booking / tourneur
  | 'label'
  | 'salle'
  | 'festival'
  | 'organisateur' // asso / collectif / promoteur qui monte des soirées
  | 'tete_affiche' // groupe qui a pris un groupe de la niche en 1re partie
  | 'plateau' // groupe croisé en co-plateau
  | 'media'
  | 'dispositif'; // tremplin, accompagnement, résidence

/** Un fait sourcé : « tel groupe → tel acteur ». */
export interface Finding {
  id: string;
  bandId: string;
  kind: EntityKind;
  name: string;
  city?: string;
  country?: string;
  /** Année ou date (YYYY ou YYYY-MM-DD). */
  when?: string;
  /** Contexte : « 1re partie de X », « album Y »… */
  detail?: string;
  /** Pour une salle : jauge approximative. */
  capacity?: number;
  /** Pour un tourneur / label : local, national, international. */
  scale?: 'local' | 'national' | 'international';
  website?: string;
  sourceUrl: string;
}

/** Réglages manuels sur un acteur (clé = clé normalisée). */
export interface EntityOverride {
  /** Fusionné dans un autre acteur (clé cible). */
  mergedInto?: string;
  /** Écarté du classement (ex. homonyme, trop gros). */
  hidden?: boolean;
  note?: string;
}

/** Acteur repéré hors recherche (cité en séance, etc.). */
export interface Watch {
  key: string;
  name: string;
  kind: EntityKind;
  city?: string;
  scale?: 'local' | 'national' | 'international';
  note: string;
  source: string;
}

export type JobKind = 'band' | 'discover' | 'discover_lyon' | 'roster' | 'synthesis';

/** Angles de découverte de nouveaux groupes. */
export type DiscoverAngle = 'lyon_scene' | 'lyon_agendas' | 'aura_dispositifs' | 'france_niche' | 'europe_niche';

export interface Job {
  id: string;
  kind: JobKind;
  /** bandId pour 'band', clé d'acteur pour 'roster'. */
  target?: string;
  label: string;
  status: 'queued' | 'running' | 'done' | 'error';
  requestedAt: string;
  startedAt?: string;
  doneAt?: string;
  error?: string;
  costUsd?: number;
  /** Nombre de faits / groupes ajoutés. */
  added?: number;
  /** Découverte : explorer aussitôt les groupes très proches. */
  autoExplore?: boolean;
}

export interface Db {
  version: 1;
  bands: Band[];
  findings: Finding[];
  overrides: Record<string, EntityOverride>;
  watch: Watch[];
  jobs: Job[];
  synthesis?: Synthesis;
}

/** Acteur agrégé (calculé, jamais stocké). */
export interface Entity {
  key: string;
  name: string;
  kind: EntityKind;
  city?: string;
  country?: string;
  scale?: Finding['scale'];
  capacity?: number;
  website?: string;
  bandIds: string[];
  lyonBands: number;
  /** Nombre de groupes à succès chez qui on le retrouve. */
  refBands: number;
  findings: Finding[];
  lastYear?: number;
  score: number;
  watch?: Watch;
  inCrm?: { name: string; city?: string };
  note?: string;
}

export const KIND_LABEL: Record<EntityKind, string> = {
  tourneur: 'Tourneur',
  label: 'Label',
  salle: 'Salle',
  festival: 'Festival',
  organisateur: 'Organisateur',
  tete_affiche: '1re partie de',
  plateau: 'Co-plateau',
  media: 'Média',
  dispositif: 'Dispositif',
};

export const KIND_PLURAL: Record<EntityKind, string> = {
  tourneur: 'Tourneurs',
  label: 'Labels',
  salle: 'Salles',
  festival: 'Festivals',
  organisateur: 'Organisateurs',
  tete_affiche: 'Têtes d’affiche',
  plateau: 'Co-plateaux',
  media: 'Médias',
  dispositif: 'Dispositifs',
};

/** Couleur par type (HSL, lisible sur fond sombre comme clair). */
export const KIND_COLOR: Record<EntityKind, string> = {
  tourneur: 'hsl(162 100% 45%)',
  label: 'hsl(262 83% 66%)',
  salle: 'hsl(217 91% 62%)',
  festival: 'hsl(25 95% 56%)',
  organisateur: 'hsl(190 80% 50%)',
  tete_affiche: 'hsl(330 80% 62%)',
  plateau: 'hsl(47 96% 55%)',
  media: 'hsl(0 0% 62%)',
  dispositif: 'hsl(82 70% 48%)',
};

export const ORIGIN_LABEL: Record<BandOrigin, string> = {
  radar: 'Niche du Radar',
  seance: 'Cité en séance',
  lyon: 'Scène lyonnaise',
  decouverte: 'Découverte',
  reference: 'Groupe à succès',
  catalogue: 'Catalogue d’un tourneur',
  manuel: 'Ajout manuel',
};

export const STAGE_LABEL: Record<Stage, string> = {
  formation: 'Formation',
  premier_concert: '1er concert',
  premiere_sortie: '1re sortie (single / EP)',
  premier_album: '1er album',
  tremplin: 'Tremplin',
  accompagnement: 'Accompagnement',
  residence: 'Résidence',
  premiere_partie: '1re partie marquante',
  festival: 'Festival marquant',
  premier_tourneur: '1er tourneur',
  signature_label: 'Signature label',
  tournee_france: 'Tournée France',
  tournee_europe: 'Tournée Europe / UK',
  media: 'Média marquant',
  session_live: 'Session live',
  autre: 'Autre',
};

export const STAGE_COLOR: Record<Stage, string> = {
  formation: 'hsl(0 0% 70%)',
  premier_concert: 'hsl(0 0% 55%)',
  premiere_sortie: 'hsl(262 83% 66%)',
  premier_album: 'hsl(262 83% 76%)',
  tremplin: 'hsl(82 70% 48%)',
  accompagnement: 'hsl(82 50% 62%)',
  residence: 'hsl(100 40% 55%)',
  premiere_partie: 'hsl(330 80% 62%)',
  festival: 'hsl(25 95% 56%)',
  premier_tourneur: 'hsl(162 100% 45%)',
  signature_label: 'hsl(280 70% 60%)',
  tournee_france: 'hsl(217 91% 62%)',
  tournee_europe: 'hsl(200 90% 55%)',
  media: 'hsl(47 96% 55%)',
  session_live: 'hsl(0 70% 62%)',
  autre: 'hsl(0 0% 45%)',
};

export const ANGLE_LABEL: Record<DiscoverAngle, string> = {
  lyon_scene: 'Scène lyonnaise',
  lyon_agendas: 'Agendas des salles lyonnaises',
  aura_dispositifs: 'Tremplins et dispositifs en Auvergne-Rhône-Alpes',
  france_niche: 'Scène française de la niche',
  europe_niche: 'Scène européenne de la niche',
};
