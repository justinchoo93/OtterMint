# Make net-worth history aware of newly connected accounts

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `docs/PLANS.md` from the repository root. A contributor should be able to implement and verify the feature with only this file and the current working tree.

## Purpose / Big Picture

OtterMint currently draws a continuous line through daily totals even when the set of accounts included in those totals changes. If a person already owns a $600,000 investment account and then connects it, the chart can appear to show that their wealth rose from $0 to $600,000. The money already existed; only OtterMint's data coverage changed.

After this work, the chart will never draw a wealth-growth slope across a known or suspected coverage change. For new account connections recorded after this feature ships, the personal chart will also offer a normalized comparison that carries the account's first known balance backward across the selected range. That earlier portion will be dashed and explicitly described as a normalization, not historical fact. The raw Reported view will preserve the canonical daily totals and split the line at coverage boundaries. Legacy accounts, removals, and household changes that lack a defensible adjustment amount will receive a disconnected boundary rather than an invented value.

A human can demonstrate the result with raw snapshots of $0 before a connection and $600,000 after it. Reported mode must show separate line segments with a coverage annotation, not a diagonal rise. If the connection was captured by the new event model, Normalized mode must show a dashed approximately $600,000 comparison baseline before the connection and a solid observed series afterward, with period change near zero. If the connection predates the event model, the chart must remain disconnected and say that earlier coverage is unknown.

## Progress

- [x] (2026-07-21 01:35Z) Traced snapshot creation, personal and household history APIs, the Plaid and manual-account lifecycle, shared chart behavior, transaction filtering, and RLS migrations.
- [x] (2026-07-21 01:35Z) Wrote the first complete ExecPlan draft.
- [x] (2026-07-21 04:21Z) Ran the requested load-bearing workflow with a finder, a validation strategist, and three independent read-only validators.
- [x] (2026-07-21 04:21Z) Revised the plan after validation: removed transaction reconstruction and per-account balance history; removed adjusted values from public shares; replaced generic household events with fingerprint-based segmentation; added safe legacy and deletion fallbacks; narrowed the atomicity guarantee to local financial state.
- [x] (2026-07-21 05:00Z) Milestone 1: added nullable snapshot fingerprints, the private user coverage-event table, journaled migration 0009 with explicit RLS, and isolation-test coverage.
- [x] (2026-07-21 05:00Z) Milestone 2: captured Plaid/manual addition events and personal snapshots atomically, centralized fingerprinted recomputation, removed manual events on deletion, and added best-effort household recomputation at source/member lifecycle boundaries.
- [x] (2026-07-21 05:00Z) Milestone 3: added pure normalization/segmentation, personal and household history builders, backward-compatible routes, and focused unit/route tests.
- [x] (2026-07-21 05:00Z) Milestone 4: rendered Normalized/Reported modes, solid/dashed/disconnected series, privacy-safe annotations, and accessible explanatory text with component tests.
- [ ] Milestone 5 (completed: full unit suite, lint, configured production build, architecture/spec updates; remaining: disposable-database RLS test and final visual/runtime verification).

## Surprises & Discoveries

- Observation: Plaid account creation captures a balance, but only an explicit account refresh creates an aggregate net-worth snapshot.
  Evidence: `src/app/api/plaid/exchange-token/route.ts` inserts `accounts.currentBalance`; only `src/app/api/accounts/refresh/route.ts` calls `saveUserSnapshot` and `saveGroupSnapshot`.

- Observation: An exact connection-day balance cannot be recovered for every legacy account. The mutable account balance is overwritten, aggregate snapshots have no per-account membership, and no historical per-account table has ever existed.
  Evidence: `src/lib/db/schema.ts` stores only `accounts.currentBalance` and aggregate snapshots; refresh overwrites `currentBalance` in `src/app/api/accounts/refresh/route.ts`; the initial migration has the same model.

- Observation: `accounts.createdAt` is not the first-included-snapshot date. Connection and snapshot creation are separate user actions, and same-day snapshots upsert in place.
  Evidence: the exchange route returns without saving a canonical snapshot; `saveUserSnapshot` uses refresh-time UTC date and upserts on `(userId, date)`.

