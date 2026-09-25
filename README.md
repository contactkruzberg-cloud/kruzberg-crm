# KRUZBERG CRM

Professional booking pipeline CRM for KRUZBERG — an independent rock/metal band tool for venue prospecting, follow-up campaigns, contact relationships, and concert pipeline management.

## Features

- **Dashboard** — KPIs, relance alerts, upcoming concerts, geographic map, activity feed
- **Pipeline** — Kanban + table views with drag-and-drop, filters, side panel, email generation
- **Venues & Contacts** — Split view management, linked contacts, fit scoring, import/export
- **Templates** — Email template editor with variables, live preview, copy-to-clipboard
- **Focus Mode** — Distraction-free relance workflow with progress tracking
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

## Connecteur MCP (Booking Radar → claude.ai)

Le CRM expose un serveur MCP distant (transport Streamable HTTP) pour que le
**KRUZBERG Booking Radar** (artifact claude.ai) puisse créer ou mettre à jour
des opportunités via un bouton « Add to pipeline ».

- Route : `src/app/api/mcp/[secret]/route.ts` (`mcp-handler` 2 + `@modelcontextprotocol/server` 2 + zod 4)
- Logique : `src/lib/mcp/` — tests : `npm test`
- Migration requise : `supabase/migrations/012_add_deal_external_ref.sql`

### Outils

| Outil | Lecture seule | Rôle |
|---|---|---|
| `add_to_pipeline` | non | Crée ou met à jour (idempotent) l'opportunité d'une piste radar. Dédoublonnage : `external_id` → email → nom normalisé + ville. Renvoie `{ id, created, stage, url, matched_by }`. |
| `find_opportunity` | oui | Recherche par `external_id`, `email` ou `name`. Renvoie `{ results: [{ id, name, city, stage, external_id, url }] }`. |
| `list_pipeline_stages` | oui | Étapes dans l'ordre `{ entry_stage, stages: [{ id, label }] }`. |
| `update_stage` | non | `{ id, stage, note? }` : change l'étape, ajoute une note. |

Limite : 60 appels d'outil par minute (en mémoire, par instance de fonction).

### Variables d'environnement (Vercel → Settings → Environment Variables)

| Variable | Valeur |
|---|---|
| `MCP_SECRET` | `openssl rand -hex 32` (≥ 32 caractères). Vide ⇒ connecteur désactivé. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role`. **Serveur uniquement.** |
| `MCP_OWNER_ID` | Ton User UID (Supabase → Authentication → Users). Toutes les lectures/écritures du connecteur sont filtrées sur ce `user_id`. |
| `CRM_PUBLIC_URL` | Optionnel. Base des liens `url` renvoyés (défaut : domaine de production Vercel). |

La clé service_role contourne la RLS : le code force donc `user_id = MCP_OWNER_ID`
sur chaque requête, comme le font les politiques RLS pour l'app.

### Installation

1. Exécuter `supabase/migrations/012_add_deal_external_ref.sql` dans le SQL Editor Supabase.
2. Ajouter les variables ci-dessus dans Vercel, puis redéployer.
3. URL du connecteur : `https://kruzberg-crm.vercel.app/api/mcp/<MCP_SECRET>`
   (la valeur de `MCP_SECRET` se lit dans Vercel → Settings → Environment Variables).
4. Dans claude.ai : **Réglages → Connecteurs → Ajouter un connecteur personnalisé**,
   nom « KRUZBERG CRM », coller l'URL, laisser les champs OAuth vides, Ajouter.
5. Autoriser le connecteur pour l'artifact Booking Radar.

Test manuel : `npx @modelcontextprotocol/inspector`, transport « Streamable HTTP »,
URL ci-dessus. Sur une preview protégée par Vercel Authentication, ajouter
l'en-tête `x-vercel-protection-bypass` (Settings → Deployment Protection → Protection Bypass for Automation).

### Sécurité et évolution vers OAuth

v1 : le secret dans l'URL **est** l'authentification. Toute requête avec un
mauvais secret reçoit un 404 (comparaison en temps constant). Si l'URL fuite,
changer `MCP_SECRET` dans Vercel, redéployer et mettre à jour le connecteur.

Pour plus tard (non implémenté) : OAuth 2.1, que les connecteurs claude.ai
supportent nativement.
- Le CRM devient *resource server* : envelopper le handler avec `withMcpAuth`
  (`mcp-handler`) pour vérifier le bearer token, et servir
  `/.well-known/oauth-protected-resource` avec `protectedResourceHandler`.
- Serveur d'autorisation : Supabase Auth (serveur OAuth 2.1) ou un fournisseur
  externe, avec Client ID Metadata Documents (CIMD, spec MCP 2026-07-28) ou DCR.
- Le `user_id` vient alors du token (`ctx.http?.authInfo`) au lieu de
  `MCP_OWNER_ID`, et on peut utiliser la clé anon + le JWT de l'utilisateur
  pour laisser la RLS faire le travail (plus besoin de la clé service_role).
- La route passe à `/api/mcp` (sans secret).

## Deployment

Deploy to Vercel by connecting your GitHub repository. Add environment variables in the Vercel dashboard.

## License

Private — KRUZBERG internal tool.
