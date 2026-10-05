import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  addNote,
  archiveEntity,
  bulkUpdate,
  createEntity,
  getBriefing,
  linkBandToDeal,
  listApplicationDeadlines,
  saveBriefing,
  unlinkBandFromDeal,
  findDuplicates,
  getAuditLog,
  getEntity,
  getSchema,
  listEntities,
  logActivity,
  MAX_BULK,
  MAX_LIMIT,
  moveStage,
  restoreEntity,
  search,
  setFollowUp,
  updateEntity,
} from './crm-service';
import {
  BAND_ROLE_IDS,
  CHANNEL_IDS,
  EXCHANGE_STATUS_IDS,
  STYLE_FIT_IDS,
  channelEnum,
  dateOrDateTime,
  ENTITIES,
  ENTITY_KEYS,
  entityEnum,
  enumOf,
  isoDate,
  LOGGABLE_ACTIVITY_TYPES,
  PRIORITY_IDS,
  stageEnum,
  STAGE_IDS,
  TEMPLATE_CATEGORY_IDS,
  TOUR_STATUS_IDS,
  VENUE_TYPE_IDS,
  type EntityKey,
} from './entities';
import { depsFor, runTool, takeFor, type McpContext } from './tools';
import { MAX_RADAR_BATCH, radarBatch, radarGet, radarList, RADAR_COLLECTIONS } from './radar';
import { radarFeedback, radarKnownCheck, type Candidate } from './radar-insights';
import { radarSyncAck, radarSyncBaseline, radarSyncPush, radarSyncRefetch, radarSyncStatus } from './radar-sync';
import type { Row } from './store';

// Full read/write access to the CRM for Claude (OAuth endpoint only).

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const IDEMPOTENT_WRITE = { ...WRITE, idempotentHint: true } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } as const;

const id = (what: string) => z.uuid(`Id ${what} invalide (UUID attendu)`);
const expected = z
  .string()
  .min(10)
  .max(40)
  .describe('Valeur updated_at lue juste avant (get_* / list_*). Protège contre l’écrasement d’une modification concurrente.');
/** One value or a list of values of an enum, with an error listing the valid values. */
const oneOrMany = <T extends string>(values: readonly [T, ...T[]], what: string) => {
  const e = enumOf(values, what);
  return z.union([e, z.array(e).min(1).max(20)], {
    error: `${what} inconnu(e). Valeurs possibles (une valeur ou une liste) : ${values.join(', ')}.`,
  });
};

const listBase = (entity: EntityKey) => {
  const d = ENTITIES[entity];
  return {
    archived: z
      .enum(['exclude', 'only', 'include'])
      .optional()
      .describe('exclude (défaut) : actifs seulement ; only : archives seulement ; include : tout.'),
    updated_after: dateOrDateTime.optional().describe('Modifiés depuis cette date.'),
    updated_before: dateOrDateTime.optional().describe('Modifiés avant cette date.'),
    sort: enumOf(d.sortable as [string, ...string[]], 'Tri').optional().describe(`Tri (défaut ${d.defaultSort}) : ${d.sortable.join(', ')}.`),
    order: z.enum(['asc', 'desc']).optional(),
    cursor: z.string().max(500).optional().describe('next_cursor de la page précédente (mêmes filtres).'),
    limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`1 à ${MAX_LIMIT}, défaut 50.`),
  };
};