- Observation: Backward transaction reconstruction is not defensible with the current Plaid integration. Transactions defaults to a 90-day requested window, institutions can return less, `/accounts/get` balances are cached without a generally available effective timestamp, and privacy-excluded transactions leave no durable provenance.
  Evidence: `src/app/api/plaid/create-link-token/route.ts` does not set `transactions.days_requested`; `src/lib/sync-transactions.ts` drops excluded transactions and ignores transaction history status. Official Plaid documentation confirms the default window, institution limitations, cached account data, and transaction lifecycle semantics.

- Observation: The existing link route can make its local inserts atomic, but the entire external token-exchange request is not idempotent. It has no durable request ID or recovery record before the one-use external exchange.
  Evidence: external exchange and account fetch precede `withUser`; item and account writes are plain inserts; no lifecycle or outbox table exists.

- Observation: The repository does not explicitly authorize retaining a deleted source's initial balance in a tombstone event. Whole-user deletion promises complete erasure, while individual manual-source deletion currently leaves only already-retained aggregate snapshots.
  Evidence: `src/app/privacy/page.tsx`, `docs/information-security-policy.md`, and `src/app/api/manual-accounts/route.ts` define those behaviors but do not define source-level tombstone retention.

- Observation: A user-owned generic membership event cannot support household history after membership removal because it lacks immutable group identity and the membership row is deleted. Exposing both raw and adjusted public history would also reveal the coverage delta by subtraction.
  Evidence: current `group_members` rows have `joinedAt` but no retained leave interval; the draft event had no `groupId`; the privacy inference follows directly from `adjusted - raw = coverage adjustment`.

- Observation: The existing group snapshot table already provides a safe aggregate ownership pattern, but current lifecycle paths do not prove that a new group event table could be maintained atomically through join, self-leave, owner removal, user deletion, and source deletion.
  Evidence: static RLS inspection shows group-owned rows are feasible; invitation acceptance and membership removal occur through separate security-definer functions and do not recompute group history.

- Observation: Reported and normalized charts need independent segment identifiers. A captured addition splits Reported history but must remain continuous in Normalized history; an unknown boundary must split both.
  Evidence: `normalizeNetWorthHistory` now returns `coverageSegment` for raw totals and `comparisonSegment` for the normalized series, with tests covering both cases.

- Observation: The default production build intentionally fails without `PLAID_ENV`, even after compilation and TypeScript succeed.
  Evidence: the first `npm run build` stopped during page-data collection with `PLAID_ENV must be set`; rerunning with sandbox/build-only placeholders completed all 34 routes.

## Decision Log

- Decision: Preserve `user_net_worth_snapshots` and `group_net_worth_snapshots` as canonical raw observations. Never rewrite old totals.
  Rationale: The existing values describe what OtterMint actually observed. Derived presentation can be changed or removed without corrupting that audit trail.
  Date/Author: 2026-07-21 / Codex

- Decision: Add a `coverageFingerprint` to future user and group snapshots. A fingerprint is a one-way SHA-256 hash of the sorted active source identifiers; group fingerprints also include active member IDs. The API returns only a sequential segment number, never the hash or identifiers.
  Rationale: Fingerprint changes detect additions, removals, and membership changes without retaining deleted balances or exposing source identity. They are sufficient to prevent Recharts from connecting incomparable totals.
  Date/Author: 2026-07-21 / Codex

- Decision: Record exact user-level addition events for future Plaid and manual accounts, but do not retain removal amounts. Delete an addition event when its source is deleted.
  Rationale: Future connection routes already possess the first known balance, so additions can be normalized. Retaining a deleted source's amount lacks an explicit privacy/retention authorization; fingerprint changes still permit an honest disconnected boundary.
  Date/Author: 2026-07-21 / Codex

- Decision: Call the derived personal series "Normalized," not "estimated historical net worth." It carries the source's first known contribution backward as a flat comparison baseline.
  Rationale: Validation falsified the transaction-reconstruction approach and there is no evidence that a connected source held a constant balance before connection. Normalization removes the coverage artifact without claiming precise history.
  Date/Author: 2026-07-21 / Codex

- Decision: Do not implement transaction-shaped pre-connection balances in this plan.
  Rationale: Plaid history coverage and balance timestamps cannot prove a complete compatible ledger, and OtterMint intentionally erases some transaction provenance for privacy. False precision would be worse than a labeled flat normalization.
  Date/Author: 2026-07-21 / Codex

