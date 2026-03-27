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

## Deployment

Deploy to Vercel by connecting your GitHub repository. Add environment variables in the Vercel dashboard.

## License

Private — KRUZBERG internal tool.
