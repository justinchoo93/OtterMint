---
name: security-audit
description: Use when the user asks for a security audit, security review, security hardening, Supabase database security finding remediation, auth/session/MFA security work, or security documentation and audit log updates for this repo.
---

# Security Audit

Run a repo-specific security audit for OtterFin. The expected outcome is not just findings: fix defensible issues, verify the fixes, and update security documentation.

## When to use

- Full or comprehensive security audits
- Supabase security or database-linter findings
- Auth, session, MFA, invite-link, or share-link security reviews
- Requests to harden the app before launch or compliance review
- Requests to update security policy docs or maintain an audit trail

## Repo baseline

Read these first:

- `SECURITY.md`
- `docs/information-security-policy.md`
- `docs/security-audit-2026-03-11.md` as the current audit-log example
- `src/lib/db/schema.ts`
- `drizzle/*.sql` for existing migrations

For auth/session work, also inspect:

- `src/middleware.ts`
- `src/lib/auth/*`
- `src/app/api/auth/**`

For share/invite exposure, also inspect:

- `src/app/api/groups/**`
- `src/app/api/share-links/route.ts`
- `src/app/api/shared/[token]/route.ts`
- `src/app/api/invite/[token]/route.ts`

## Workflow

### 1. Baseline the system

- Check current branch and worktree state before editing.
- Read the current security docs and latest audit log.
- If the user supplied scanner findings, treat them as one input, not the whole audit.

### 2. Audit database exposure

- Review schema and migrations for public data exposure.
- If Supabase/PostgREST exposure is in scope:
  - ensure RLS is enabled on exposed tables
  - review grants for `anon` and `authenticated`
  - protect tables containing tokens, secrets, sessions, or financial data
- Prefer additive migrations in `drizzle/`.

### 3. Audit application security

Check at minimum:

- login, logout, registration, password change
- MFA setup, pending-session flow, verification, and recovery codes
- session creation, expiry, and invalidation
- public invite and share-link flows
- token handling in URLs, responses, and logs
- dangerous or overly verbose error logging
- missing validation on auth-sensitive inputs

### 4. Fix what is concrete

- Implement low-risk, defensible fixes directly.
- Keep changes scoped and testable.
- Avoid speculative rewrites or compliance theater.
- If a risk cannot be fully fixed in-repo, document it clearly as residual risk with the next recommended control.

### 5. Verify

Run the strongest practical checks for the touched area:

- `npm test`
- `npx tsc --noEmit`
- `npm run lint`

If database changes were added, call out that the migration must be applied and the Supabase linter rerun.

### 6. Update documentation

Always update:

- `SECURITY.md` if the security posture changed
- `docs/information-security-policy.md` if controls or policy statements changed

When the work is audit-like, also create or update a dated audit log in `docs/`:

- Preferred name: `docs/security-audit-YYYY-MM-DD.md`
- Include: scope, findings remediated, residual risks, and verification performed

## Output expectations

In the final response:

- lead with the concrete issues fixed
- mention any residual risks that remain
- list verification performed
- call out any required manual follow-up, especially database migration application and scanner reruns