- Decision: For legacy active accounts, use `createdAt` only to identify a possible boundary interval. Disconnect every chart edge that crosses the account's creation date and isolate an ambiguous same-day point. Do not use `createdAt` as the exact first-inclusion date or infer an initial amount.
  Rationale: Validation proved that creation and canonical inclusion can occur on different days. A conservative break prevents the misleading slope without asserting which adjacent snapshot first included the account.
  Date/Author: 2026-07-21 / Codex

- Decision: Household history is segmented Reported history in this implementation; it is not normalized. Group fingerprints capture future source and membership-set changes, and legacy active member/source dates identify possible boundaries.
  Rationale: A group-owned adjusted-event lifecycle remains unproved across every membership and deletion path. Segmentation solves the misleading visual without broadening personal-history access or creating privileged aggregation machinery.
  Date/Author: 2026-07-21 / Codex

- Decision: Do not add adjusted fields or coverage deltas to public share-link responses.
  Rationale: A recipient given raw and adjusted totals can subtract them and learn the aggregate balance added at a coverage change, which may conflict with balance-sharing preferences.
  Date/Author: 2026-07-21 / Codex

- Decision: Guarantee atomicity only for local source insertion, addition-event insertion, fingerprint calculation, and the personal canonical snapshot. Keep best-effort Plaid transaction/holding sync and household recomputation outside that correctness-critical transaction.
  Rationale: `withUser` supplies local PostgreSQL atomicity. The external public-token exchange is not end-to-end idempotent today, but a lost HTTP response after local commit does not leave an account without its personal coverage metadata. Expanding this chart fix into a distributed link-workflow redesign is unnecessary.
  Date/Author: 2026-07-21 / Codex

- Decision: Do not add `account_balance_snapshots` in this work, despite the future analytics note in `docs/specs/analytics-dashboard.md`.
  Rationale: Daily per-account history does not solve unknown pre-connection balances, and the validated design needs only canonical fingerprints plus first-known addition events. The future table can still support later analytics.
  Date/Author: 2026-07-21 / Codex

## Outcomes & Retrospective

The feature is implemented through the UI and has passed the complete unit/component/route suite, TypeScript, lint, and a configured production build. The implementation retains raw snapshots, captures exact future addition baselines, normalizes only personal captured additions, segments every unknown comparison, keeps household history aggregate/raw-only, and leaves public shares unchanged. Final completion still requires the disposable-database RLS run and a runtime visual smoke test.

## Load-Bearing Validation Results

The requested `load-bearing` workflow evaluated the claims most likely to change the architecture. These are the final statuses and the plan response.

- Falsified: every legacy connection baseline is recoverable. Response: never adjust legacy history without a captured event; use conservative disconnected boundaries.
- Falsified: `accounts.createdAt` is the exact canonical inclusion date. Response: treat it only as a possible boundary and disconnect the inclusive interval around it.
- Falsified: current Plaid history supports defensible daily reconstruction. Response: remove transaction reconstruction and the `transaction_estimate` quality entirely.
- Falsified: the existing Plaid link request is end-to-end idempotent. Response: keep all new local personal coverage writes in the same account-insert transaction and do not make transaction backfill correctness-critical; route-level distributed idempotency is out of scope.
- Inconclusive: retaining aggregate removal tombstones is authorized by current privacy policy. Response: retain no deleted-source amount; delete the source's addition event and rely on fingerprint segmentation.
- Inconclusive: group-owned adjusted events can be maintained safely through all source and membership lifecycle paths. Response: do not depend on that design; household mode uses group snapshot fingerprints and disconnected raw segments only.
- Falsified by construction: a generic membership event without immutable group interval data remains attributable after deletion. Response: remove generic membership events from the design.
- Falsified mathematically: raw plus adjusted public history does not reveal a coverage balance. Response: public share links remain raw-only.

Residual risks are intentionally bounded. A removed legacy source leaves no row from which to find its old boundary, so very old raw history can remain incomparable. A flat normalized baseline is a comparison technique, not actual historical valuation, and the UI must state that on every estimated segment. Manual balance edits can represent either a real change or a correction; this plan reports them as changes because the current form has no effective-date or correction intent. Household mode avoids false slopes but does not offer coverage-excluding period change.

## Context and Orientation

OtterMint is a Next.js application backed by PostgreSQL through Drizzle ORM. Run every command in `/Users/justin/code/personal/OtterMint`.

