# Display the one-time statement-based net-worth backfill

This ExecPlan follows `docs/PLANS.md` and must remain current through implementation and validation.

## Purpose / Big Picture

Make the collected 2026 records usable in the personal net-worth chart without presenting estimates as bank observations. Earlier monthly totals use dated statement and dashboard evidence, with explicitly documented estimates for missing dates and transfers in transit. The chart must distinguish these totals from live observations, avoid applying connection-day adjustments to already reconstructed history, and offer a one-year range. This is a bounded one-time backfill, not a universal statement importer or a manual-account editing workflow.

## Progress

- [x] (2026-09-26) Inspected existing chart, normalization, snapshot schema, public sharing and deployment paths.
- [x] (2026-09-26) Implemented nullable reconstruction metadata, guarded presentation, and range selection.
- [x] (2026-09-26) Prepared six private January–June totals and reversible import; preserved 41 existing observations in database rehearsal.
- [x] (2026-09-26) Passed focused/full tests, TypeScript, lint apart from one existing warning, migration/RLS checks, and authenticated API/browser acceptance.
- [x] (2026-09-26) User approved deployment/import. Published and deployed app commit 93cfb8b, journaled migration 0014, and applied/verified six historical estimates with all prior records preserved.

## Surprises & Discoveries

Personal snapshots already support a manual-assets subtotal; a new per-manual-account table is not necessary for this one-time aggregate history. The current normalization adds later connected-account balances to all earlier points, which would double count reconstructed sources. Public share links read the same personal snapshot table; reconstructed records must be excluded there until sharing supports the same quality disclosures. The current chart requests only 90 days.

## Decision Log

Decision: Add nullable reconstruction notes to the existing personal snapshot table, using its existing owner isolation. Store only disclosure text in application metadata; retain per-account evidence and hashes outside git. Existing records remain null and unchanged. Date/author: 2026-09-26, Codex.

Decision: Separate reconstructed and observed chart segments even if their account identifiers happen to match. Do not normalize reconstructed values using later connection events. Do not publish reconstructed values through existing public sharing. Date/author: 2026-09-26, Codex.

Decision: Use the verified local evidence to prepare estimates for otherwise unsupported month-ends, always labeled with their methods. Carry prior card statements forward at most 35 days; do not infer precise posting dates. Business-day investment valuations retain their original evidence dates. February retirement funds in transit are explicitly estimated from the documented outgoing and incoming rollover. Declined Chase savings remains outside application scope. Date/author: 2026-09-26, Codex.

## Outcomes & Retrospective

Implementation and local verification are complete. Six January–June estimates are prepared; all 41 existing July–September observations were preserved in rehearsal. The UI and API label estimates, split the live boundary, expose assumptions, and support one year. The user subsequently approved deployment. Migration 0014 and app commit 93cfb8b are live, and all six estimates are applied and verified. Existing aggregate history and all other scoped financial rows were preserved.

## Context and Orientation

`src/lib/db/schema.ts` defines `userNetWorthSnapshots`, a daily aggregate table already protected by row-level security. `src/lib/net-worth-history.ts` computes connection-adjusted comparisons and chart segments. `src/lib/net-worth-history-server.ts` reads owner-scoped records. `src/components/dashboard/NetWorthChart.tsx` renders the shared personal/household chart. `src/lib/compute-snapshot.ts` writes current observed totals. `src/app/api/shared/[token]/route.ts` supplies public shares without quality metadata. Only the personal table receives the new field.

Private source records, scripts, receipts and rollback files live at `/Users/justin/code/personal/bank_statements/backfill`, outside this repository. The already-applied transaction and account-balance batches must remain unchanged. Existing user edits to category rules and their tests must not be committed with this work.

## Plan of Work

Add nullable text `reconstructionNotes` to the personal snapshot schema and generate an additive journaled migration. Normal current-day snapshot saves explicitly clear this field. Extend shared snapshot types with optional notes and `reconstructed` quality. Reconstruction takes precedence over observed/normalized labels; adjacent changes between reconstructed and observed history split both comparison and reported segments. Do not add future connection amounts to reconstructed totals or advertise a normalized period change containing estimates.

Render reconstructed series dashed in both chart modes and disclose methods in the tooltip and accessible text. Provide 90-day and one-year range buttons, maintaining the existing default and endpoint limits. Filter reconstructed rows from public share results; do not alter household totals.

Prepare a private evidence manifest with every account, value, source date, exact/estimated status, and method for each month. Only complete in-scope rows may be inserted. Use stable batch notes and a distinct coverage fingerprint; preserve existing aggregate rows on any date. Rehearse apply, rerun and guarded undo in a rollback transaction before applying. A database schema update alone must not expose unlabeled estimates to old application code: data loading follows deployment of the presentation change.

