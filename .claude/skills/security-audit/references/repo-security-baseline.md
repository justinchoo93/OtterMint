# Repo Security Baseline

Use this file as a quick index during security work.

## Primary docs

- `SECURITY.md`
- `docs/information-security-policy.md`
- `docs/security-audit-2026-03-11.md`

## Database and migrations

- `src/lib/db/schema.ts`
- `drizzle/0000_bumpy_darwin.sql`
- `drizzle/0001_shiny_purifiers.sql`
- `drizzle/0002_tranquil_morlocks.sql`

## Auth and session paths

- `src/middleware.ts`
- `src/lib/auth/get-user-id.ts`
- `src/lib/auth/session.ts`
- `src/lib/auth/password.ts`
- `src/lib/auth/login-lockout.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/auth/me/route.ts`
- `src/app/api/auth/mfa/setup/route.ts`
- `src/app/api/auth/mfa/verify-setup/route.ts`
- `src/app/api/auth/mfa/verify/route.ts`
- `src/app/api/auth/mfa/disable/route.ts`
- `src/app/api/auth/delete-account/route.ts`

## Public token-bearing routes

- `src/app/api/invite/[token]/route.ts`
- `src/app/api/groups/[id]/invitations/route.ts`
- `src/app/api/groups/[id]/invitations/[token]/accept/route.ts`
- `src/app/api/share-links/route.ts`
- `src/app/api/shared/[token]/route.ts`

## Verification commands

```bash
npm test
npx tsc --noEmit
npm run lint
```