`src/lib/db/schema.ts` declares `user_net_worth_snapshots` and `group_net_worth_snapshots`. Each has one aggregate row per owner and calendar date. `src/lib/compute-snapshot.ts` sums currently stored Plaid and manual accounts and upserts those rows. A "canonical snapshot" in this plan is one of these unadjusted rows.

`src/app/api/accounts/refresh/route.ts` refreshes balances, transactions, and holdings and then saves personal and household canonical snapshots. `src/app/api/plaid/exchange-token/route.ts` inserts a Plaid item and its accounts with their first known balances, but currently does not save a canonical snapshot. `src/app/api/manual-accounts/route.ts` mutates manual accounts without saving snapshots. `src/app/api/net-worth/route.ts` and `src/app/api/groups/[id]/net-worth/route.ts` return canonical history. `src/components/dashboard/NetWorthChart.tsx` maps it directly into Recharts lines.

A "financial source" is one Plaid account or one manual account. A "coverage fingerprint" is a deterministic SHA-256 hash computed from source identity, not balances. If two snapshots have different fingerprints, their totals cover different source sets and must not be joined. Fingerprints are stored because account rows can later be deleted; they are never returned to browsers.

A "coverage addition event" records the first known contribution of a newly stored source. It is user-private and exists only while that source exists. Its asset and liability values use the same signed semantics as `computeSnapshot`: depository and investment balances contribute to assets, credit and loan balances contribute to liabilities, manual assets and liabilities use their declared type, and a negative depository balance remains a negative asset rather than being made positive.

"Reported" history means canonical values. "Normalized" personal history means canonical values plus the flat first-known contribution of sources connected later than the point. The normalized latest point must equal the latest reported point. A normalized pre-connection point is not a historical valuation and must be marked `flat_normalized`.

The repository uses PostgreSQL Row-Level Security, abbreviated RLS. Application database work runs through `withUser` in `src/lib/db/with-user.ts`, which sets a transaction-local current-user value. RLS DDL is hand-maintained in journaled migrations and is not represented completely by Drizzle. Never use `npm run db:push`.

## Data Model and Calculation Rules

Add nullable `coverageFingerprint` text columns to both aggregate snapshot tables in `src/lib/db/schema.ts`. Existing rows remain null. Every newly computed snapshot must receive a non-null fingerprint.

Add `user_net_worth_coverage_events` with `id`, `userId`, `effectiveDate`, `sourceType`, `sourceId`, `assetAdjustment`, `liabilityAdjustment`, and `createdAt`. `sourceType` is `plaid_account` or `manual_account`. Both adjustments are signed numeric values and default to zero. A unique constraint on `(userId, sourceType, sourceId)` makes one active addition event per source. Index `(userId, effectiveDate)`. Do not store account names, institution names, masks, group IDs, transaction-derived values, or removal rows.

Do not use a polymorphic foreign key because Plaid account IDs are text and manual IDs are integers. Explicitly insert and delete event rows in the same transactions that insert and delete sources. Whole-user deletion cascades through `userId`. If a future Plaid disconnect route is added, it must delete the corresponding event before deleting the item.

Create `computeUserCoverageFingerprint(plaidAccounts, manualAccounts)` and `computeGroupCoverageFingerprint(memberIds, plaidAccounts, manualAccounts)` in `src/lib/net-worth-history.ts`. Sort stable tagged identifiers such as `plaid:<accountId>`, `manual:<id>`, and `member:<userId>`, join them with a delimiter, and hash using `node:crypto`. Never include a balance, label, or mutable account property. Pure tests must prove order independence, source-set sensitivity, balance insensitivity, and separate namespaces for numeric/text IDs.

Create `normalizeNetWorthHistory` as a pure function. For each captured addition event with `effectiveDate` later than a canonical point's date, add `assetAdjustment` to that point's assets and `liabilityAdjustment` to its liabilities, then calculate net worth as assets minus liabilities. On or after the event date, canonical totals already include the source and no adjustment is added. Apply every active event exactly once. The latest normalized values must equal the latest canonical values.

Assign a sequential `coverageSegment` to reported points. Start a new segment when two non-null adjacent fingerprints differ, when either side has unknown/null fingerprint and a captured or legacy possible boundary lies between them, or when a fingerprint becomes known after a legacy run. For an active legacy source created on date D, do not connect an edge from date A to B when A <= D <= B. If a point itself has date D, isolate it because it might have been saved before or after connection. Label that boundary `legacy_unknown`, not "connected exactly on D."

