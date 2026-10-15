# KRUZBERG CRM

Professional booking pipeline CRM for KRUZBERG — an independent rock/metal band tool for venue prospecting, follow-up campaigns, contact relationships, and concert pipeline management.

## Features

- **Dashboard** — KPIs, relance alerts, upcoming concerts, geographic map, activity feed
- **Pipeline** — Kanban + table views with drag-and-drop, filters, side panel, email generation
- **Venues & Contacts** — Split view management, linked contacts, fit scoring, import/export
- **Templates** — Email template editor with variables, live preview, copy-to-clipboard
- **Analytics** — Conversion funnel, response rates, city performance, email volume

## Tech Stack

- **Next.js 16** (App Router, Server Components)
- **TypeScript** (strict mode)
- **Supabase** (PostgreSQL, Auth, RLS, Realtime)
- **Tailwind CSS** + shadcn/ui
- **Zustand** + TanStack Query
- **@dnd-kit** for drag-and-drop
- **Recharts** for analytics
- **Leaflet** for geographic map
- **Framer Motion** for animations

## Getting Started

See [SETUP.md](./SETUP.md) for detailed installation instructions.

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Run development server
npm run dev
```

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── (app)/        # Authenticated app routes
│   ├── login/        # Auth pages
│   └── signup/
├── components/       # React components
│   ├── ui/           # Reusable UI primitives (shadcn)
│   ├── layout/       # Shell, sidebar, header
│   ├── dashboard/    # Dashboard widgets
│   ├── pipeline/     # Kanban, table, side panel
│   ├── venues/       # Venue & contact management
│   └── ...
├── hooks/            # Custom React hooks (data fetching)
├── lib/              # Utilities, Supabase client
├── stores/           # Zustand stores
└── types/            # TypeScript type definitions
```

## Database

Schema and migrations are in `supabase/migrations/`. Seed data in `supabase/seed.sql`.

## Booking Radar (`/radar`)

Pistes de prospection trouvées chaque matin par la veille automatique (tâche planifiée Claude),
triées, rédigées et envoyées au pipeline depuis le CRM.

