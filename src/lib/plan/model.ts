// Plan de route d'un projet émergent en musiques actuelles : des objectifs
// chiffrés (avec le rythme à tenir) et des projets en rétroplanning (étapes
// placées à J-x d'une date cible). Pur : pas de React, pas de Supabase.

export interface PlanGoal {
  id: string;
  axis: string;
  title: string;
  metric: string;
  unit: string | null;
  baseline: number;
  target: number;
  start_date: string | null;
  deadline: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
}
export interface PlanReading {
  id: string;
  goal_id: string;
  value: number;
  measured_at: string;
}
export interface PlanProject {
  id: string;
  title: string;
  template: string | null;
  target_date: string;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
}
export interface PlanStep {
  id: string;
  project_id: string;
  title: string;
  phase: string | null;
  offset_days: number;
  done_at: string | null;
  notes: string | null;
}

// ---------- Dates (ISO yyyy-mm-dd, local) ----------

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
export const daysBetween = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / 864e5);
export const stepDate = (p: Pick<PlanProject, 'target_date'>, s: Pick<PlanStep, 'offset_days'>) => addDays(p.target_date, s.offset_days);
export const jLabel = (offset: number) => (offset === 0 ? 'Jour J' : offset < 0 ? `J-${-offset}` : `J+${offset}`);

// ---------- Axes ----------

export const AXES: { key: string; label: string; color: string }[] = [
  { key: 'live', label: 'Scène', color: 'hsl(211 100% 50%)' },
  { key: 'public', label: 'Public & streaming', color: 'hsl(340 80% 55%)' },
  { key: 'pro', label: 'Réseau pro', color: 'hsl(250 70% 60%)' },
  { key: 'eco', label: 'Économie', color: 'hsl(140 55% 40%)' },
  { key: 'creation', label: 'Création', color: 'hsl(28 100% 50%)' },
];
export const axisInfo = (k: string) => AXES.find((a) => a.key === k) ?? AXES[0];

// ---------- Indicateurs calculés par le CRM ----------

export interface CrmData {
  deals: { stage: string; concert_date: string | null; fee: number | null; first_contact_at: string | null; created_at: string; venue?: { city?: string | null; type?: string | null } | null }[];
  contacts: { created_at: string }[];
}

const PLAYED = ['confirme', 'termine'];
const ANSWERED = ['repondu', 'a_suivre', 'confirme', 'termine', 'refuse'];
const LYON = /^(lyon|villeurbanne|caluire|vaulx|v[ée]nissieux|oullins|bron)/i;

export const AUTO_METRICS: { key: string; label: string; unit: string; axis: string; hint: string }[] = [
  { key: 'auto:dates_jouees', label: 'Dates jouées', unit: 'dates', axis: 'live', hint: 'Concerts passés (confirmés ou terminés) sur la période' },
  { key: 'auto:dates_confirmees', label: 'Dates confirmées', unit: 'dates', axis: 'live', hint: 'Concerts confirmés ou joués, passés et à venir' },
  { key: 'auto:hors_lyon', label: 'Dates hors métropole lyonnaise', unit: 'dates', axis: 'live', hint: 'Concerts confirmés ailleurs qu’à Lyon et autour' },
  { key: 'auto:villes', label: 'Villes jouées', unit: 'villes', axis: 'live', hint: 'Villes différentes avec un concert confirmé' },
  { key: 'auto:festivals', label: 'Festivals', unit: 'festivals', axis: 'live', hint: 'Concerts confirmés dans des festivals' },
  { key: 'auto:cachets', label: 'Cachets encaissés', unit: '€', axis: 'eco', hint: 'Somme des cachets des concerts confirmés' },
  { key: 'auto:cachet_moyen', label: 'Cachet moyen', unit: '€', axis: 'eco', hint: 'Moyenne des cachets renseignés' },
  { key: 'auto:demarches', label: 'Lieux démarchés', unit: 'lieux', axis: 'pro', hint: 'Opportunités contactées sur la période' },
  { key: 'auto:taux_reponse', label: 'Taux de réponse', unit: '%', axis: 'pro', hint: 'Part des lieux démarchés qui ont répondu' },
  { key: 'auto:contacts', label: 'Nouveaux contacts pro', unit: 'contacts', axis: 'pro', hint: 'Contacts ajoutés au CRM sur la période' },
];
export const autoMetric = (k: string) => AUTO_METRICS.find((m) => m.key === k);

/** Period of a goal: its start (or creation) → its deadline (or end of year). */
export function goalPeriod(g: Pick<PlanGoal, 'start_date' | 'deadline' | 'created_at'>) {
  const start = g.start_date ?? `${g.created_at.slice(0, 4)}-01-01`;
  const end = g.deadline ?? `${start.slice(0, 4)}-12-31`;
  return { start, end };
}

