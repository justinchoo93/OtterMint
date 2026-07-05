# OtterMint

OtterMint is a personal-finance dashboard. A person registers, logs in, links
bank and brokerage accounts through [Plaid](https://plaid.com), and views
balances, transactions, investment holdings, and a net-worth trend aggregated
into a unified household view. Households can share a read-only view with each
other through groups and scoped share links.

It is built with Next.js 16 (App Router), React 19, and TypeScript, backed by
PostgreSQL (Supabase in production) accessed through Drizzle ORM.

## Prerequisites

- **Node.js** — version pinned in [`.nvmrc`](.nvmrc) (currently `24`). With nvm:
  `nvm use`.
- **PostgreSQL** — a database OtterMint can reach (Supabase in production; any
  Postgres works locally).
- **Plaid credentials** — a Plaid account with sandbox client ID and secret to
  start (https://dashboard.plaid.com).

## Setup

1. `cp .env.example .env` and fill in the values. See
   [`.env.example`](.env.example) for the full, authoritative list and inline
   notes. The variables you need locally are `DATABASE_URL`, `PLAID_CLIENT_ID`,
   `PLAID_SECRET`, `PLAID_ENV` (use `sandbox`), and `ENCRYPTION_KEY` (a 32-byte
   hex string — generate with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   The Upstash Redis variables are optional locally and documented in
   `.env.example`.
2. `npm install`
3. `npm run db:migrate` — apply the database schema.
4. `npm run dev` — start the dev server at http://localhost:3000.

## Commands

- `npm run dev` — start the development server.
- `npm test` — run the Vitest test suite (`vitest run`).
- `npx tsc --noEmit` — type-check.
- `npm run build` — production build.
- `npm run db:generate` — generate a migration from schema changes.
- `npm run db:migrate` — apply pending migrations.
- `npm run db:push` — **unsafe; avoid.** `db:push` diffs the Drizzle schema
  against the database and force-syncs it, but it does not understand
  hand-written SQL such as row-level-security policies, grants, or check
  constraints and can silently **drop** them. Use generated migrations
  (`db:generate` + `db:migrate`) instead. See
  [docs/exec_plans/data-integrity-and-migrations.md](docs/exec_plans/data-integrity-and-migrations.md)
  and
  [docs/exec_plans/tenant-isolation-rls.md](docs/exec_plans/tenant-isolation-rls.md).

## Environment variables

`.env.example` is the source of truth. Copy it to `.env` and fill it in; `.env`
is git-ignored. Real Plaid, database, and Redis values are provided at
deploy time.

## Health check

OtterMint exposes an unauthenticated liveness probe that also confirms the
database is reachable:

```bash
curl -i http://localhost:3000/api/health
# HTTP/1.1 200 OK
# {"status":"ok","db":"ok"}
```

It returns `503` with `{"status":"degraded","db":"error"}` if the database
probe (`select 1`) fails.

## Deployment

Production runs on the OtterHolt NAS. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
for the runbook (deploy with `scripts/deploy.sh`). The authoritative host stack
description and operating rules live in `OtterHolt.md` in the Obsidian "life"
vault under `interests/`, not in this repo.

## Architecture & specs

- Feature spec: [SPEC.md](SPEC.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Security policy: [SECURITY.md](SECURITY.md),
  [docs/information-security-policy.md](docs/information-security-policy.md)
