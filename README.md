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

## Connecteur MCP (Claude ↔ CRM)

Le CRM expose un serveur MCP distant (transport Streamable HTTP) sur deux adresses :

| Adresse | Auth | Outils | Usage |
|---|---|---|---|
| `/api/mcp` | OAuth 2.1 (DCR + PKCE) | tous (53) | Connecteur personnalisé claude.ai / Cowork : lire et écrire tout le CRM |
| `/api/mcp/<MCP_SECRET>` | secret dans l'URL | les 4 outils radar | Artifact **KRUZBERG Booking Radar** (inchangé) |

L'URL secrète est volontairement limitée aux 4 outils du radar : si elle fuit,
elle ne permet ni de lire ni de modifier le reste du CRM.

- Routes : `src/app/api/mcp/route.ts`, `src/app/api/mcp/[secret]/route.ts`, `src/app/api/oauth/*`, `src/app/.well-known/*`, page de consentement `src/app/oauth/authorize/page.tsx`
- Logique : `src/lib/mcp/` (outils, service, audit), `src/lib/oauth/` (serveur d'autorisation) — tests : `npm test`
- Migrations requises : `012_add_deal_external_ref.sql`, `014_mcp_full_crm.sql`

### Outils

Lecture (`readOnlyHint: true`) :

| Outil | Paramètres principaux |
|---|---|
| `get_schema` | — (entités, champs modifiables en JSON Schema, étapes, catégories, canaux, conventions) |
| `search` | `query`, `entities?`, `limit?` — plein texte sans accents, toutes entités |
| `list_venues` | `type`, `city`, `country`, `min_fit_score`, `has_email` + communs |
| `list_contacts` | `venue_id`, `has_email` + communs |
| `list_deals` | `stage`, `priority`, `venue_type`, `city`, `venue_id`, `contact_id`, `tag`, `external_source`, `external_id`, `follow_up_before/after`, `concert_after/before`, `show_on_website` + communs |
| `list_tasks` | `status` (open/done/all), `deal_id`, `venue_id`, `due_before/after` + communs |
| `list_activities` | `deal_id`, `venue_id`, `contact_id`, `type`, `channel`, `after`, `before` + communs |
| `list_tours` | `status`, `start_after/before` + communs |
| `list_templates` | `category` + communs |
| `get_venue` / `get_contact` / `get_deal` / `get_task` / `get_tour` / `get_template` | `id` — avec relations (contacts, opportunités, historique d'étapes, notes, tâches, étapes de tournée, totaux) |
| `find_duplicates` | `entity` (venue/contact/deal), `by` (name, name_city, email, domain) |
| `get_audit_log` | `entity?`, `entity_id?`, `tool?`, `since?`, `until?`, `cursor?`, `limit?` |
| `find_opportunity`, `list_pipeline_stages` | outils radar (inchangés) |

Paramètres communs des `list_*` : `archived` (exclude/only/include), `updated_after/before`,
`sort`, `order`, `cursor`, `limit` (≤ 200, défaut 50).

Écriture :

| Outil | Paramètres | Notes |
|---|---|---|
| `create_venue` / `_contact` / `_deal` / `_task` / `_tour` / `_tour_stop` / `_tour_expense` / `_template` | champs de l'entité | Renvoie l'objet complet |
| `update_<entité>` (les 8 ci-dessus + `activity`) | `id`, `expected_updated_at`, `patch` | Patch partiel ; conflit de version si l'objet a changé |
| `archive_<entité>` (idem) | `id`, `expected_updated_at?` | `destructiveHint` ; soft delete en cascade, restaurable |
| `restore` | `entity`, `id` | Restaure tout ce qui a été archivé ensemble |
| `add_note` | `deal_id`/`venue_id`/`contact_id`, `content`, `date?` | |
| `log_activity` | cible, `kind` (email_sent, relance, call, message, reply_received, concert_played), `channel`, `date`, `content?`, `stage?`, `update_deal?` | Met à jour dernier message / premier contact / canal |
| `move_stage` | `id`, `stage`, `note?`, `expected_updated_at?` | Alias propre de `update_stage` |
| `set_follow_up` | `deal_id`, `date` (ou null) | Refusé aux étapes confirme/termine/refuse |
| `bulk_update` | `entity`, `items[≤50]` (`id`, `patch`, `expected_updated_at?`), `dry_run` (défaut **true**) | `destructiveHint` ; tout ou rien |
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
4. Les accès actifs se voient et se révoquent dans le CRM, menu **Connexions Claude**.

### Tests

- Unitaires et intégration : `npm test`.
- De bout en bout (OAuth + MCP Inspector, sur la prod) : `node scripts/mcp-oauth-e2e.mjs` — ou à la main : `npx @modelcontextprotocol/inspector`, transport « Streamable HTTP »,
  URL `https://kruzberg-crm.vercel.app/api/mcp`, bouton « Open Auth Settings » → « Quick OAuth Flow ».
- Radar (URL secrète) : `node scripts/mcp-smoke.mjs`.

## Deployment

Deploy to Vercel by connecting your GitHub repository. Add environment variables in the Vercel dashboard.

## License

Private — KRUZBERG internal tool.
