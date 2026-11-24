// Qui est qui dans les musiques actuelles : la fonction d'un contact, pour
// savoir à qui on parle (et comment) d'un coup d'œil. Stockée dans
// contacts.kind ; à défaut, devinée depuis l'intitulé libre (role) puis le
// type du lieu, et affichée comme « à confirmer ».

export type ContactKind =
  | 'programmateur'
  | 'promoteur'
  | 'organisateur'
  | 'booker'
  | 'tourneur'
  | 'manager'
  | 'direction'
  | 'label'
  | 'media'
  | 'accompagnement'
  | 'technique'
  | 'artiste'
  | 'autre';

export const CONTACT_KINDS: { key: ContactKind; label: string; hint: string; color: string }[] = [
  { key: 'programmateur', label: 'Programmateur·rice', hint: 'Choisit les groupes d’un lieu ou d’un festival', color: 'hsl(211 100% 50%)' },
  { key: 'promoteur', label: 'Promoteur local', hint: 'Monte des concerts dans sa ville (asso, collectif)', color: 'hsl(28 100% 50%)' },
  { key: 'organisateur', label: 'Organisateur·rice', hint: 'Festival, événement ou soirée ponctuelle', color: 'hsl(35 100% 45%)' },
  { key: 'booker', label: 'Booker / agent', hint: 'Vend des dates pour des artistes', color: 'hsl(250 75% 60%)' },
  { key: 'tourneur', label: 'Tourneur', hint: 'Producteur de spectacles, porte des tournées', color: 'hsl(280 60% 55%)' },
  { key: 'manager', label: 'Manager', hint: 'Manage un artiste ou un groupe', color: 'hsl(310 65% 55%)' },
  { key: 'direction', label: 'Direction', hint: 'Dirige le lieu ou la structure', color: 'hsl(220 10% 45%)' },
  { key: 'label', label: 'Label / édition', hint: 'Label, éditeur, distributeur', color: 'hsl(340 80% 55%)' },
  { key: 'media', label: 'Média', hint: 'Presse, radio, webzine, playlist', color: 'hsl(175 70% 38%)' },
  { key: 'accompagnement', label: 'Accompagnement', hint: 'SMAC, dispositif, institution, subventions', color: 'hsl(140 55% 40%)' },
  { key: 'technique', label: 'Technique', hint: 'Régie, son, lumière, accueil', color: 'hsl(200 15% 50%)' },
  { key: 'artiste', label: 'Artiste', hint: 'Musicien·ne, groupe', color: 'hsl(0 75% 55%)' },
  { key: 'autre', label: 'Autre', hint: '', color: 'hsl(0 0% 55%)' },
];

const BY_KEY = new Map(CONTACT_KINDS.map((k) => [k.key, k]));
export const kindInfo = (k: ContactKind) => BY_KEY.get(k)!;
export const isContactKind = (s: unknown): s is ContactKind => typeof s === 'string' && BY_KEY.has(s as ContactKind);

// Order matters: the first match wins ("Directeur / Programmateur" → programmation).
const RULES: [RegExp, ContactKind][] = [
  [/manag/i, 'manager'],
  [/tourneur|producteur de spectacle|production de spectacle/i, 'tourneur'],
  [/label|[ée]diteur|[ée]dition|disque|distribut/i, 'label'],
  [/book|agent/i, 'booker'],
  [/promo(teur|trice)|asso\w* programm|collectif/i, 'promoteur'],
  [/prog|artistique|concerts?\b/i, 'programmateur'],
  [/organis|festival/i, 'organisateur'],
  [/presse|journal|radio|m[ée]dia|webzine|blog|playlist|chroniq/i, 'media'],
  [/accompagn|dispositif|subvention|institution|r[ée]gion|mairie|chargée? de mission|smac/i, 'accompagnement'],
  [/r[ée]gi|technique|\bson\b|lumi[èe]re|ing[ée]/i, 'technique'],
  [/direct|pr[ée]sident|g[ée]rant|fondat|patron|coord/i, 'direction'],
  [/musicien|chanteu|groupe|artiste|batteu|guitar/i, 'artiste'],
];

export function kindFromRole(role: string | null | undefined): ContactKind | null {
  if (!role?.trim()) return null;
  for (const [re, k] of RULES) if (re.test(role)) return k;
  return null;
}

const FROM_VENUE: Record<string, ContactKind> = {
  festival: 'organisateur',
  organisateur: 'promoteur',
  media: 'media',
  bar: 'programmateur',
  salle: 'programmateur',
  cafe_concert: 'programmateur',
  mjc: 'programmateur',
};

/** The contact's function: the saved one, else a guess (sure = false). */
export function contactKind(c: { kind?: string | null; role?: string | null; venue?: { type?: string | null } | null }): { kind: ContactKind | null; sure: boolean } {
  if (isContactKind(c.kind)) return { kind: c.kind, sure: true };
  const guess = kindFromRole(c.role) ?? (c.venue?.type ? FROM_VENUE[c.venue.type] ?? null : null);
  return { kind: guess, sure: false };
}

/** "Programmateur·rice · Directeur artistique" — the precise title only when it adds something. */
export function roleLine(c: { kind?: string | null; role?: string | null; venue?: { type?: string | null } | null }) {
  const { kind } = contactKind(c);
  const label = kind ? kindInfo(kind).label : null;
  const role = c.role?.trim();
  if (!role || role.toLowerCase() === 'contact') return label;
  if (!label) return role;
  return kindFromRole(role) === kind && role.length <= 16 ? label : `${label} · ${role}`;
}