export function computeAuto(metric: string, data: CrmData, start: string, end: string, today: string): number {
  const inPeriod = (d: string | null | undefined) => !!d && d.slice(0, 10) >= start && d.slice(0, 10) <= end;
  const confirmed = data.deals.filter((d) => PLAYED.includes(d.stage) && inPeriod(d.concert_date));
  switch (metric) {
    case 'auto:dates_jouees':
      return confirmed.filter((d) => d.concert_date!.slice(0, 10) <= today).length;
    case 'auto:dates_confirmees':
      return confirmed.length;
    case 'auto:hors_lyon':
      return confirmed.filter((d) => d.venue?.city && !LYON.test(d.venue.city.trim())).length;
    case 'auto:villes':
      return new Set(confirmed.map((d) => d.venue?.city?.trim().toLowerCase()).filter(Boolean)).size;
    case 'auto:festivals':
      return confirmed.filter((d) => d.venue?.type === 'festival').length;
    case 'auto:cachets':
      return confirmed.reduce((n, d) => n + (d.fee ?? 0), 0);
    case 'auto:cachet_moyen': {
      const fees = confirmed.map((d) => d.fee).filter((f): f is number => !!f && f > 0);
      return fees.length ? Math.round(fees.reduce((a, b) => a + b, 0) / fees.length) : 0;
    }
    case 'auto:demarches':
      return data.deals.filter((d) => d.stage !== 'a_contacter' && inPeriod(d.first_contact_at ?? d.created_at)).length;
    case 'auto:taux_reponse': {
      const sent = data.deals.filter((d) => d.stage !== 'a_contacter' && inPeriod(d.first_contact_at ?? d.created_at));
      return sent.length ? Math.round((100 * sent.filter((d) => ANSWERED.includes(d.stage)).length) / sent.length) : 0;
    }
    case 'auto:contacts':
      return data.contacts.filter((c) => inPeriod(c.created_at)).length;
    default:
      return 0;
  }
}

/** Current value: computed by the CRM, else the latest reading, else the baseline. */
export function currentValue(g: PlanGoal, readings: PlanReading[], data: CrmData, today: string): number {
  if (g.metric.startsWith('auto:')) {
    const { start, end } = goalPeriod(g);
    return computeAuto(g.metric, data, start, end, today);
  }
  const mine = readings.filter((r) => r.goal_id === g.id).sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  return mine.length ? Number(mine[mine.length - 1].value) : Number(g.baseline);
}

export type PaceState = 'done' | 'ahead' | 'on_track' | 'behind' | 'missed' | 'not_started';

/**
 * Where the goal stands against a straight line from baseline to target.
 * Rates (%, cachet moyen) are not cumulative: compared with the target only.
 */
export function pace(g: PlanGoal, value: number, today: string) {
  const baseline = Number(g.baseline);
  const target = Number(g.target);
  const span = target - baseline;
  const progress = span === 0 ? (value >= target ? 1 : 0) : Math.max(0, Math.min(1, (value - baseline) / span));
  const { start, end } = goalPeriod(g);
  const total = Math.max(1, daysBetween(start, end));
  const elapsed = Math.max(0, Math.min(1, daysBetween(start, today) / total));
  const rate = g.unit === '%' || g.metric === 'auto:cachet_moyen';
  const expected = rate ? target : baseline + span * elapsed;
  const daysLeft = daysBetween(today, end);
  let state: PaceState;
  if (value >= target) state = 'done';
  else if (today > end) state = 'missed';
  else if (today < start) state = 'not_started';
  else if (rate) state = value >= target * 0.9 ? 'on_track' : 'behind';
  else if (value >= expected + Math.max(1, span * 0.1)) state = 'ahead';
  else if (value >= expected - Math.max(0.5, span * 0.1)) state = 'on_track';
  else state = 'behind';
  return { progress, elapsed: rate ? null : elapsed, expected, remaining: Math.max(0, target - value), daysLeft, state };
}

export const PACE_LABEL: Record<PaceState, string> = {
  done: 'Atteint',
  ahead: 'En avance',
  on_track: 'Dans le rythme',
  behind: 'En retard',
  missed: 'Non atteint',
  not_started: 'Pas commencé',
};

export function formatValue(v: number, unit: string | null) {
  const n = Math.round(v * 10) / 10;
  const s = n.toLocaleString('fr-FR');
  if (!unit) return s;
  if (unit === '€' || unit === '%') return `${s} ${unit}`;
  return `${s} ${unit}`;
}

// ---------- Objectifs suggérés ----------