Normalized points use quality `observed`, `flat_normalized`, or `unknown_coverage`. `flat_normalized` means one or more captured first-known balances were carried backward. `unknown_coverage` means a fingerprint/deletion/legacy boundary cannot be normalized; set normalized line keys to null across that edge so no false slope appears. Never substitute zero for unknown.

The API may aggregate several same-day captured events into one annotation. Show the amount only in the authenticated personal endpoint. Household annotations say only "Household coverage changed," and no account name, source ID, member name, source count, or delta is returned.

## Plan of Work

### Milestone 1: Add private coverage metadata with RLS

Extend `src/lib/db/schema.ts` with the two nullable fingerprint columns and the private user event table. Generate the next journaled migration with `npm run db:generate`, inspect it, and manually add application-role grants plus `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and a self-only policy keyed by `app_current_user_id()`. Do not add a group-read policy for the event table.

Update `src/__tests__/rls-isolation.test.ts` to seed an event for two users. Add the table to fail-closed checks; prove A cannot read or write B's event even when A and B share a group; prove no current-user setting yields zero rows. Update the migration-range comment. The nullable fingerprint columns require no separate row policy because their parent tables already have policies.

At the end of this milestone, schema and migration artifacts agree, existing legacy rows remain valid with null fingerprints, and configured real-database tests prove the new event table is strictly private.

### Milestone 2: Capture exact future additions and source-set fingerprints

Create `src/lib/net-worth-history.ts` with fingerprint, contribution, segmentation, and normalization helpers. Refactor the aggregate-query portion of `src/app/api/accounts/refresh/route.ts` into reusable server-side functions, for example `recomputeUserNetWorthSnapshot(userId, executor)` and `recomputeGroupNetWorthSnapshotsForUser(userId, executor)`. The user helper selects active sources, computes both totals and the source fingerprint, and calls `saveUserSnapshot` with both. The group helper uses member IDs and all group sources to compute the group fingerprint before saving.

Change `SnapshotData` or the save function inputs in `src/lib/compute-snapshot.ts` so fingerprints are always explicit for new writes. Do not silently default a new snapshot to null.

In `src/app/api/plaid/exchange-token/route.ts`, keep the external token exchange and `/accounts/get` before local DB work as today. Inside the existing `withUser` transaction, insert the Plaid item and accounts, insert one event per account using its first known contribution, and recompute the personal snapshot. Those local records commit or roll back together. Keep initial transaction and holdings sync afterward as best effort; it does not alter the connection baseline. After the personal transaction commits, best-effort recompute affected group snapshots. Do not claim that replaying a consumed public token is idempotent; the feature's guarantee is only that a locally committed account cannot lack its local addition event and personal fingerprinted snapshot.

In `src/app/api/manual-accounts/route.ts`, make POST insert the account, insert its event, and recompute the personal snapshot in one `withUser` transaction. Make PUT save the new balance and recompute without changing the source set or event baseline; document that manual corrections are reported changes. Make DELETE delete the source's event, delete the source, and recompute with a new fingerprint in one transaction. Perform best-effort household recomputation after each mutation.

Refresh must upsert a fingerprinted personal snapshot and fingerprinted group snapshots. Invitation acceptance and membership removal must trigger best-effort group recomputation after the membership transition while an authorized remaining/current member context exists. For self-leave or user deletion where immediate recomputation is not safely available, the next remaining member refresh creates the new fingerprint and the household series begins a new segment; no adjustment is invented.

At the end of this milestone, a new Plaid/manual account immediately creates a captured event and personal snapshot, refreshes keep fingerprints current, source deletion removes its adjustment data, and all source-set changes eventually yield a new fingerprint.

### Milestone 3: Return honest personal and household history

Move the route response type out of `src/app/api/net-worth/route.ts` into `src/lib/net-worth-history.ts` so the client does not import a server route module.

Create `buildUserNetWorthHistory(userId, startDate, executor)`. It reads canonical snapshots, active captured events, and active account/manual creation dates. It returns raw values, normalized values where defensible, quality, segment IDs, private personal annotations, and reported/normalized period changes. Legacy events have no amount and produce disconnected unknown boundaries.

Create `buildGroupNetWorthHistory(groupId, requestingUserId, startDate, executor)`. It preserves the existing membership check, reads group canonical snapshots, and uses stored fingerprints plus currently visible member/source creation dates to conservatively segment legacy history. It returns only raw values, `coverageSegment`, and generic boundary labels. Do not read the private event table and do not return normalized group values.

Change `src/app/api/net-worth/route.ts` to retain every existing raw field and add:

    adjustedTotalAssets: string | null;
    adjustedTotalLiabilities: string | null;
    adjustedNetWorth: string | null;
    quality: "observed" | "flat_normalized" | "unknown_coverage";
    coverageSegment: number;

Its top-level response also includes private personal `coverageEvents` and `periodChange.reported` / `periodChange.normalized` when at least two comparable points exist. Use the label `normalized`, not `performance` or `historical estimate`.

Change `src/app/api/groups/[id]/net-worth/route.ts` only to add `coverageSegment`, `quality`, and generic coverage boundaries. Keep adjusted values null or omit them from a separately defined group response. Leave `src/app/api/shared/[token]/route.ts` unchanged; public share links do not receive event amounts or adjusted totals.

Add `src/__tests__/net-worth-history.test.ts`. Cover a $600,000 captured asset addition, a credit-liability addition, multiple additions, negative depository balance, same-day behavior, fingerprint order independence, fingerprint change without an event, null legacy fingerprints, conservative `createdAt` edge isolation, deleted-event behavior, and household generic segmentation. Prove latest normalized equals latest raw and raw fields never change.

Add route tests for authentication, group membership, response backward compatibility, event privacy, and the absence of adjusted household/public data.

At the end of this milestone, the motivating raw data still exists unchanged, the personal captured-event case has a flat normalized comparison, and every unadjustable coverage change becomes a disconnected reported segment.

### Milestone 4: Render solid, dashed, and disconnected history

Update `src/components/dashboard/NetWorthChart.tsx`. For personal data with captured adjustments, add an accessible two-option control labeled "Normalized" and "Reported," defaulting to Normalized. Household data shows Reported only. If no point can be normalized, omit the toggle and show segmented Reported history.

Render observed normalized portions with the existing solid stroke and `flat_normalized` portions with a dashed stroke. Use separate data keys with nulls and `connectNulls={false}`; include the transition boundary point in both keys so the solid and dashed portions meet without implying an unobserved edge. For `unknown_coverage`, neither key may span the boundary.

Reported mode groups points by `coverageSegment` and renders separate Lines so Recharts cannot interpolate between source sets. Add a `ReferenceLine` or point annotation at captured dates. Personal captured text may say, "Account connected: $600,000 first-known balance normalized out of change." Legacy and deletion text says, "Coverage changed around this date; totals across this break are not comparable." Household text says only, "Household coverage changed."

The tooltip must label each value "Observed," "Flat normalization from first known balance," or "Unknown coverage." Whenever the range contains a normalized point, show: "Earlier values use first known balances for comparison; they are not reconstructed account history." Whenever it contains an unknown boundary, show: "The line is split where OtterMint cannot compare the same set of accounts."

Fix `fetchSnapshots` dependencies while editing: it closes over `groupId` but currently has an empty dependency array. Include `groupId` so personal/household switching always requests the correct endpoint.

Add `src/__tests__/net-worth-chart.test.tsx`. Prove Normalized defaults only when available, Reported is selectable, unknown history has no toggle, accessible explanatory text appears, personal captured annotations show the amount, household annotations do not, and rerendering with a different `groupId` fetches the new endpoint. Test segmentation math in the pure suite instead of coupling component tests to Recharts SVG internals.

At the end of this milestone, no mode draws a diagonal $0-to-$600,000 connection artifact. Captured additions receive a useful normalized comparison; unknown cases receive an honest break.

### Milestone 5: Verify and document the rollout

Update `docs/specs/analytics-dashboard.md` to distinguish this fingerprint/event work from the future `account_balance_snapshots` proposal. Update the snapshot pipeline in `docs/architecture.md` and user-facing wording where necessary. State plainly that normalized history is not reconstructed valuation and that household history is segmented but not normalized.

Run the focused and full validation below. With a disposable migrated PostgreSQL database and test credentials, extend and run the real RLS suite. Start the app against fixture data and perform the visual scenario. Record actual command output and observations in `Artifacts and Notes`; update all living sections and the final revision note.

## Concrete Steps

Run all commands from `/Users/justin/code/personal/OtterMint`.

Before editing implementation files:

    git status --short
    rg -n "userNetWorthSnapshots|groupNetWorthSnapshots|NetWorthChart|saveUserSnapshot" src docs drizzle

After editing `src/lib/db/schema.ts`, generate a journaled migration:

    npm run db:generate

Expected result: one new numbered SQL migration and matching `drizzle/meta` journal/snapshot updates. Manually add grants and RLS DDL to the generated migration. Never run `npm run db:push`.

During implementation, run focused tests:

    npm test -- src/__tests__/net-worth-history.test.ts
    npm test -- src/__tests__/net-worth-chart.test.tsx
    npm test -- src/__tests__/snapshot.test.ts
    npm test -- src/__tests__/manual-accounts.test.ts
    npm test -- src/__tests__/plaid-validation.test.ts

Expected result: each exits zero. The motivating normalization and segmentation tests must fail before their implementation and pass afterward.

Run full local validation:

    npm test
    npm run lint
    npm run build

Expected result: every command exits zero. The RLS suite may be skipped when its database environment is absent; a skip is not proof that the new policy works.

With a disposable database migrated through the new migration, run:

    RLS_TEST_DATABASE_URL=postgresql://app_user:<password>@localhost:5433/ottermint \
    RLS_TEST_SUPERUSER_URL=postgresql://postgres:<password>@localhost:5433/ottermint \
    npm test -- src/__tests__/rls-isolation.test.ts

Expected result: all RLS cases pass with none skipped. Never run this fixture-writing suite against production.

For human acceptance:

    npm run dev

Use disposable fixture data with a pre-connection $0 snapshot, connect a $600,000 asset, and create later observations. In Normalized mode, observe a dashed near-$600,000 comparison before connection and solid observed values afterward. Select Reported and observe separate $0 and $600,000 segments with no diagonal edge. Repeat with a legacy fixture lacking an event and observe only a conservative break. Repeat in Household and observe only generic segmented reporting. Delete a manual source and verify its old adjustment amount disappears while the fingerprint boundary remains disconnected.

## Validation and Acceptance

Implementation is accepted only when all of these behaviors are demonstrated.

For raw personal snapshots of `0.00` before and `600000.00` after a newly captured $600,000 asset addition, the endpoint retains those raw values. It returns normalized values near `600000.00` on both sides, marks the earlier value `flat_normalized`, and reports normalized period change near zero. The chart draws no diagonal $0-to-$600,000 edge.

For the same raw snapshots with a legacy account but no captured event, the endpoint does not invent adjusted amounts. It marks the possible creation/inclusion interval unknown and the chart splits the line.

For a newly captured $50,000 liability, earlier normalized liabilities increase by $50,000 and earlier normalized net worth decreases by $50,000. Negative asset and liability values follow `computeSnapshot` semantics without `Math.abs`.

Adding a Plaid or manual account commits its active source, private addition event, fingerprinted personal snapshot, and aggregate totals together. A transaction/holding sync failure does not remove that local coverage metadata. Same-source event uniqueness prevents duplicates within the local state even though replaying the external one-use public token is not promised to succeed.

Deleting a manual source removes its event amount, saves a new fingerprinted snapshot, and produces an unknown disconnected boundary. Whole-user deletion cascades the new private rows. No deleted-source amount is retained in a new tombstone.

Household source/member-set changes produce a new group fingerprint at the next recomputation and split Reported history. Household responses contain no personal event rows, amounts, source IDs, account names, member names, or adjusted values.

Public shared-link responses remain unchanged and contain no new adjusted totals or coverage events. Existing raw snapshot fields stay backward compatible. Tests, lint, build, and configured real-database RLS validation pass.

## Idempotence and Recovery

The migration is additive. It adds nullable columns and one new table; it does not rewrite canonical snapshots or guess legacy balances. Before applying outside a disposable environment, take the normal PostgreSQL backup and inspect the migration for destructive statements. Deploy the previous application version first if rollback is needed; unused additive columns/table can remain until a later reviewed cleanup migration.

Coverage event writes use the unique `(userId, sourceType, sourceId)` key. Daily snapshots retain their existing owner/date upsert. Fingerprints are deterministic for a source set, so recomputation is repeatable and balance changes do not create false coverage changes.

The Plaid exchange still has an external crash window before local commit and does not promise full request replay. If local commit succeeds, the account, event, and personal snapshot succeed together. If it fails, none of those local rows survive. Best-effort transaction/holding sync may be retried later without changing the captured first-known coverage adjustment.

If normalized calculation encounters malformed amounts, a missing event, a null fingerprint boundary, or inconsistent ordering, it must return `unknown_coverage` and split the line. It must never fall back to zero or silently connect raw points.

Do not alter unrelated work in a dirty tree. Generated migration artifacts belong to this feature; unrelated modifications remain untouched.

## Artifacts and Notes

The motivating personal response should resemble this abbreviated shape:

    {
      "snapshots": [
        {
          "date": "2026-07-01",
          "netWorth": "0.00",
          "adjustedNetWorth": "600000.00",
          "quality": "flat_normalized",
          "coverageSegment": 0
        },
        {
          "date": "2026-07-05",
          "netWorth": "600000.00",
          "adjustedNetWorth": "600000.00",
          "quality": "observed",
          "coverageSegment": 1
        }
      ],
      "coverageEvents": [
        {
          "date": "2026-07-05",
          "assetAdjustment": "600000.00",
          "liabilityAdjustment": "0.00",
          "label": "Account connected"
        }
      ],
      "periodChange": {
        "reported": "600000.00",
        "normalized": "0.00"
      }
    }

For an unknown legacy boundary, adjusted fields are null across the incomparable edge and no amount appears in its annotation.

Record the actual migration name, test counts, RLS output, build output, and concise visual observations here while implementing.

Implementation evidence as of 2026-07-21 05:00Z:

    Migration: drizzle/0009_loving_wong.sql
    npm test: 34 files passed, 1 RLS file skipped; 233 tests passed, 35 skipped
    npm run lint: 0 errors; 1 pre-existing warning in src/lib/sync-holdings.ts
    configured npm run build: compiled, type-checked, generated 34/34 static pages

## Interfaces and Dependencies

No new npm package is required. Use `node:crypto` for SHA-256, Drizzle for schema and queries, PostgreSQL for persistence, Recharts for rendering, and Vitest plus Testing Library for tests.

In `src/lib/net-worth-history.ts`, define stable public interfaces equivalent to:

    export type HistoryQuality =
      | "observed"
      | "flat_normalized"
      | "unknown_coverage";

    export interface CoverageEventInput {
      effectiveDate: string;
      sourceType: "plaid_account" | "manual_account";
      sourceId: string;
      assetAdjustment: string;
      liabilityAdjustment: string;
    }

    export interface NetWorthHistoryPoint {
      date: string;
      totalAssets: string;
      totalLiabilities: string;
      netWorth: string;
      adjustedTotalAssets: string | null;
      adjustedTotalLiabilities: string | null;
      adjustedNetWorth: string | null;
      quality: HistoryQuality;
      coverageSegment: number;
    }

    export function computeUserCoverageFingerprint(
      plaidAccountIds: string[],
      manualAccountIds: number[]
    ): string;

    export function computeGroupCoverageFingerprint(
      memberIds: string[],
      plaidAccountIds: string[],
      manualAccountIds: number[]
    ): string;

    export function normalizeNetWorthHistory(input: {
      snapshots: CanonicalSnapshot[];
      events: CoverageEventInput[];
      possibleLegacyBoundaries: string[];
    }): CoverageAdjustedHistory;

Server-side builders must accept the RLS-scoped executor explicitly:

    export async function buildUserNetWorthHistory(
      userId: string,
      startDate: string,
      executor: DbExecutor
    ): Promise<CoverageAdjustedHistory>;

    export async function buildGroupNetWorthHistory(
      groupId: string,
      requestingUserId: string,
      startDate: string,
      executor: DbExecutor
    ): Promise<GroupNetWorthHistory>;

Keep route modules out of shared calculation code. The component, personal route, and household route import response types from `src/lib/net-worth-history.ts`.

Plan revision note (2026-07-21 04:21Z): Replaced the initial transaction-reconstruction and per-account-history design after the requested load-bearing analysis falsified its core completeness assumptions. The revision now uses private forward-captured addition events, source-set fingerprints, flat normalized comparison, conservative legacy/deletion breaks, raw-only household segmentation, and unchanged public share responses.
