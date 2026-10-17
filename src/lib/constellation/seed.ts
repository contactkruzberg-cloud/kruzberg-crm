import { entityKey, slug } from './normalize';
import type { Band, Watch } from './types';

type SeedBand = Omit<Band, 'status' | 'addedAt'>;

const band = (name: string, origin: Band['origin'], why: string, extra: Partial<SeedBand> = {}): SeedBand => ({
  id: slug(name),
  name,
  origin,
  why,
  ...extra,
});

// Point de départ : la niche citée dans les angles du Booking Radar et les noms
// cités en séance. Les groupes lyonnais de l'esthétique arrivent par la
// découverte « Scène lyonnaise ».
export const SEED_BANDS: SeedBand[] = [
  band('Sunday Panic', 'radar', 'Lyon, joue à la Maloka (Dijon) : partenaire de plateau possible.', { city: 'Lyon', country: 'France', scene: 'lyon' }),
  band('Bleakness', 'radar', 'Co-plateau visé par le Radar (clubs 80-300 places).', { country: 'France', scene: 'france' }),
  band('CUST', 'radar', 'Co-plateau visé par le Radar.'),
  band('GLIITCH', 'radar', 'Co-plateau visé par le Radar.'),
  band('Gurriers', 'radar', 'Nouvelle vague post-punk irlandaise : la presse qui les suit est la nôtre.', { city: 'Dublin', country: 'Irlande', scene: 'europe' }),
  band('Basht.', 'radar', 'Nouvelle vague post-punk irlandaise, chroniqué en 2026.', { city: 'Dublin', country: 'Irlande', scene: 'europe' }),
  band('Cardinals', 'radar', 'Post-punk irlandais, angle presse du Radar.', { city: 'Cork', country: 'Irlande', scene: 'europe' }),
  band('High Vis', 'radar', 'Post-punk ; a joué à l’A38 (Budapest) : exactement notre circuit européen.', { city: 'Londres', country: 'Royaume-Uni', scene: 'europe' }),
  band('Johnnie Carwash', 'seance', 'Garage pop lyonnais passé par le Labo, 2e album chez Howlin’ Banana, ~200 dates en Europe : notre parcours avec quelques années d’avance.', { city: 'Lyon', country: 'France', scene: 'lyon' }),
  band('Mad Girls Love Song', 'seance', 'Cité par Francis en séance. Contexte à préciser.'),
];

const watch = (name: string, kind: Watch['kind'], scale: Watch['scale'], note: string, city?: string): Watch => ({
  key: entityKey(kind, name),
  name,
  kind,
  scale,
  city,
  note,
  source: 'Session 03 · Francis Richert',
});

// Tourneurs notés en séance (orthographe et coordonnées à vérifier).
export const SEED_WATCH: Watch[] = [
  watch('Murailles Musique', 'tourneur', 'national', 'Cité par Francis.'),
  watch('Super Mon Amour', 'tourneur', 'national', 'Cité par Francis.'),
  watch('Vedette', 'tourneur', 'national', 'Cité par Francis (vedette.net).'),
  watch('Alias', 'tourneur', 'national', 'Trop gros pour nous aujourd’hui, mais leur catalogue est une bonne source pour la constellation.'),
  watch('Podium', 'tourneur', 'local', 'Tourneur lyonnais (ex-AFX).', 'Lyon'),
  watch('Jasipir', 'tourneur', 'local', 'Tourneur local cité par Francis.', 'Lyon'),
  watch('Namastrock', 'tourneur', 'local', 'Tourneur local cité par Francis.', 'Lyon'),
  watch('Le Cri du Charbon', 'tourneur', 'local', 'Tourneur local cité par Francis.'),
  watch('Howlin’ Banana Records', 'label', 'national', 'Label de Johnnie Carwash (2e album).'),
  watch('Club du Transbordeur', 'salle', 'local', 'Soirée « Club Punk et boîte à rythmes » : passer par Francis pour joindre David.', 'Villeurbanne'),
];