const LIST_FILTERS: Partial<Record<EntityKey, z.ZodRawShape>> = {
  venue: {
    type: oneOrMany(VENUE_TYPE_IDS, 'Type de structure').optional().describe(`Catégorie : ${VENUE_TYPE_IDS.join(', ')}.`),
    city: z.string().trim().min(1).max(100).optional().describe('Ville (contient, insensible à la casse).'),
    country: z.string().trim().min(1).max(100).optional(),
    min_fit_score: z.number().int().min(1).max(5).optional(),
    has_email: z.boolean().optional(),
    style_fit: oneOrMany(STYLE_FIT_IDS, 'Style').optional().describe('yes = programme notre style, maybe, no.'),
    contactable: z.boolean().optional().describe('true = pas de « ne pas recontacter avant » en cours.'),
    has_application_deadline: z.boolean().optional().describe('true = structures avec une échéance de candidature annuelle.'),
  },
  band: {
    city: z.string().trim().min(1).max(100).optional(),
    exchange_status: oneOrMany(EXCHANGE_STATUS_IDS, "Statut d'échange").optional().describe('we_owe = on leur doit une date ; they_owe = ils nous en doivent une.'),
  },
  contact: {
    venue_id: id('de structure').optional(),
    has_email: z.boolean().optional(),
  },
  deal: {
    stage: oneOrMany(STAGE_IDS, 'Étape').optional(),
    priority: oneOrMany(PRIORITY_IDS, 'Priorité').optional(),
    venue_type: oneOrMany(VENUE_TYPE_IDS, 'Type de structure').optional().describe('Catégorie de la structure.'),
    city: z.string().trim().min(1).max(100).optional().describe('Ville de la structure (contient).'),
    venue_id: id('de structure').optional(),
    contact_id: id('de contact').optional(),
    tag: z.string().trim().min(1).max(50).optional(),
    external_source: z.string().trim().min(1).max(50).optional(),
    external_id: z.string().trim().min(1).max(100).optional().describe('Id de piste du Booking Radar.'),
    follow_up_before: dateOrDateTime.optional().describe('Relance prévue au plus tard à cette date (ex. aujourd’hui = relances dues).'),
    follow_up_after: dateOrDateTime.optional(),
    concert_after: isoDate.optional(),
    concert_before: isoDate.optional(),
    show_on_website: z.boolean().optional(),
  },
  task: {
    status: z.enum(['open', 'done', 'all']).optional().describe('open = à faire, done = faites, all (défaut).'),
    deal_id: id("d'opportunité").optional(),
    venue_id: id('de structure').optional(),
    due_before: isoDate.optional(),
    due_after: isoDate.optional(),
  },
  activity: {
    deal_id: id("d'opportunité").optional(),
    venue_id: id('de structure').optional(),
    contact_id: id('de contact').optional(),
    type: oneOrMany([...LOGGABLE_ACTIVITY_TYPES, 'status_change'], "Type d'activité").optional(),
    channel: channelEnum.optional(),
    after: dateOrDateTime.optional(),
    before: dateOrDateTime.optional(),
  },
  tour: {
    status: oneOrMany(TOUR_STATUS_IDS, 'Statut de tournée').optional(),
    start_after: isoDate.optional(),
    start_before: isoDate.optional(),
  },
  template: {
    category: oneOrMany(TEMPLATE_CATEGORY_IDS, 'Catégorie de modèle').optional(),
  },
};

const LIST_DESCRIPTIONS: Partial<Record<EntityKey, string>> = {
  venue:
    'Liste les structures (lieux, festivals, organisateurs, médias…). Filtres : type (catégorie), ville, pays, pertinence, email présent, style (programme notre style), contactable (pas de « ne pas recontacter avant » en cours), échéance de candidature.',
  band: 'Liste les groupes amis (plateaux partagés, échanges de dates). Filtres : ville, statut d’échange.',
  contact: 'Liste les contacts. Filtres : structure, email présent.',
  deal:
    'Liste les opportunités du pipeline. Filtres : étape(s), priorité, catégorie et ville de la structure, tag, external_id radar, date de relance (follow_up_before = relances dues), date de concert. Chaque élément inclut venue_name/venue_city.',
  task: 'Liste les tâches. Filtres : à faire/faites, opportunité, structure, échéance.',
  activity: 'Liste l’historique (notes, mails, relances, appels, DM, réponses, changements d’étape). Filtres : cible, type, canal, période.',
  tour: 'Liste les tournées. Filtres : statut, date de début.',
  template: 'Liste les modèles de mail. Filtre : catégorie.',
};

const GET_DESCRIPTIONS: Partial<Record<EntityKey, string>> = {
  venue: 'Fiche complète d’une structure avec ses contacts, opportunités, tâches et activités récentes.',
  contact: 'Fiche complète d’un contact avec sa structure, ses opportunités et son historique.',
  deal: 'Fiche complète d’une opportunité : structure, contact principal et autres contacts, historique des étapes (stage_history), notes et activités, tâches, dates de tournée.',
  task: 'Détail d’une tâche avec son opportunité et sa structure.',
  tour: 'Détail d’une tournée avec ses étapes (jours), dépenses et totaux (cachets, hôtels, dépenses).',
  template: 'Détail d’un modèle de mail (sujet, corps).',
  band: 'Fiche d’un groupe ami avec les dates faites ensemble (deals_together).',
};

const CREATE_NOTES: Partial<Record<EntityKey, string>> = {
  deal: ' Exige venue_id ou contact_id. Étape par défaut : a_contacter. Pour une piste du Booking Radar, préférer add_to_pipeline.',
  contact: ' venue_id rattache le contact à une structure.',
  tour_stop: ' Une ligne = un jour de tournée (show, day_off, travel).',
};

