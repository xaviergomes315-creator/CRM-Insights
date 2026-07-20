# CRM Dashboard

A full-stack CRM (Customer Relationship Management) application with a React frontend and Express API server.

## Stack

- **Frontend**: React + Vite + TypeScript (Tailwind CSS, shadcn/ui, React Query, Wouter)
- **Backend**: Express + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Supabase
- **Monorepo**: pnpm workspaces

## Structure

```
artifacts/crm-dashboard/   # React + Vite frontend
artifacts/api-server/      # Express API server
lib/db/                    # Drizzle schema + database client
lib/api-spec/              # OpenAPI spec + Orval codegen config
lib/api-client-react/      # Generated API client (React Query hooks)
lib/api-zod/               # Generated Zod validators
```

## Running

Two workflows must both be running:

- **CRM Dashboard** — `PORT=3000 BASE_PATH=/ pnpm --filter @workspace/crm-dashboard run dev`
- **API Server** — `PORT=8080 pnpm --filter @workspace/api-server run dev`

## Required environment variables

The app requires a Supabase project. Set these secrets before running:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (used by the browser client) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key (browser client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-side only) |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Secret for signing server sessions ✓ already set |

## User preferences
