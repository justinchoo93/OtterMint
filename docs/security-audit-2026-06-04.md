# Security Audit Log

**Date:** June 4, 2026
**Scope:** Observability, logging hygiene, health checks, and a
documentation-accuracy pass, plus the scoping of a seven-part hardening
program.

## This round (observability & documentation)

- Observability is structured server logging plus a health check — no external
  error-tracking service. (An earlier pass integrated `@sentry/nextjs`; it was
  removed on 2026-06-05 as unneeded for this project.)
- Standardized all `src/app/api` error logging on `logServerError`
  (`src/lib/logging.ts`), removing every raw `console.error` call. The helper
  logs only `error.name` and `error.message`, never the full error object.
- Stopped logging the verbatim Plaid `error_message` in the account-refresh
  route; only the short machine `errorCode` is now logged. The full message is
  still stored in the database row (which only the owning user can see) so the
  re-auth banner keeps working.
- Added `GET /api/health` — an unauthenticated liveness probe that also runs a
  trivial `select 1` database check, returning `200 {"status":"ok","db":"ok"}`
  or `503 {"status":"degraded","db":"error"}` without echoing the DB error.
- Rewrote `README.md` from the `create-next-app` template into a real overview
  and runbook, including a warning that `npm run db:push` can drop hand-written
  SQL such as RLS policies.
- Corrected RLS/tenant-isolation wording across `SECURITY.md`, `SPEC.md`, and
  `docs/information-security-policy.md` to reflect that RLS is **enabled but not
  yet enforced** (no policies; the app connects as the database owner, which
  bypasses RLS), and that tenant isolation is currently the application-layer
  `userId` filtering. The privilege-revocation control remains accurate.
- Fixed the stale absolute audit-log link in `SECURITY.md`
  (`/Users/justin/Documents/...`) to a repository-relative link and added a link
  to this entry.

## Honest current gaps

- **Database-enforced RLS is not yet active.** RLS is enabled on every
  application table but has zero policies, and the application connects as the
  database owner/superuser, which bypasses RLS — so it provides no protection
  today. The live tenant boundary is application-layer `userId` filtering. The
  real enforcement work (a non-superuser `app_user` role, per-table policies,
  denormalized `user_id` columns, and a per-request `app.current_user_id`
  session variable) is tracked in plan 6 below. Migration 0006 landed an RLS
  prototype and 0007 denormalized `user_id` onto derived tables; full
  enforcement and the production `app_user` cutover remain pending.
- **No external error tracking.** Errors are captured in structured server logs
  via `logServerError`; there is no Sentry/Datadog/etc. integration (removed as
  unneeded). Revisit if production triage needs aggregated error reporting.

## Hardening program (seven ExecPlans)

Implement in order; each is self-contained. (`docs/exec_plans/` is git-ignored,
so these are working-tree documents.)

1. `docs/exec_plans/deps-and-ci-hardening.md`
2. `docs/exec_plans/data-integrity-and-migrations.md`
3. `docs/exec_plans/plaid-production-readiness.md`
4. `docs/exec_plans/request-validation-and-mfa-hardening.md`
5. `docs/exec_plans/abuse-protection-rate-limiting.md`
6. `docs/exec_plans/tenant-isolation-rls.md` (makes RLS real)
7. `docs/exec_plans/observability-and-docs.md` (this round)