export function registerFullCrmTools(server: McpServer, ctx: McpContext) {
  const run = <A>(tool: string, fn: (deps: ReturnType<typeof depsFor>, args: A) => unknown) => (args: A) =>
    runTool(async () => (await fn(depsFor(ctx, tool), args)) as Record<string, unknown>, takeFor(ctx));

  // ---------------- Lecture

  server.registerTool(
    'get_schema',
    {
      title: 'Schéma du CRM',
      description:
        'À appeler en premier : liste les entités, leurs champs modifiables (JSON Schema), les étapes du pipeline, les catégories, canaux, statuts et les conventions (versions, archivage, pagination, radar).',
      inputSchema: z.strictObject({}),
      annotations: READ,
    },
    run('get_schema', () => getSchema()),
  );

  server.registerTool(
    'search',
    {
      title: 'Recherche plein texte',
      description:
        'Recherche dans tout le CRM (structures, contacts, opportunités, tâches, notes/activités, tournées, modèles) : nom, ville, email, téléphone, site, notes, contenu des notes. ' +
        'Insensible aux accents et à la casse ; tous les mots doivent être présents. Renvoie { entity, id, name, city, matched_fields, snippet, url }, meilleurs résultats d’abord.',
      inputSchema: z.strictObject({
        query: z.string().trim().min(2).max(200),
        entities: z.array(entityEnum).min(1).max(9).optional().describe('Limiter à ces entités.'),
        limit: z.number().int().min(1).max(100).optional().describe('Défaut 20.'),
      }),
      annotations: READ,
    },
    run('search', (deps, a: { query: string; entities?: EntityKey[]; limit?: number }) => search(deps, a.query, a.entities, a.limit ?? 20)),
  );

  for (const entity of ['venue', 'contact', 'deal', 'task', 'activity', 'tour', 'template', 'band'] as EntityKey[]) {
    const d = ENTITIES[entity];
    server.registerTool(
      `list_${d.plural}`,
      {
        title: `Lister : ${d.label}s`,
        description: `${LIST_DESCRIPTIONS[entity]} Tri, pagination par curseur (next_cursor), ${MAX_LIMIT} max par page. Archives exclues par défaut.`,
        inputSchema: z.strictObject({ ...listBase(entity), ...LIST_FILTERS[entity] }),
        annotations: READ,
      },
      run(`list_${d.plural}`, (deps, a: Record<string, unknown>) => listEntities(deps, entity, a)),
    );
  }

  for (const entity of ['venue', 'contact', 'deal', 'task', 'tour', 'template', 'band'] as EntityKey[]) {
    const d = ENTITIES[entity];
    server.registerTool(
      `get_${entity}`,
      {
        title: `Fiche : ${d.label}`,
        description: `${GET_DESCRIPTIONS[entity]} Fonctionne aussi sur un élément archivé (archived: true).`,
        inputSchema: z.strictObject({ id: id(`de ${d.label}`) }),
        annotations: READ,
      },
      run(`get_${entity}`, (deps, a: { id: string }) => getEntity(deps, entity, a.id)),
    );
  }

  server.registerTool(
    'find_duplicates',
    {
      title: 'Trouver les doublons',
      description:
        'Repère les doublons probables. Critères : name (nom normalisé, sans accents ni article), name_city (nom + ville), email, domain (domaine de l’email ou du site, hors gmail/orange…). ' +
        'Pour les opportunités, "email" regroupe les opportunités ouvertes sur la même structure + contact. Renvoie des groupes ; ne modifie rien.',
      inputSchema: z.strictObject({
        entity: z.enum(['venue', 'contact', 'deal'], { error: 'Valeurs possibles : venue, contact, deal.' }),
        by: z
          .array(z.enum(['name', 'name_city', 'email', 'domain'], { error: 'Valeurs possibles : name, name_city, email, domain.' }))
          .min(1)
          .max(4)
          .optional()
          .describe('Défaut : name_city, email, domain.'),
      }),
      annotations: READ,
    },
    run('find_duplicates', (deps, a: { entity: 'venue' | 'contact' | 'deal'; by?: ('name' | 'name_city' | 'email' | 'domain')[] }) =>
      findDuplicates(deps, a.entity, a.by ?? ['name_city', 'email', 'domain']),
    ),
  );

  server.registerTool(
    'get_audit_log',
    {
      title: "Journal d'audit",
      description:
        'Historique des écritures faites via le connecteur (Claude et Booking Radar) : qui (actor), quand, quel outil, action (create, update, archive, restore), état avant/après. Plus récent d’abord.',
      inputSchema: z.strictObject({
        entity: enumOf([...ENTITY_KEYS, 'deal_band', 'briefing'], 'Entité').optional(),
        entity_id: z.uuid().optional(),
        tool: z.string().trim().min(1).max(50).optional().describe('Nom d’outil, ex. update_deal.'),
        since: dateOrDateTime.optional(),
        until: dateOrDateTime.optional(),
        cursor: z.string().max(500).optional(),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
      }),
      annotations: READ,
    },
    run('get_audit_log', (deps, a: Parameters<typeof getAuditLog>[1]) => getAuditLog(deps, a)),
  );

  // ---------------- Écriture

  for (const entity of ['venue', 'contact', 'deal', 'task', 'tour', 'tour_stop', 'tour_expense', 'template', 'band'] as EntityKey[]) {
    const d = ENTITIES[entity];
    server.registerTool(
      `create_${entity}`,
      {
        title: `Créer : ${d.label}`,
        description: `Crée un(e) ${d.label}. ${d.description}${CREATE_NOTES[entity] ?? ''} Renvoie l’objet complet créé (avec id et updated_at). Appelle get_schema pour les champs et valeurs possibles.`,
        inputSchema: d.create,
        annotations: WRITE,
      },
      run(`create_${entity}`, (deps, a: Row) => createEntity(deps, entity, a)),
    );
  }

  for (const entity of ['venue', 'contact', 'deal', 'task', 'activity', 'tour', 'tour_stop', 'tour_expense', 'template', 'band'] as EntityKey[]) {
    const d = ENTITIES[entity];
    server.registerTool(
      `update_${entity}`,
      {
        title: `Modifier : ${d.label}`,
        description:
          `Modifie partiellement un(e) ${d.label} : seuls les champs présents dans patch changent (null efface un champ facultatif). ` +
          'expected_updated_at est obligatoire : si l’objet a changé depuis ta lecture, rien n’est écrit et l’erreur renvoie la version actuelle. ' +
          (entity === 'deal' ? 'Pour l’étape, move_stage ; pour la relance, set_follow_up. ' : '') +
          'Renvoie l’objet complet après modification.',
        inputSchema: z.strictObject({ id: id(`de ${d.label}`), expected_updated_at: expected, patch: d.patch }),
        annotations: IDEMPOTENT_WRITE,
      },
      run(`update_${entity}`, (deps, a: { id: string; expected_updated_at: string; patch: Row }) =>
        updateEntity(deps, entity, a.id, a.patch, a.expected_updated_at),
      ),
    );

    server.registerTool(
      `archive_${entity}`,
      {
        title: `Archiver : ${d.label}`,
        description:
          `Archive un(e) ${d.label} (suppression réversible, jamais définitive) : il/elle disparaît du CRM. ` +
          (entity === 'venue'
            ? 'Archive aussi ses contacts, opportunités et tâches. '
            : entity === 'contact'
              ? 'Archive aussi ses opportunités sans structure. '
              : entity === 'deal'
                ? 'Archive aussi ses tâches et retire la date de kruzberg.com. '
                : entity === 'tour'
                  ? 'Archive aussi ses étapes et dépenses. '
                  : '') +
          'Annulable avec restore. Demande confirmation à l’utilisateur avant d’archiver.',
        inputSchema: z.strictObject({ id: id(`de ${d.label}`), expected_updated_at: expected.optional() }),
        annotations: DESTRUCTIVE,
      },
      run(`archive_${entity}`, (deps, a: { id: string; expected_updated_at?: string }) => archiveEntity(deps, entity, a.id, a.expected_updated_at)),
    );
  }

  server.registerTool(
    'restore',
    {
      title: 'Restaurer un élément archivé',
      description:
        'Restaure un élément archivé et tout ce qui a été archivé avec lui (ex. une structure et ses opportunités). Refuse si son parent a été archivé séparément (restaurer le parent d’abord). Renvoie l’objet restauré.',
      inputSchema: z.strictObject({ entity: entityEnum, id: z.uuid('Id invalide (UUID attendu)') }),
      annotations: IDEMPOTENT_WRITE,
    },
    run('restore', (deps, a: { entity: EntityKey; id: string }) => restoreEntity(deps, a.entity, a.id)),
  );

  const target = {
    deal_id: id("d'opportunité").optional(),
    venue_id: id('de structure').optional(),
    contact_id: id('de contact').optional(),
  };

  server.registerTool(
    'add_note',
    {
      title: 'Ajouter une note',
      description:
        'Ajoute une note à l’historique d’une opportunité, d’une structure ou d’un contact (au moins un des trois). Avec deal_id, la structure et le contact de l’opportunité sont reliés automatiquement. Renvoie la note créée.',
      inputSchema: z.strictObject({
        ...target,
        content: z.string().trim().min(1).max(20000),
        date: dateOrDateTime.optional().describe('Date de la note (défaut : maintenant).'),
      }),
      annotations: WRITE,
    },
    run('add_note', (deps, a: Parameters<typeof addNote>[1]) => addNote(deps, a)),
  );

  server.registerTool(
    'log_activity',
    {
      title: 'Consigner une action',
      description:
        'Consigne une action de prospection : email_sent (mail envoyé), relance, call (appel), message (DM Instagram/Facebook/WhatsApp…), reply_received (réponse reçue), concert_played. ' +
        `channel : ${CHANNEL_IDS.join(', ')}. ` +
        'Sur une opportunité, une action sortante met à jour la date du dernier message, la date de premier contact si vide et le canal de relance ; la prochaine relance est recalculée (dernier message + 7 j) si l’étape est contacte/relance. ' +
        'stage (facultatif) change l’étape en même temps. Renvoie { activity, deal }.',
      inputSchema: z
        .strictObject({
          ...target,
          kind: enumOf(
            ['email_sent', 'relance', 'call', 'message', 'reply_received', 'concert_played'] as const,
            "Type d'action",
          ),
          channel: channelEnum.optional(),
          date: dateOrDateTime.optional().describe('Date de l’action (défaut : maintenant).'),
          content: z.string().trim().max(20000).optional().describe('Détail (objet du mail, résumé de l’appel…).'),
          stage: stageEnum.optional(),
          update_deal: z.boolean().optional().describe('false pour ne pas toucher aux dates de l’opportunité. Défaut true.'),
        })
        .refine((a) => a.deal_id || a.venue_id || a.contact_id, { message: 'Indique deal_id, venue_id ou contact_id.' }),
      annotations: WRITE,
    },
    run('log_activity', (deps, a: Parameters<typeof logActivity>[1]) => logActivity(deps, a)),
  );

  server.registerTool(
    'move_stage',
    {
      title: "Changer l'étape",
      description:
        'Change l’étape d’une opportunité (même effet que update_stage, utilisé par le Booking Radar) et ajoute une note facultative. ' +
        'Le changement est tracé dans stage_history. expected_updated_at (recommandé) évite d’écraser une modification concurrente. Renvoie { previous_stage, deal (objet complet), note }.',
      inputSchema: z.strictObject({
        id: id("d'opportunité"),
        stage: stageEnum,
        note: z.string().trim().min(1).max(20000).optional(),
        expected_updated_at: expected.optional(),
      }),
      annotations: WRITE,
    },
    run('move_stage', (deps, a: Parameters<typeof moveStage>[1]) => moveStage(deps, a)),
  );

  server.registerTool(
    'set_follow_up',
    {
      title: 'Programmer la relance',
      description:
        'Fixe (ou efface avec null) la date de prochaine relance d’une opportunité. Impossible aux étapes confirme, termine, refuse. Renvoie l’opportunité complète.',
      inputSchema: z.strictObject({
        deal_id: id("d'opportunité"),
        date: dateOrDateTime.nullable().describe('YYYY-MM-DD ou date-heure ISO ; null pour effacer.'),
        expected_updated_at: expected.optional(),
      }),
      annotations: IDEMPOTENT_WRITE,
    },
    run('set_follow_up', (deps, a: Parameters<typeof setFollowUp>[1]) => setFollowUp(deps, a)),
  );

  server.registerTool(
    'bulk_update',
    {
      title: 'Modification groupée',
      description:
        `Modifie jusqu’à ${MAX_BULK} éléments d’une même entité (patch par élément, mêmes champs que update_<entité>). ` +
        'dry_run vaut true par défaut : renvoie seulement l’aperçu des changements (avant → après) sans rien écrire. ' +
        'Montre l’aperçu à l’utilisateur, puis rappelle avec dry_run=false pour appliquer. Si un élément est en erreur, rien n’est appliqué. ' +
        'Chaque élément est revérifié contre la version vue dans l’aperçu (conflit de version).',
      inputSchema: z.strictObject({
        entity: enumOf(
          ['venue', 'contact', 'deal', 'task', 'activity', 'tour', 'tour_stop', 'tour_expense', 'template', 'band'],
          'Entité',
        ),
        items: z
          .array(
            z.strictObject({
              id: z.uuid('Id invalide (UUID attendu)'),
              patch: z.record(z.string(), z.unknown()).describe('Champs à modifier (voir get_schema).'),
              expected_updated_at: expected.optional(),
            }),
          )
          .min(1)
          .max(MAX_BULK, `${MAX_BULK} éléments maximum par appel.`),
        dry_run: z.boolean().optional().describe('Défaut true (aperçu). false pour appliquer.'),
      }),
      annotations: DESTRUCTIVE,
    },
    run('bulk_update', (deps, a: Parameters<typeof bulkUpdate>[1]) => bulkUpdate(deps, a)),
  );

  // ---------------- Prospection : échéances, groupes amis, briefing

  server.registerTool(
    'list_application_deadlines',
    {
      title: 'Échéances de candidature',
      description:
        'Festivals, tremplins et autres structures dont la candidature annuelle ferme dans les within_days prochains jours (défaut 60), triés par urgence. ' +
        'status : open (candidatures ouvertes) ou upcoming (ouverture à venir). in_pipeline indique si une opportunité est déjà ouverte.',
      inputSchema: z.strictObject({
        within_days: z.number().int().min(1).max(366).optional(),
        include_in_pipeline: z.boolean().optional().describe('false pour masquer celles déjà dans le pipeline. Défaut true.'),
      }),
      annotations: READ,
    },
    run('list_application_deadlines', (deps, a: Parameters<typeof listApplicationDeadlines>[1]) => listApplicationDeadlines(deps, a)),
  );

  server.registerTool(
    'link_band_to_deal',
    {
      title: 'Ajouter un groupe au plateau',
      description:
        'Associe un groupe ami à une opportunité (plateau partagé, échange de date). role : headliner, support (première partie) ou co_bill. ' +
        'Idempotent : relancer avec un autre role le met à jour. Renvoie la liste des groupes du plateau.',
      inputSchema: z.strictObject({
        deal_id: id("d'opportunité"),
        band_id: id('de groupe'),
        role: enumOf(BAND_ROLE_IDS, 'Rôle').optional().describe('Défaut co_bill.'),
      }),
      annotations: IDEMPOTENT_WRITE,
    },
    run('link_band_to_deal', (deps, a: Parameters<typeof linkBandToDeal>[1]) => linkBandToDeal(deps, a)),
  );

  server.registerTool(
    'unlink_band_from_deal',
    {
      title: 'Retirer un groupe du plateau',
      description: 'Retire un groupe ami d’une opportunité (réversible avec link_band_to_deal). Renvoie la liste des groupes restants.',
      inputSchema: z.strictObject({ deal_id: id("d'opportunité"), band_id: id('de groupe') }),
      annotations: WRITE,
    },
    run('unlink_band_from_deal', (deps, a: Parameters<typeof unlinkBandFromDeal>[1]) => unlinkBandFromDeal(deps, a)),
  );

  server.registerTool(
    'save_briefing',
    {
      title: 'Enregistrer le briefing de la semaine',
      description:
        'Enregistre le briefing de prospection de la semaine (Markdown simple : titres #, listes -, **gras**) ; il s’affiche en haut du tableau de bord du CRM. ' +
        'Un seul briefing par semaine (lundi = week_start, défaut : semaine en cours) : un nouvel appel le remplace. Renvoie le briefing enregistré.',
      inputSchema: z.strictObject({
        week_start: isoDate.optional().describe('Un jour de la semaine visée (ramené au lundi). Défaut : semaine en cours.'),
        title: z.string().trim().min(1).max(200),
        content: z.string().trim().min(1).max(20000),
      }),
      annotations: IDEMPOTENT_WRITE,
    },
    run('save_briefing', (deps, a: Parameters<typeof saveBriefing>[1]) => saveBriefing(deps, a)),
  );

  server.registerTool(
    'get_briefing',
    {
      title: 'Lire un briefing',
      description: 'Renvoie le briefing de la semaine demandée (week_start), ou le plus récent.',
      inputSchema: z.strictObject({ week_start: isoDate.optional() }),
      annotations: READ,
    },
    run('get_briefing', (deps, a: { week_start?: string }) => getBriefing(deps, a)),
  );

  // ---------------- Booking Radar (veille quotidienne, page /radar du CRM)

  const radarCollection = z.enum(RADAR_COLLECTIONS, { error: `Collection inconnue. Valeurs possibles : ${RADAR_COLLECTIONS.join(', ')}.` });
  const radarId = z.string().regex(/^[A-Za-z0-9_.~:@+-]{1,200}$/, 'Id de document invalide (lettres, chiffres, _ . ~ : @ + -).');

  server.registerTool(
    'radar_list',
    {
      title: 'Radar : lister des documents',
      description:
        'Lit le Booking Radar (pistes de prospection de la veille). Collections : leads (une piste par document), config (scope = réglages de veille, meta = dernière veille), runs (journal), outbox (brouillons en attente). ' +
        'fields limite les champs renvoyés (recommandé pour leads, ex. ["name","city","cat","dismissed","dismissReason","status","email","contactForm","fit"]). ' +
        'where filtre sur des champs du document : [champ, "eq"|"ne"|"exists"|"missing", valeur]. Pagination : limit (≤ 1000, défaut 200) + next_cursor. Chaque document renvoie sa version.',
      inputSchema: z.strictObject({
        collection: radarCollection,
        fields: z.array(z.string().min(1).max(60)).max(40).optional(),
        where: z.array(z.tuple([z.string().min(1).max(60), z.enum(['eq', 'ne', 'exists', 'missing']), z.unknown()])).max(10).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
        cursor: z.string().max(20).optional(),
      }),
      annotations: READ,
    },
    run('radar_list', (deps, a: Parameters<typeof radarList>[1]) => radarList(deps, a)),
  );

  server.registerTool(
    'radar_get',
    {
      title: 'Radar : lire un document',
      description: 'Lit un document du Booking Radar en entier, avec sa version (ex. collection "config", id "scope").',
      inputSchema: z.strictObject({ collection: radarCollection, id: radarId }),
      annotations: READ,
    },
    run('radar_get', (deps, a: Parameters<typeof radarGet>[1]) => radarGet(deps, a)),
  );

  server.registerTool(
    'radar_batch',
    {
      title: 'Radar : écrire des documents',
      description:
        `Écrit jusqu'à ${MAX_RADAR_BATCH} documents du Booking Radar en un appel. op "set" crée ou remplace, op "update" fusionne des champs (un champ {"__delete__": true} est supprimé). ` +
        'Toute écriture sur un document existant exige if_version = la version lue ; si une version manque ou a changé, RIEN n\'est écrit et l\'erreur indique quoi relire. ' +
        'Sur leads, un update ne peut pas toucher les champs de Greg (status, notes, dismissed*, addedAt, draft*, crm*, contactedAt, contactChannel, chanceAdj) sauf allow_owner_fields=true (uniquement à la demande explicite de Greg). ' +
        'Aucune suppression de document possible : une piste se retire en la marquant dismissed (côté Greg).',
      inputSchema: z.strictObject({
        writes: z
          .array(
            z.strictObject({
              op: z.enum(['set', 'update'], { error: 'op : "set" ou "update".' }),
              collection: radarCollection,
              id: radarId,
              data: z.record(z.string(), z.unknown()),
              if_version: z.number().int().min(1).optional(),
            }),
          )
          .min(1)
          .max(MAX_RADAR_BATCH, `${MAX_RADAR_BATCH} écritures maximum par appel.`),
        allow_owner_fields: z.boolean().optional(),
      }),
      annotations: WRITE,
    },
    run('radar_batch', (deps, a: Parameters<typeof radarBatch>[1]) => radarBatch(deps, a)),
  );

  server.registerTool(
    'radar_known_check',
    {
      title: 'Radar : déjà connu ? (anti-doublon)',
      description:
        'Avant d\'ajouter des pistes, vérifie si elles sont déjà connues : salle, contact ou opportunité du CRM (non archivés), ou adresse à qui booking@kruzberg.com a déjà écrit (dossier Envoyés). ' +
        'Correspondance par email exact, même domaine (hors webmails), même site web, ou même nom + même ville. Jusqu\'à 100 candidats par appel ; ref = ton identifiant pour relier la réponse. ' +
        'Une piste booking / pros / presse « known » ne doit pas être ajoutée ; pour une 1re partie ou un festival, c\'est une info (le lieu est connu, la date peut rester une vraie piste).',
      inputSchema: z.strictObject({
        candidates: z
          .array(
            z.strictObject({
              ref: z.string().max(100).optional(),
              cat: z.string().max(40).optional(),
              name: z.string().min(1).max(200),
              city: z.string().max(100).optional(),
              venue: z.string().max(200).optional(),
              email: z.string().max(500).optional(),
              website: z.string().max(500).optional(),
            }),
          )
          .min(1)
          .max(100),
      }),
      annotations: READ,
    },
    run('radar_known_check', (deps, a: { candidates: Candidate[] }) => radarKnownCheck(deps, a)),
  );

  server.registerTool(
    'radar_feedback',
    {
      title: 'Radar : retour d\'expérience',
      description:
        'Ce que sont devenues les pistes : passées au pipeline (par rubrique : envoyées, ont répondu, confirmées, refusées, en attente ; exemples positifs et refus), ' +
        'écartées par Greg (raisons par rubrique, exemples récents), ajustements de réalisme de Greg, et pistes ignorées depuis 14 j. À lire au début de chaque veille pour cibler ce qui marche.',
      inputSchema: z.strictObject({}),
      annotations: READ,
    },
    run('radar_feedback', (deps) => radarFeedback(deps)),
  );

  // ---------------- Synchro radar artifact claude.ai ⇄ CRM (tâche horaire)

  const SYNC_NOTE = ' Utilisé par la tâche horaire de synchronisation avec le radar de l\'artifact claude.ai.';

  server.registerTool(
    'radar_sync_status',
    {
      title: 'Synchro radar : comparer les versions',
      description:
        'Étape 1 de la synchro radar artifact ⇄ CRM. artifact_versions = {id: version} de TOUS les documents de la collection dans l\'artifact. ' +
        'Renvoie fetch (ids dont il faut envoyer le contenu avec radar_sync_push) et artifact_writes (écritures à appliquer telles quelles à l\'artifact avec ArtifactData batch : op, collection, doc_id, data, if_version).' +
        SYNC_NOTE,
      inputSchema: z.strictObject({
        collection: radarCollection,
        artifact_versions: z.record(radarId, z.number().int().min(1)),
      }),
      annotations: WRITE,
    },
    run('radar_sync_status', (deps, a: Parameters<typeof radarSyncStatus>[1]) => radarSyncStatus(deps, a)),
  );

  server.registerTool(
    'radar_sync_push',
    {
      title: 'Synchro radar : envoyer des documents de l\'artifact',
      description:
        'Étape 2. Envoie (25 maximum par appel) le contenu exact des documents demandés par radar_sync_status : {id, version, data}. ' +
        'Le CRM fusionne champ par champ avec sa copie, met la sienne à jour et renvoie les artifact_writes à appliquer à l\'artifact.' +
        SYNC_NOTE,
      inputSchema: z.strictObject({
        collection: radarCollection,
        docs: z
          .array(z.strictObject({ id: radarId, version: z.number().int().min(1), data: z.record(z.string(), z.unknown()) }))
          .min(1)
          .max(25, '25 documents maximum par appel.'),
      }),
      annotations: WRITE,
    },
    run('radar_sync_push', (deps, a: Parameters<typeof radarSyncPush>[1]) => radarSyncPush(deps, a)),
  );

  server.registerTool(
    'radar_sync_ack',
    {
      title: 'Synchro radar : confirmer les écritures dans l\'artifact',
      description:
        'Étape 3. Après ArtifactData batch, renvoie pour chaque écriture RÉUSSIE la nouvelle version du document dans l\'artifact : results = [{id, version}]. ' +
        'N\'inclus pas les écritures refusées (conflit) : elles seront refaites au prochain passage.' +
        SYNC_NOTE,
      inputSchema: z.strictObject({
        collection: radarCollection,
        results: z.array(z.strictObject({ id: radarId, version: z.number().int().min(1) })).max(500),
      }),
      annotations: IDEMPOTENT_WRITE,
    },
    run('radar_sync_ack', (deps, a: Parameters<typeof radarSyncAck>[1]) => radarSyncAck(deps, a)),
  );

  server.registerTool(
    'radar_sync_baseline',
    {
      title: 'Synchro radar : initialiser après import',
      description: 'Une seule fois, juste après l\'import initial du radar dans le CRM : prend la copie du CRM comme état commun de départ.' + SYNC_NOTE,
      inputSchema: z.strictObject({ collection: radarCollection }),
      annotations: WRITE,
    },
    run('radar_sync_baseline', (deps, a: Parameters<typeof radarSyncBaseline>[1]) => radarSyncBaseline(deps, a)),
  );

  server.registerTool(
    'radar_sync_refetch',
    {
      title: 'Synchro radar : relire des documents',
      description: 'Réparation : force le prochain passage de synchro à relire ces documents depuis l\'artifact (fusionnés ensuite normalement).' + SYNC_NOTE,
      inputSchema: z.strictObject({ collection: radarCollection, ids: z.array(radarId).min(1).max(1000) }),
      annotations: IDEMPOTENT_WRITE,
    },
    run('radar_sync_refetch', (deps, a: Parameters<typeof radarSyncRefetch>[1]) => radarSyncRefetch(deps, a)),
  );
}