## Concrete Steps

From `/Users/justin/code/personal/OtterMint`, edit the files listed above, then run:

    npm run db:generate
    npm test -- src/__tests__/net-worth-history.test.ts src/__tests__/net-worth-chart.test.tsx src/__tests__/snapshot.test.ts
    npx tsc --noEmit
    npm run lint
    npm test

Run a configured production build with non-secret placeholder values if environment guards require them. Inspect generated SQL; it must only add the nullable column. Use a disposable database for migration verification, never a fixture-writing test against production. Keep private financial evidence out of test fixtures and git.

## Validation and Acceptance

A synthetic reconstructed asset balance of 100 followed by a later 100 account connection must remain 100, not normalize to 200. Reconstructed points must be labeled and dashed; a reconstructed-to-live boundary must not show continuous comparable growth. Normalized period change is unavailable across reconstructed points. Existing normalization tests continue to pass. Selecting one year fetches `days=365`. Public shares exclude reconstructed rows rather than showing estimates without explanations. A live observed save clears reconstruction notes.

Private reconciliation must validate integer-cent totals, complete source coverage, bounds on carried values and preservation of all original records. Import rerun inserts zero rows, and undo removes only unchanged rows belonging to this batch. Application health and owner-scoped history response must pass after any deployment.

## Idempotence and Recovery

The migration adds one nullable field without rewriting old records. Reverting application code is safe after removing the guarded imported batch, leaving the unused column in place. Snapshot imports use conflict-do-nothing and explicit baseline guards. Stop on changed baseline or changed imported rows rather than replacing user data. No account connections, transactions, or existing balances are deleted.

## Artifacts and Notes

Record actual test results, migration name, batch counts and deployment state here as work progresses. Financial amounts and source identifiers belong only in the private archive.

## Interfaces and Dependencies

No new package is required. `CanonicalSnapshot.reconstructionNotes?: string | null` distinguishes imported historical estimates from observed values. `HistoryQuality` gains `reconstructed`. Existing APIs retain their response shape with additive metadata. Drizzle manages the nullable text column; Vitest and Testing Library validate calculations and chart behavior.

Revision note: Initial implementation plan, September 26, 2026. Narrowed storage to existing aggregate snapshots so the one-time backfill does not require building a universal importer.

## Verification evidence and deployment boundary

Migration `drizzle/0014_rich_big_bertha.sql` adds only nullable `reconstruction_notes` on the existing personal snapshot table. All migrations applied successfully to disposable PostgreSQL 17. The full ordinary suite passed 365 tests with 41 real-database tests intentionally skipped there; the separate configured PostgreSQL run passed all 41 isolation tests. TypeScript passed. Lint has only the pre-existing unused `eq` warning in `src/lib/sync-holdings.ts`. The configured production build passed.

The local financial-data rehearsal preserved the 41 original aggregate snapshots by row hash, inserted six rows, repeated without duplicates, reversed them without changing the baseline, and rejected undo after simulated changes. That temporary financial copy was deleted from the disposable database before browser checks. A synthetic account then passed authenticated API and Firefox UI checks: one-year data, dashed estimates, readable assumptions and a separate observed segment.

Before deployment, the NAS had migrations through 0013 and no new metadata column. Deployment followed `docs/DEPLOYMENT.md` after explicit confirmation. Its referenced host guide, `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/life/interests/OtterHolt.md`, requires framing and a confirmation prompt before non-trivial host actions. This deployment changes the existing app and adds a nullable database column; no ports or authentication settings are changed. Prepare backup and rollback before applying. Keep all financial manifests, database exports and receipts outside git.

Revision note (2026-09-26): Recorded completed implementation, source reconstruction, real-database rehearsal, tests and UI verification. Deployment/import is the sole remaining execution milestone, subject to the host guide's explicit confirmation requirement.

## Production completion

On September 26, 2026 the user approved publication, deployment and import. The code was pushed as a fast-forward to main and built on the NAS. An encrypted pre-change database backup was created and verified, and the prior app image retained. Migration 0014 was applied atomically with its exact Drizzle hash and timestamp. The new app passed its health probe before any reconstructed rows were loaded.

Production rehearsal passed; six January–June estimates were then inserted. All 41 original aggregate rows and all scoped transactions, per-account balances, manual accounts, account inventory and coverage events remained unchanged. The application database role sees 47 aggregate points including six with reconstruction notes. HTTPS health through the existing Caddy proxy passed, and unauthenticated history returned 401. Firefox DNS resolution prevented live visual verification; the local authenticated API/browser acceptance already passed. No network settings were changed. Private result and recovery records are in `bank_statements/backfill/net-worth-result.json` and its README.

Revision note (2026-09-26): Marked the approved deployment and import complete, recorded production preservation checks and the live-browser DNS limitation.