export interface GoalPreset {
  title: string;
  axis: string;
  metric: string;
  unit: string;
  target: number;
}
export const GOAL_PRESETS: GoalPreset[] = [
  { title: 'Dates jouées dans l’année', axis: 'live', metric: 'auto:dates_jouees', unit: 'dates', target: 20 },
  { title: 'Dates hors de Lyon', axis: 'live', metric: 'auto:hors_lyon', unit: 'dates', target: 8 },
  { title: 'Festivals', axis: 'live', metric: 'auto:festivals', unit: 'festivals', target: 3 },
  { title: 'Taux de réponse aux démarches', axis: 'pro', metric: 'auto:taux_reponse', unit: '%', target: 30 },
  { title: 'Lieux démarchés', axis: 'pro', metric: 'auto:demarches', unit: 'lieux', target: 150 },
  { title: 'Cachet moyen', axis: 'eco', metric: 'auto:cachet_moyen', unit: '€', target: 400 },
  { title: 'Auditeurs mensuels Spotify', axis: 'public', metric: 'manual', unit: 'auditeurs', target: 2000 },
  { title: 'Abonnés Instagram', axis: 'public', metric: 'manual', unit: 'abonnés', target: 3000 },
  { title: 'Inscrits à la newsletter', axis: 'public', metric: 'manual', unit: 'inscrits', target: 500 },
  { title: 'Retombées presse / radio', axis: 'public', metric: 'manual', unit: 'articles', target: 10 },
  { title: 'Aides et subventions obtenues', axis: 'eco', metric: 'manual', unit: '€', target: 5000 },
  { title: 'Titres enregistrés', axis: 'creation', metric: 'manual', unit: 'titres', target: 6 },
];

// ---------- Modèles de rétroplanning ----------

