import { z } from 'zod';
import { STAGES, type DealStage } from '@/types/database';

export const RADAR_CATEGORIES = [
  'festivals',
  'tremplins',
  'booking_fr',
  'booking_eu',
  'support',
  'pros',
  'presse',
] as const;
export type RadarCategory = (typeof RADAR_CATEGORIES)[number];

const STAGE_IDS = STAGES.map((s) => s.key) as [DealStage, ...DealStage[]];

const stage = z.enum(STAGE_IDS, {
  error: `Étape inconnue. Valeurs possibles : ${STAGE_IDS.join(', ')} (voir list_pipeline_stages).`,
});
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : YYYY-MM-DD');
const text = (max: number) => z.string().trim().max(max);

// Optional fields accept null as well as absence: the radar page builds objects
// from JSON where missing values are often null.
export const addToPipelineInput = z.strictObject({
  external_id: text(100).min(1).describe('Id de la piste dans le radar, ex. "sp-013". Clé de dédoublonnage.'),
  category: z.enum(RADAR_CATEGORIES).describe('Rubrique du radar.'),
  name: text(200)
    .min(1)
    .describe('Lieu, festival, label, média — ou groupe en tête d\'affiche pour category "support".'),
  type: text(100).nullish().describe('Type libre, ex. "bar-concert", "label", "webzine", "tremplin".'),
  venue: text(200).nullish().describe('Salle du concert (category "support").'),
  city: text(100).nullish(),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Code pays ISO à 2 lettres attendu, ex. "FR"')
    .nullish()
    .describe('Code ISO 3166-1 alpha-2. FR par défaut.'),
  region: text(100).nullish(),
  capacity: z.union([text(50), z.number()]).nullish().describe('Jauge, ex. "300" ou "300 debout".'),
  contact_name: text(200).nullish(),
  emails: z.array(z.email('Email invalide').max(254)).max(10).nullish(),
  links: z
    .array(z.strictObject({ label: text(100), url: z.url('URL invalide').max(2000) }))
    .max(20)
    .nullish(),
  event_date: text(100).nullish().describe('"YYYY-MM-DD" ou texte libre.'),
  deadline: isoDate.nullish().describe('Date limite de candidature, "YYYY-MM-DD". Crée une tâche.'),
  fit: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullish().describe('Pertinence 1 (faible) à 3 (forte).'),
  why: text(2000).nullish(),
  action: text(2000).nullish(),
  support: text(2000).nullish(),
  verified: text(500).nullish(),
  radar_status: text(100).nullish().describe('Statut dans le radar ("nouveau", "à contacter"…). Consigné dans la note.'),
  stage: stage.nullish().describe("Id d'étape du CRM. Par défaut : a_contacter à la création, inchangée à la mise à jour."),
});
export type AddToPipelineInput = z.infer<typeof addToPipelineInput>;

export const findOpportunityInput = z
  .strictObject({
    external_id: text(100).min(1).optional().describe('Id radar, ex. "sp-013".'),
    email: z.email('Email invalide').optional(),
    name: text(200).min(2).optional().describe('Nom (ou partie du nom) de la structure ou du contact.'),
  })
  .refine((v) => v.external_id || v.email || v.name, {
    message: 'Fournis au moins un critère : external_id, email ou name.',
  });
export type FindOpportunityInput = z.infer<typeof findOpportunityInput>;

export const listPipelineStagesInput = z.strictObject({});

export const updateStageInput = z.strictObject({
  id: z.uuid("Id d'opportunité invalide (UUID attendu)").describe("Id de l'opportunité (renvoyé par add_to_pipeline)."),
  stage,
  note: text(2000).min(1).optional().describe('Note ajoutée à l\'historique.'),
});
export type UpdateStageInput = z.infer<typeof updateStageInput>;

// ---------- Outputs ----------

export const addToPipelineOutput = z.object({
  id: z.string(),
  created: z.boolean(),
  stage: z.string(),
  url: z.string(),
  matched_by: z.enum(['external_id', 'email', 'name_city']).nullable(),
});

const opportunitySummary = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  stage: z.string(),
  external_id: z.string().nullable(),
  url: z.string(),
});

export const findOpportunityOutput = z.object({ results: z.array(opportunitySummary) });

export const listPipelineStagesOutput = z.object({
  entry_stage: z.string(),
  stages: z.array(z.object({ id: z.string(), label: z.string() })),
});

export const updateStageOutput = z.object({
  id: z.string(),
  previous_stage: z.string(),
  stage: z.string(),
  url: z.string(),
});