- Interface : `src/components/radar/` (page `src/app/(app)/radar/page.tsx`), logique portée de l'ex-artifact
  dans `src/lib/radar/` (chances, « à faire », modèles de mails de Greg à l'identique, échéances, doublons).
  Données via `/api/radar/docs` et « + Pipeline » via `/api/radar/crm`, avec la session du CRM.
- Données : table `radar_docs` (migration 017) — collections `leads`, `config` (`scope`, `meta`), `runs`, `outbox`,
  un document JSON par ligne, version incrémentée à chaque écriture.
- Veille : outils MCP `radar_list`, `radar_get`, `radar_batch` (écritures conditionnées par `if_version`,
  champs de Greg protégés, jamais de suppression).
- Import initial depuis l'artifact : `node scripts/radar-import.mjs <dossier export>`.
- Synchro horaire avec l'artifact claude.ai (dans les deux sens) : `src/lib/mcp/radar-sync.ts`, outils `radar_sync_*`.

## Connecteur MCP (Claude ↔ CRM)

Le CRM expose un serveur MCP distant (transport Streamable HTTP) sur deux adresses :

| Adresse | Auth | Outils | Usage |
|---|---|---|---|
| `/api/mcp` | OAuth 2.1 (DCR + PKCE) | tous (66) | Connecteur personnalisé claude.ai / Cowork : lire et écrire tout le CRM |
| `/api/mcp/<MCP_SECRET>` | secret dans l'URL | les 4 outils radar | Artifact **KRUZBERG Booking Radar** (inchangé) |

L'URL secrète est volontairement limitée aux 4 outils du radar : si elle fuit,
elle ne permet ni de lire ni de modifier le reste du CRM.

- Routes : `src/app/api/mcp/route.ts`, `src/app/api/mcp/[secret]/route.ts`, `src/app/api/oauth/*`, `src/app/.well-known/*`, page de consentement `src/app/oauth/authorize/page.tsx`
- Logique : `src/lib/mcp/` (outils, service, audit), `src/lib/oauth/` (serveur d'autorisation) — tests : `npm test`
- Migrations requises : `012_add_deal_external_ref.sql`, `014_mcp_full_crm.sql`, `015_prospection_bands_briefings.sql`

### Outils

Lecture (`readOnlyHint: true`) :

| Outil | Paramètres principaux |
|---|---|
| `get_schema` | — (entités, champs modifiables en JSON Schema, étapes, catégories, canaux, conventions) |
| `search` | `query`, `entities?`, `limit?` — plein texte sans accents, toutes entités |
| `list_venues` | `type`, `city`, `country`, `min_fit_score`, `has_email`, `style_fit`, `contactable`, `has_application_deadline` + communs |
| `list_bands` | `city`, `exchange_status` + communs |
| `list_application_deadlines` | `within_days?` (défaut 60), `include_in_pipeline?` — candidatures annuelles festivals/tremplins |
| `get_briefing` | `week_start?` — briefing de la semaine (ou le dernier) |
| `list_contacts` | `venue_id`, `has_email` + communs |
| `list_deals` | `stage`, `priority`, `venue_type`, `city`, `venue_id`, `contact_id`, `tag`, `external_source`, `external_id`, `follow_up_before/after`, `concert_after/before`, `show_on_website` + communs |
| `list_tasks` | `status` (open/done/all), `deal_id`, `venue_id`, `due_before/after` + communs |
| `list_activities` | `deal_id`, `venue_id`, `contact_id`, `type`, `channel`, `after`, `before` + communs |
| `list_tours` | `status`, `start_after/before` + communs |
| `list_templates` | `category` + communs |
| `get_venue` / `get_contact` / `get_deal` / `get_task` / `get_tour` / `get_template` / `get_band` | `id` — avec relations (contacts, opportunités, historique d'étapes, notes, tâches, étapes de tournée, totaux) |
| `find_duplicates` | `entity` (venue/contact/deal), `by` (name, name_city, email, domain) |
| `get_audit_log` | `entity?`, `entity_id?`, `tool?`, `since?`, `until?`, `cursor?`, `limit?` |
| `find_opportunity`, `list_pipeline_stages` | outils radar (inchangés) |

Paramètres communs des `list_*` : `archived` (exclude/only/include), `updated_after/before`,
`sort`, `order`, `cursor`, `limit` (≤ 200, défaut 50).

Écriture :

| Outil | Paramètres | Notes |
|---|---|---|
| `create_venue` / `_contact` / `_deal` / `_task` / `_tour` / `_tour_stop` / `_tour_expense` / `_template` / `_band` | champs de l'entité | Renvoie l'objet complet |
| `update_<entité>` (les 8 ci-dessus + `activity`) | `id`, `expected_updated_at`, `patch` | Patch partiel ; conflit de version si l'objet a changé |
| `archive_<entité>` (idem) | `id`, `expected_updated_at?` | `destructiveHint` ; soft delete en cascade, restaurable |
| `restore` | `entity`, `id` | Restaure tout ce qui a été archivé ensemble |
| `add_note` | `deal_id`/`venue_id`/`contact_id`, `content`, `date?` | |
| `log_activity` | cible, `kind` (email_sent, relance, call, message, reply_received, concert_played), `channel`, `date`, `content?`, `stage?`, `update_deal?` | Met à jour dernier message / premier contact / canal |
| `move_stage` | `id`, `stage`, `note?`, `expected_updated_at?` | Alias propre de `update_stage` |
| `set_follow_up` | `deal_id`, `date` (ou null) | Refusé aux étapes confirme/termine/refuse |
| `bulk_update` | `entity`, `items[≤50]` (`id`, `patch`, `expected_updated_at?`), `dry_run` (défaut **true**) | `destructiveHint` ; tout ou rien |
| `link_band_to_deal` / `unlink_band_from_deal` | `deal_id`, `band_id`, `role?` (headliner, support, co_bill) | Plateau d'une date ; retrait réversible |
| `save_briefing` | `title`, `content` (Markdown), `week_start?` | Un briefing par semaine, affiché sur le tableau de bord |
| `add_to_pipeline`, `update_stage` | outils radar (inchangés) | |

Garde-fous : chaque écriture renvoie l'objet complet ; chaque ligne écrite
(cascades comprises, outils radar compris) est inscrite dans `mcp_audit_log`
(acteur, outil, action, avant/après) ; jamais de suppression définitive ;
erreurs lisibles avec la liste des valeurs valides ; 60 appels/minute.

Étapes (`stage`) : `a_contacter`, `contacte`, `relance`, `repondu`, `a_suivre`,
`confirme`, `termine`, `refuse`. Le `crmId` du radar est l'`id` de l'opportunité ;
`external_source = "radar"` + `external_id` = id de la piste (unique).

### Variables d'environnement (Vercel → Settings → Environment Variables)

| Variable | Valeur |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role`. **Serveur uniquement.** |
| `MCP_OWNER_ID` | Ton User UID (Supabase → Authentication → Users). Seul ce compte peut autoriser Claude ; toutes les lectures/écritures sont filtrées sur ce `user_id`. |
| `MCP_SECRET` | `openssl rand -hex 32` (≥ 32 caractères). URL du radar. Vide ⇒ URL secrète désactivée. |
| `CRM_PUBLIC_URL` | Optionnel. Base des liens `url` renvoyés. |
| `OAUTH_EXTRA_REDIRECT_URIS` | Optionnel. URL de retour OAuth supplémentaires (séparées par des virgules). Par défaut : callbacks claude.ai / claude.com et `http://localhost:*`. |

Aucun secret ni jeton n'est stocké en clair : la base ne garde que des empreintes SHA-256.

### Ajouter le connecteur dans Claude

1. claude.ai → **Paramètres → Connecteurs → Ajouter un connecteur personnalisé**.
2. Nom : `KRUZBERG CRM` — URL : `https://kruzberg-crm.vercel.app/api/mcp` — laisser les champs OAuth (Client ID / secret) **vides**.
3. Cliquer **Ajouter**, puis **Se connecter** : Claude ouvre la page du CRM
   (connexion avec ton compte si besoin), cliquer **Autoriser**.
4. Les accès actifs se voient et se révoquent dans le CRM : clic sur **KRUZBERG** en haut à gauche → fenêtre **Réglages** → Connexions Claude.

### Tests

- Unitaires et intégration : `npm test`.
- De bout en bout (OAuth + MCP Inspector, sur la prod) : `node scripts/mcp-oauth-e2e.mjs` — ou à la main : `npx @modelcontextprotocol/inspector`, transport « Streamable HTTP »,
  URL `https://kruzberg-crm.vercel.app/api/mcp`, bouton « Open Auth Settings » → « Quick OAuth Flow ».
- Radar (URL secrète) : `node scripts/mcp-smoke.mjs`.

## Deployment

Deploy to Vercel by connecting your GitHub repository. Add environment variables in the Vercel dashboard.

## License

Private — KRUZBERG internal tool.

## Constellation (`/constellation`)

La carte des noms qui reviennent chez les groupes de la niche post-punk (tourneurs, labels, salles, festivals,
premières parties, médias, dispositifs), à partir de recherches sourcées. Reprise de l'outil local
`~/Projects/constellation` : idée de Marion Richeux, méthode de Francis Richert.

- Interface : `src/components/constellation/` (page `src/app/(app)/constellation/page.tsx`), logique dans
  `src/lib/constellation/` (classement, liens entre acteurs, consignes de recherche). Le classement est calculé
  dans le navigateur à partir des données brutes de `/api/constellation/state` ; les actions passent par
  `/api/constellation/action`, avec la session du CRM (propriétaire uniquement).
- Données : table `constellation_docs` (migration 019), même modèle que `radar_docs` : collections `bands`
  (un document par groupe), `findings` (un document par groupe : ses faits sourcés), `overrides` (fusions, mises à
  l'écart, notes par acteur), `watch` (acteurs notés en séance), `jobs` (file des recherches), `config`
  (`synthesis`, `launch`). Badge « CRM » : jointure directe sur `venues`.
- Recherches : elles attendent en file (`jobs`). Chaque action qui met en file réveille la routine Constellation
  (`CONSTELLATION_ROUTINE_ID` / `CONSTELLATION_ROUTINE_TOKEN`, déclencheur API, sans horaire), jusqu'à 3 en
  parallèle ; la page relance une routine arrêtée en route. La routine prend les recherches une à une avec
  `constellation_next_job` (consigne complète + JSON Schema du résultat) et les rend avec
  `constellation_submit_job` ; le CRM range les faits. Après 8 recherches, elle passe le relais à une nouvelle
  routine (`constellation_handoff`), pour garder un contexte court. Une recherche prise depuis plus de 25 min repart en file.
- Import depuis l'outil local : bouton « Importer » de la page, fichier `data/constellation.json`.

Consigne de la routine (claude.ai → Routines, connecteur du CRM activé, recherche web autorisée, déclencheur API) :

```
Tu fais les recherches de Constellation, l'outil de KRUZBERG qui relève les acteurs (tourneurs, labels, salles,
festivals…) chez les groupes de sa niche post-punk. Tout passe par le connecteur du CRM KRUZBERG.

1. Appelle constellation_next_job. Si job est null, arrête-toi : il n'y a plus rien à faire.
2. Fais la recherche demandée en suivant exactement instructions (recherche web si web_search est true).
   Ne relève que ce que tu as trouvé dans une source consultée, avec son URL.
3. Rends le résultat avec constellation_submit_job : job_id, et output = un objet JSON conforme à output_schema.
   Si la recherche n'a rien donné de fiable, passe error (une phrase) à la place de output.
   Si le CRM refuse le résultat (schéma non respecté), corrige-le et rends-le à nouveau.
4. Recommence à l'étape 1. Après 8 recherches, s'il en reste (remaining > 0), appelle constellation_handoff
   (une nouvelle routine prend la suite), puis arrête-toi.
```