export interface TemplateStep {
  offset: number;
  title: string;
  phase: string;
}
export interface ProjectTemplate {
  key: string;
  label: string;
  target: string; // what the target date is
  hint: string;
  steps: TemplateStep[];
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    key: 'sortie',
    label: 'Sortie d’EP / album',
    target: 'Date de sortie',
    hint: 'Deux singles avant la sortie, presse et playlists',
    steps: [
      { offset: -120, phase: 'Production', title: 'Masters et artwork finalisés' },
      { offset: -110, phase: 'Admin', title: 'Dépôt SACEM des œuvres, codes ISRC, crédits' },
      { offset: -100, phase: 'Stratégie', title: 'Plan de sortie : singles, budget, cibles presse et radio' },
      { offset: -90, phase: 'Distribution', title: 'Livrer le projet au distributeur' },
      { offset: -75, phase: 'Promo', title: 'Pitch Spotify for Artists du premier single' },
      { offset: -70, phase: 'Promo', title: 'EPK à jour : bio, photos, liens, revue de presse' },
      { offset: -60, phase: 'Presse', title: 'Contacter attaché·e de presse, radios associatives (Ferarock…)' },
      { offset: -56, phase: 'Sortie', title: 'Premier single + clip ou visualizer' },
      { offset: -45, phase: 'Presse', title: 'Envoi aux webzines et à la presse spécialisée' },
      { offset: -35, phase: 'Promo', title: 'Pitch éditorial du second single' },
      { offset: -28, phase: 'Sortie', title: 'Second single' },
      { offset: -21, phase: 'Live', title: 'Annoncer la release party' },
      { offset: -14, phase: 'Promo', title: 'Pré-save, teasers et calendrier de publications' },
      { offset: -7, phase: 'Public', title: 'Newsletter et rappel à la communauté' },
      { offset: 0, phase: 'Sortie', title: 'Sortie' },
      { offset: 7, phase: 'Presse', title: 'Relances presse et radios' },
      { offset: 30, phase: 'Bilan', title: 'Bilan : écoutes, playlists, retombées presse' },
    ],
  },
  {
    key: 'single',
    label: 'Sortie d’un single',
    target: 'Date de sortie',
    hint: 'Six semaines de préparation',
    steps: [
      { offset: -42, phase: 'Distribution', title: 'Livrer le titre au distributeur' },
      { offset: -35, phase: 'Admin', title: 'Dépôt SACEM, ISRC, crédits' },
      { offset: -28, phase: 'Promo', title: 'Pitch Spotify for Artists' },
      { offset: -21, phase: 'Presse', title: 'Envoi presse et radios' },
      { offset: -10, phase: 'Promo', title: 'Teasers et pré-save' },
      { offset: 0, phase: 'Sortie', title: 'Sortie' },
      { offset: 14, phase: 'Bilan', title: 'Bilan et relances' },
    ],
  },
  {
    key: 'tournee',
    label: 'Tournée / série de dates',
    target: 'Première date',
    hint: 'Six mois de booking avant la première date',
    steps: [
      { offset: -180, phase: 'Stratégie', title: 'Période, zone, cachet plancher, fiche technique' },
      { offset: -165, phase: 'Booking', title: 'Liste de lieux (Radar) et premiers envois' },
      { offset: -130, phase: 'Booking', title: 'Relances et options posées' },
      { offset: -100, phase: 'Booking', title: 'Compléter les trous du parcours' },
      { offset: -90, phase: 'Admin', title: 'Confirmations et contrats (cession, GUSO)' },
      { offset: -60, phase: 'Logistique', title: 'Véhicule, hébergements, feuille de route' },
      { offset: -45, phase: 'Com', title: 'Affiche, annonce des dates, billetterie' },
      { offset: -30, phase: 'Presse', title: 'Presse locale de chaque ville' },
      { offset: -14, phase: 'Logistique', title: 'Merch commandé, feuille de route au groupe' },
      { offset: -7, phase: 'Com', title: 'Rappels au public' },
      { offset: 0, phase: 'Live', title: 'Première date' },
      { offset: 10, phase: 'Bilan', title: 'Bilan financier, remerciements aux lieux' },
    ],
  },
  {
    key: 'candidature',
    label: 'Candidature festival / tremplin',
    target: 'Date limite',
    hint: 'Dossier complet et à l’heure',
    steps: [
      { offset: -45, phase: 'Repérage', title: 'Lire l’appel et les critères' },
      { offset: -30, phase: 'Dossier', title: 'Réunir EPK, vidéo live, fiche technique, revue de presse' },
      { offset: -14, phase: 'Dossier', title: 'Rédiger le dossier' },
      { offset: -3, phase: 'Dossier', title: 'Relire et envoyer' },
      { offset: 0, phase: 'Échéance', title: 'Date limite' },
      { offset: 45, phase: 'Suivi', title: 'Relancer si pas de nouvelles' },
    ],
  },
  {
    key: 'aide',
    label: 'Demande d’aide / subvention',
    target: 'Date de dépôt',
    hint: 'CNM, SACEM, Adami, Spedidam, Région…',
    steps: [
      { offset: -60, phase: 'Éligibilité', title: 'Vérifier les critères (statut, SIRET, dates)' },
      { offset: -45, phase: 'Budget', title: 'Budget prévisionnel et devis' },
      { offset: -30, phase: 'Dossier', title: 'Note d’intention, calendrier, partenaires' },
      { offset: -14, phase: 'Dossier', title: 'Lettres de soutien (lieux, label, SMAC)' },
      { offset: -3, phase: 'Dossier', title: 'Dépôt du dossier' },
      { offset: 0, phase: 'Échéance', title: 'Date limite' },
      { offset: 90, phase: 'Suivi', title: 'Suivi de la réponse, bilan si obtenue' },
    ],
  },
  {
    key: 'clip',
    label: 'Clip / vidéo live',
    target: 'Mise en ligne',
    hint: 'De l’idée à la diffusion',
    steps: [
      { offset: -75, phase: 'Préprod', title: 'Concept, réalisateur·rice, budget' },
      { offset: -60, phase: 'Préprod', title: 'Repérages et autorisations' },
      { offset: -45, phase: 'Tournage', title: 'Tournage' },
      { offset: -30, phase: 'Postprod', title: 'Montage et étalonnage' },
      { offset: -14, phase: 'Promo', title: 'Teasers et miniature' },
      { offset: -7, phase: 'Presse', title: 'Avant-première proposée à un média' },
      { offset: 0, phase: 'Sortie', title: 'Mise en ligne' },
    ],
  },
  {
    key: 'residence',
    label: 'Résidence de création',
    target: 'Début de résidence',
    hint: 'Préparer le set et la scène',
    steps: [
      { offset: -120, phase: 'Recherche', title: 'Candidater auprès des lieux (SMAC, scènes)' },
      { offset: -60, phase: 'Préparation', title: 'Objectifs : set, son, lumière, scénographie' },
      { offset: -30, phase: 'Équipe', title: 'Technicien·nes son et lumière, plan de scène' },
      { offset: -7, phase: 'Logistique', title: 'Transport, hébergement, matériel' },
      { offset: 0, phase: 'Résidence', title: 'Début de résidence' },
      { offset: 14, phase: 'Bilan', title: 'Captation et bilan' },
    ],
  },
];
export const templateInfo = (k: string | null) => TEMPLATES.find((t) => t.key === k) ?? null;

/** The next things to do across projects: late first, then the coming days. */
export function upcomingSteps(projects: PlanProject[], steps: PlanStep[], today: string, horizonDays = 14) {
  const byId = new Map(projects.filter((p) => !p.archived_at).map((p) => [p.id, p]));
  const limit = addDays(today, horizonDays);
  return steps
    .filter((s) => !s.done_at && byId.has(s.project_id))
    .map((s) => ({ step: s, project: byId.get(s.project_id)!, date: stepDate(byId.get(s.project_id)!, s) }))
    .filter((x) => x.date <= limit)
    .sort((a, b) => a.date.localeCompare(b.date));
}
