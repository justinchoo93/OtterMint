# Investment performance across all investment accounts

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `docs/PLANS.md` from the repository root. A contributor should be able to implement and verify the feature with only this file and the current working tree.

## Purpose / Big Picture

OtterMint shows a snapshot of investment holdings (current value, aggregate unrealized gain) but cannot answer the performance questions an investor actually asks: how have my investments done over time, how much of the growth was the market versus my own deposits, what return did my money earn, and which accounts and positions are doing the work. The data to answer these only partially exists — the database keeps one aggregate `investment_total` per day and overwrites each account's balance and each holding's row on every refresh, so per-account and per-position history is destroyed as it is created.

After this work, the Investments view of the dashboard answers those questions. A user sees: a portfolio value chart over time that never confuses deposits or newly connected accounts with market growth; an attribution breakdown (start value → contributions → market P&L → coverage changes → end value); a money-weighted return figure once enough history has accrued; unrealized gain per account and per position against cost basis; and — after the optional final milestone — dividend income from Plaid's investment-transaction feed. Two new tables capture per-account balances and per-holding values on every refresh, so history accrues from the day this ships (it cannot be reconstructed backward; the sooner deployed, the longer the lines).

A human can demonstrate the result: refresh accounts on two different days, open the Investments view, and see a per-account balance series with two points; confirm that a $1,000 transfer from checking to a brokerage moves the "Contributions" attribution line and not "Market P&L"; and confirm the Jul 20, 2026 historical +$62,225 account-connection step appears as an amber coverage boundary on the portfolio chart, never as growth. A design mockup of the target view, built from real production data, is at https://claude.ai/code/artifact/35694a82-36ba-43b7-8fa0-ef7d68589a1e (visual reference only; this plan is self-contained without it).

## Progress

- [x] (2026-08-14 02:00Z) Researched holdings sync (delete-and-reinsert per refresh), the RLS migration pattern (0009), snapshot upsert idiom, the cash-flow classifier, dashboard navigation, and production deployment/migration constraints. Wrote this plan.
- [ ] Milestone 1: capture tables (`account_balance_snapshots`, `holding_snapshots`) with RLS, populated on every refresh and account link.
- [ ] Milestone 2: pure performance module `src/lib/investment-performance.ts` (series assembly, attribution, XIRR) with unit tests.
- [ ] Milestone 3: `GET /api/analytics/investments` with route tests.
- [ ] Milestone 4: `InvestmentPerformancePanel` on the Investments destination with component tests.
- [ ] Milestone 5: production rollout (migration via `docs/DEPLOYMENT.md §5.5`, deploy, verify first capture).
- [ ] Milestone 6 (optional, separately deployable): Plaid investment-transactions sync for dividends and per-account cash flows.

## Surprises & Discoveries

Pre-seeded from research; add implementation discoveries below.

- Observation: Per-account and per-holding history is destroyed on every refresh today. `accounts.current_balance` is overwritten in `src/app/api/accounts/refresh/route.ts`, and `src/lib/sync-holdings.ts` deletes all holdings rows for the refreshed accounts and reinserts fresh ones.
  Evidence: the `tx.update(accounts).set({ currentBalance: ... })` loop in the refresh route; the `db.delete(holdings).where(inArray(...))` call in `syncHoldings`.

- Observation: Aggregate investment history does exist — `user_net_worth_snapshots.investment_total` — and production holds 21 rows spanning 2026-07-04 to 2026-08-14, so the portfolio-level chart has data on day one even though per-account lines start empty.
  Evidence: production query 2026-08-14 returned 21 dated rows for the primary user.

- Observation: The production aggregate series contains a +$62,225 step between 2026-07-19 and 2026-07-20 caused by connecting an investment account, and it predates coverage-event capture (the only coverage event row is 2026-08-13 with a $0 adjustment). Any performance math that ignores account-set changes would report that step as a +17% market day.
  Evidence: snapshot values 372,462.75 (Jul 19) → 434,688.02 (Jul 20); `user_net_worth_coverage_events` has one row, effective 2026-08-13, adjustment 0.00.

- Observation: Contributions into investment accounts are visible only from the sending (checking) side, tagged `TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS` by the cash-flow classifier — and a checking-side transfer does not say which investment account received the money. Plaid's transactions sync emits no transactions for investment accounts.
  Evidence: production has 34 such transfers totaling $67,700; zero rows in `transactions` reference an investment account.

- Observation: Cost basis is missing for 4 of 33 production holdings ($16,330 of value), so unrealized-gain math must exclude positions without basis rather than treating null as zero.
  Evidence: `count(cost_basis) = 29` of 33; `sum(value) FILTER (WHERE cost_basis IS NULL) = 16330.21`.

- Observation: `drizzle-kit generate` emits only structural DDL. Grants, `ENABLE/FORCE ROW LEVEL SECURITY`, and policies for new tables must be appended to the generated migration by hand, following the exact pattern of `drizzle/0009_loving_wong.sql`.
  Evidence: 0009's `GRANT ... TO app_user`, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `CREATE POLICY ... USING (user_id = app_current_user_id())` blocks appear after the generated DDL, separated by `--> statement-breakpoint`.

- Observation: The dev machine has no reachable database; production migrations are applied by hand on the OtterHolt NAS per `docs/DEPLOYMENT.md §5.5` (psql inside `ottermint-db-1` plus a drizzle journal row), and migration must precede app deploy when new code reads new tables.
  Evidence: §5.5, verified live 2026-08-13 for migration 0010.

## Decision Log

- Decision: Capture per-account balance snapshots for all Plaid accounts (not only investment accounts), and per-holding snapshots for investment accounts.
  Rationale: The capture loop is identical either way, the storage cost is a few rows per refresh, and account-level history for depository/credit/loan accounts unblocks future analytics (per-account net-worth attribution) without another schema change. Holdings only exist for investment accounts, so holding snapshots are naturally scoped.
  Date/Author: 2026-08-14 / Claude + Justin

- Decision: Manual accounts are excluded from performance analytics.
  Rationale: Manual balances are user-edited free text with no market semantics — a retroactive edit would rewrite "history." Their aggregate already appears in net worth; performance math over them would be fiction.
  Date/Author: 2026-08-14 / Claude + Justin

- Decision: Portfolio-level attribution and return use the aggregate series plus classified transfer flows; per-account panels show balance history and unrealized gain versus cost basis only — no per-account market P&L in this plan.
  Rationale: A checking-side transfer cannot be attributed to a specific receiving investment account (see Surprises), so per-account flow adjustment is impossible until Milestone 6's investment-transaction feed provides in-account deposits. Publishing a per-account "return" that ignores flows would be wrong exactly when the user contributes — the worst possible time.
  Date/Author: 2026-08-14 / Claude + Justin

- Decision: Money-weighted return (XIRR) is the headline return metric; time-weighted return is deferred until per-account snapshots have accrued valuations near each flow date (revisit ~3 months after Milestone 5).
  Rationale: XIRR needs only dated flows plus start/end values, all available at ship time, and answers "what did my dollars earn." TWR requires valuations at every flow date; snapshots are refresh-driven (~every 2 days in practice), so early TWR would be false precision. The repo's precedent (coverage-aware history) is to prefer honest approximations with labels over invented exactness.
  Date/Author: 2026-08-14 / Claude + Justin

- Decision: The portfolio chart handles account-set changes with segment splits (never a bridged line) using a fingerprint of the investment-account ID set stored on each daily capture, and the attribution's "coverage" line absorbs balance steps at those boundaries. The legacy Jul 20, 2026 step is handled by the same rule.
  Rationale: Identical honesty rule as the net-worth chart (`docs/plans/net-worth-coverage-aware-history.md`): OtterMint never draws a wealth slope across a change in what is being measured. Reusing the user's mental model from that chart keeps the product coherent.
  Date/Author: 2026-08-14 / Claude + Justin

- Decision: Snapshot capture is daily-upsert (unique per account per calendar date, last refresh of the day wins), keyed `(account_id, date)` and `(account_id, security_id, date)`.
  Rationale: Matches `user_net_worth_snapshots` semantics exactly, keeps table growth bounded (rows/day = accounts + holdings), and makes capture idempotent under repeated refreshes.
  Date/Author: 2026-08-14 / Claude + Justin

- Decision: Unrealized-gain figures exclude positions with null cost basis and say so in the UI, rather than treating missing basis as zero cost.
  Rationale: Null-as-zero would report a fake +100% gain on those positions ($16,330 of real value today). Excluding with a visible footnote is honest and matches the production mockup.
  Date/Author: 2026-08-14 / Claude + Justin

- Decision: No external market data (benchmarks such as SPY) in this plan.
  Rationale: Every current data source is user-scoped (Plaid) with no third-party market API dependency; adding one is a separate product and privacy decision.
  Date/Author: 2026-08-14 / Claude + Justin

- Decision: Milestone 6 (investment transactions) is planned here but separately deployable and explicitly optional.
  Rationale: Dividends and per-account flows are valuable but need a new Plaid endpoint, a new table, and their own backfill considerations; coupling them to Milestones 1–5 would delay the accrual clock that per-account snapshots start.
  Date/Author: 2026-08-14 / Claude + Justin

- Decision: The UI lives on the existing Investments navigation destination (currently just the holdings list), not on Analytics.
  Rationale: The destination already exists with the right name and currently under-uses its space; Analytics stays focused on cash flow and net worth.
  Date/Author: 2026-08-14 / Claude + Justin

## Outcomes & Retrospective

To be written at completion. Success is measured against the Purpose section: the four investor questions answerable from the Investments view, deposits and coverage never presented as market growth, and history accruing automatically from deploy day.

## Context and Orientation

OtterMint is a Next.js 16 (App Router) personal-finance app. Server and UI code live in `src/`. Data comes from Plaid (a bank-data aggregator) into PostgreSQL via Drizzle ORM (schema `src/lib/db/schema.ts`, journaled SQL migrations in `drizzle/`). Every API route authenticates via `getUserId()` (`src/lib/auth/get-user-id.ts`) and does database work inside `withUser(userId, tx => ...)` (`src/lib/db/with-user.ts`), which sets the row-level-security context. RLS (Row Level Security) means PostgreSQL policies make one user's rows invisible to another at the database layer; the app connects as a non-superuser `app_user` role and every user-owned table carries a policy comparing `user_id` to `app_current_user_id()`. New tables need those grants and policies added by hand to the generated migration — `drizzle/0009_loving_wong.sql` is the copyable template.

Definitions used throughout: a **snapshot** is a dated row recording a value as observed that day. **Cost basis** is what was paid for a position; **unrealized gain** is current value minus cost basis. A **flow** is money moved by the user (a contribution into or withdrawal out of investment accounts) as opposed to market movement. **Money-weighted return (XIRR)** is the single annualized rate that makes all dated flows plus the start value grow to the end value — it answers "what did my dollars earn, given when I added them." **Time-weighted return** removes the effect of flow timing and is deferred (see Decision Log). A **coverage boundary** is a date where the set of tracked accounts changed, so values before and after measure different things.

The relevant existing machinery:

Refresh (`src/app/api/accounts/refresh/route.ts`): inside one `withUser` transaction, for each Plaid item it fetches balances (`/accounts/get`), updates `accounts.current_balance`, syncs transactions, syncs holdings for investment accounts, then calls `recomputeUserNetWorthSnapshot(userId, tx)` from `src/lib/recompute-net-worth.ts`, which upserts today's row in `user_net_worth_snapshots` (aggregate totals including `investment_total`, plus a `coverage_fingerprint` — a SHA-256 of the sorted active source identifiers). Account linking (`src/app/api/plaid/exchange-token/route.ts`) inserts the new item and accounts and also recomputes the snapshot.

Holdings (`src/lib/sync-holdings.ts`): calls Plaid `investmentsHoldingsGet`, deletes all `holdings` rows for the refreshed investment accounts, reinserts current positions with `security_id`, `quantity`, `price`, `value`, `cost_basis` (nullable). No history survives a refresh.

Cash-flow classification (`src/lib/cashflow.ts`, built by `docs/plans/cash-flow-analytics.md`): a pure function partitions every transaction into `income | spending | savings | internal` using the stored Plaid detailed category (`transactions.category_detailed`). Transfers into investment/savings destinations classify as `savings`: detailed value `TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS` (a contribution, positive amount = money leaving checking) and `TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS` (a withdrawal arriving back, negative amount). Plaid's sign convention: positive = money left the account. These classified transfers are this plan's portfolio-level flow stream.

Navigation (`src/app/page.tsx`): a `NAV_ITEMS` array defines destinations; `renderContent()` renders per destination. The `investments` destination currently renders only `HoldingsPanel` (`src/components/dashboard/HoldingsPanel.tsx`). Charts use Recharts; panels share a visual idiom (rounded-xl bordered cards, CSS-variable colors, `formatCurrency` from `src/lib/format.ts`, skeleton pulse while loading). Money travels API responses as strings; arithmetic uses numbers internally, serialized with `.toFixed(2)`; sums that must reconcile use integer cents (see `aggregateCashflow` in `src/lib/cashflow.ts` for the pattern).

Operations: the dev machine has no reachable database. Tests mock all I/O (`npm test`, Vitest; server route tests carry `// @vitest-environment node`). Production is on the OtterHolt NAS; migrations are applied by hand per `docs/DEPLOYMENT.md §5.5` (psql inside `ottermint-db-1` + a drizzle journal row) and must precede the app deploy; the deploy itself is `scripts/deploy.sh`. Production has no Plaid webhooks — data changes only on manual refresh. After any host-visible change, update `interests/OtterHolt.md` in the Obsidian "life" vault per its binding rules.

## Plan of Work

### Milestone 1 — Capture tables, populated on every refresh and link

Goal: two new RLS-protected tables accrue per-account and per-holding history; nothing user-visible changes. This milestone starts the accrual clock and should reach production quickly (Milestone 5 can run immediately after it, before 2–4 are built).

In `src/lib/db/schema.ts`, after the `holdings` table, add two tables following the existing column idioms exactly:

`accountBalanceSnapshots` (`account_balance_snapshots`): `id` serial primary key; `userId` uuid not null referencing `users.id` on delete cascade; `accountId` text not null referencing `accounts.accountId` on delete cascade; `date` date not null; `balance` numeric(14,2) not null; `type` text not null and `subtype` text (copied from the account at capture time, so history survives account-type edits and joins are unnecessary for filtering); `createdAt` timestamptz default now. Unique on `(accountId, date)`; index on `(userId, date)`.

`holdingSnapshots` (`holding_snapshots`): `id` serial primary key; `userId` uuid not null referencing `users.id` on delete cascade; `accountId` text not null referencing `accounts.accountId` on delete cascade; `securityId` text not null; `tickerSymbol` text; `quantity` numeric(18,8) not null; `price` numeric(12,4) not null; `value` numeric(14,2) not null; `costBasis` numeric(14,2); `date` date not null; `createdAt` timestamptz default now. Unique on `(accountId, securityId, date)`; index on `(userId, date)`.

Generate the migration (`npm run db:generate` → `drizzle/0011_<name>.sql`), then hand-append the security block for each table, copying `drizzle/0009_loving_wong.sql` verbatim in structure: `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO app_user`, `GRANT USAGE, SELECT ON SEQUENCE <table>_id_seq TO app_user`, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and a `FOR ALL TO app_user` policy `USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id())`, each statement separated by `--> statement-breakpoint`. Never run `npm run db:push` (it drops hand-written RLS).

Create `src/lib/capture-snapshots.ts` exporting `captureAccountSnapshots(userId, executor)`: select the user's Plaid accounts (via the `plaid_items` join used everywhere), upsert one `account_balance_snapshots` row per account for today (UTC date string, `onConflictDoUpdate` on the unique key — the daily-upsert idiom from `src/lib/compute-snapshot.ts`), and one `holding_snapshots` row per current `holdings` row for investment accounts. Balance may be null on an account; skip those rows rather than storing zero. The function is called from exactly the two places balances change, inside their existing transactions, immediately before `recomputeUserNetWorthSnapshot`: the refresh route and the exchange-token route. Failures are wrapped in the same best-effort try/catch style the routes use for snapshot recomputation, so a capture bug cannot fail a refresh.

Tests: `src/__tests__/capture-snapshots.test.ts` mocks the executor (the `sync-transactions.test.ts` hoisted-mock pattern) and asserts one upsert per account and per holding with today's date, null-balance rows skipped, and holding snapshots only for investment accounts. Extend `src/__tests__/rls-isolation.test.ts` (the real-database suite, skipped when no test database is configured) to add both tables to its fail-closed checks: user A cannot read or write user B's rows; no user context yields zero rows. Update the migration-range comment in that file.

Acceptance: `npm test` passes. After this milestone reaches production (Milestone 5), two refreshes on different days produce, for each Plaid account, two dated rows in `account_balance_snapshots` (verifiable with one psql query), and repeated same-day refreshes leave exactly one row per account per day.

### Milestone 2 — The performance module

Goal: `src/lib/investment-performance.ts`, pure and I/O-free, computing everything the view shows. No server-only imports (the UI imports its types and label helpers).

Inputs are plain rows: the aggregate series (date, investmentTotal, coverageFingerprint) from `user_net_worth_snapshots`; per-account series rows from `account_balance_snapshots` (investment types only); current holdings rows; and the flow stream — savings-classified transfers from the transactions table (`TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS` positive amounts as contributions, `TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS` negative amounts as withdrawals; reuse `classifyTransaction` from `src/lib/cashflow.ts` rather than re-encoding the category list — pass each row through it and keep the `savings` ones, excluding `TRANSFER_OUT_SAVINGS`/`TRANSFER_IN_SAVINGS` by detailed value since bank-savings moves are not investment flows).

Exports (full signatures in Interfaces and Dependencies):

`buildPortfolioSeries(aggregateRows, accountRows)` — the chart model. The aggregate series is split into segments wherever `coverage_fingerprint` changes between consecutive rows (and at the known legacy boundary: any day-over-day step where fingerprints are unavailable and the account-balance data shows an account's first-ever snapshot mid-series). Each segment is a separate polyline; boundaries carry an annotation with the step amount. Per-account series are returned as one line per account, each starting at that account's first snapshot — no backfill, no bridging.

`computeAttribution(series, flows, windowStart, windowEnd)` — returns `{ start, contributions, withdrawals, marketPnl, coverageSteps, end }` in integer-cents honesty: `marketPnl` is the residual `end − start − contributions + withdrawals − coverageSteps`, where `coverageSteps` is the summed boundary steps inside the window. Contributions/withdrawals come from the flow stream filtered to the window.

`computeXirr(flows, startValue, startDate, endValue, endDate)` — money-weighted annualized return. Cash-flow convention: `−startValue` at `startDate`, `−contribution` at each contribution date, `+withdrawal` at each withdrawal date, `+endValue` at `endDate`. Solve for the rate `r` where the net present value `Σ cf_i · (1+r)^(−days_i/365)` is zero, by bisection on `r ∈ (−0.999, 10)` to 1e-6 (bisection, not Newton — it cannot diverge, and performance is irrelevant at this scale). Return null when the window spans a coverage boundary (the flows are unknowable across it) or is shorter than 30 days (annualizing noise); the UI explains both cases.

`computeUnrealized(holdings)` — per-account and per-position: value, cost, gain, gain percent, computed only over positions with non-null cost basis, plus `excludedValue` (the summed value of basis-less positions) for the footnote.

Tests in `src/__tests__/investment-performance.test.ts`, all hand-computed in comments: a two-segment series splits at a fingerprint change and never bridges; attribution reconciles exactly on a fixture modeled on production reality (start 391,010.83; contributions 8,500; coverage step 62,225.27; end 459,956.89 → market −1,779.21 as the residual — the real numbers from Artifacts and Notes); XIRR of a single −10,000 flow growing to 11,000 over 365 days returns 0.10 ± 1e-4; XIRR returns null across a coverage boundary and for sub-30-day windows; unrealized-gain math excludes null-basis positions and reports their value separately; withdrawals reduce contributions' effect, not market P&L.

Acceptance: `npm test` passes; the attribution fixture's arithmetic is verifiable by hand from the comment alone.

### Milestone 3 — The API

Goal: `GET /api/analytics/investments?days=N` (default 90, clamp 30..730), authenticated, personal-only, one response feeding the whole view.

Create `src/app/api/analytics/investments/route.ts` following `src/app/api/analytics/cashflow/route.ts` conventions exactly (auth, `withUser`, `logServerError`, error envelope). Under one `withUser`, query: the user's `user_net_worth_snapshots` (date ≥ window start, the same columns the net-worth route reads plus `investment_total` and `coverage_fingerprint`); `account_balance_snapshots` for investment-type accounts in the window; current `holdings` joined to `accounts` for names; and savings-classified transfer rows from `transactions` (reuse the cashflow route's join and let the module filter). Assemble with the Milestone 2 functions and return `{ series, accounts, attribution, xirr, unrealized }` (shape in Interfaces and Dependencies). Response money is strings.

Tests in `src/__tests__/investments-route.test.ts` (`// @vitest-environment node`, hoisted-mock pattern from `src/__tests__/cashflow-route.test.ts`): 401 unauthenticated; the production-shaped fixture returns the reconciled attribution and a two-segment series; `days` clamps; a user with no investment accounts gets empty series and null xirr rather than errors.

Acceptance: `npm test` passes; with the dev server running and a logged-in browser, `/api/analytics/investments?days=90` returns the documented shape, `attribution` reconciles (start + contributions − withdrawals + marketPnl + coverageSteps = end, exactly, as strings of cents-safe numbers), and no flow-adjusted per-account return appears anywhere in the payload.

### Milestone 4 — The Investments view

Goal: the Investments destination becomes the performance page from the mockup: KPI row, portfolio chart, attribution, per-account panel, holdings table (the existing `HoldingsPanel` continues to render below the new panel).

Create `src/components/dashboard/InvestmentPerformancePanel.tsx` (client component, `{ refreshKey?: number }`, fetches `/api/analytics/investments?days=90`, matches sibling card chrome and skeletons). Contents, top to bottom: four KPI tiles — portfolio value, unrealized gain (+$ and % with the basis-exclusion footnote), contributions in window, market P&L in window (colored by sign); the portfolio chart — Recharts LineChart with one line per segment of the aggregate series (never connected across a boundary), amber dashed reference lines with labels at coverage boundaries, purple markers at contribution dates, and per-account lines appearing once accounts have ≥ 2 snapshots (before that, a muted caption: "Per-account history starts <first capture date>"); the attribution rows — start / contributions / withdrawals / market P&L / coverage / end, with proportional delta bars (the mockup's design); the per-account unrealized list — gain bars by percent with values; XIRR appears in the KPI row's fourth tile sublabel once non-null, with its label ("money-weighted, annualized"). Empty states: no investment accounts → the panel renders a single quiet card ("Connect an investment account to see performance"); household mode → not rendered (personal-only, matching the cashflow panel).

Wire into `src/app/page.tsx`: the `investments` destination renders `<InvestmentPerformancePanel refreshKey={refreshKey} />` above the existing `<HoldingsPanel .../>` in personal mode; household mode keeps the current placeholder.

Tests in `src/__tests__/investment-performance-panel.test.tsx` (fetch-mock pattern from `src/__tests__/cashflow-panel.test.tsx`): KPI tiles render from a fixture payload; the coverage annotation text renders; a null xirr shows the accrual explanation instead of a number; the no-investments empty state renders; loading skeleton first.

Acceptance: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass. In the browser with real data: the Jul 20 step renders as a split with the amber annotation; the three July contribution markers appear; no chart line bridges the boundary.

### Milestone 5 — Production rollout

Goal: migration 0011 and the new code live; capture verified accruing.

Order is fixed: push `main`; apply migration 0011 on the NAS per `docs/DEPLOYMENT.md §5.5` (compute the file hash and journal `when`, run the DDL + security block + journal insert in one psql transaction inside `ottermint-db-1`, verify the journal); deploy `scripts/deploy.sh`; health check; press Refresh once in the app; verify capture with one query (expect one row per Plaid account in `account_balance_snapshots` for today, and one row per holding in `holding_snapshots`); a second refresh on a later day proves daily-upsert (still one row per account per day). Update `interests/OtterHolt.md` (Obsidian "life" vault) with the dated change note per its binding rules, and update this plan's living sections.

Acceptance: the psql verification queries return the expected counts on two distinct dates; the Investments view renders in production with the aggregate chart immediately and per-account lines after the second capture day.

### Milestone 6 (optional, separately deployable) — Investment transactions

Goal: dividends, buys/sells, and in-account cash flows from Plaid's `investmentsTransactionsGet`, enabling a dividend-income figure and — later — true per-account flow attribution.

New table `investment_transactions`: `id` serial; `userId`; `accountId` (fk, cascade); `investmentTransactionId` text unique; `securityId` text nullable; `date` date; `name` text; `amount` numeric(14,2) (Plaid investment convention: positive = cash out of the account); `type` text and `subtype` text (Plaid's, e.g. `cash`/`dividend`, `buy`, `sell`); `quantity` numeric(18,8) nullable; `price` numeric(12,4) nullable; `isoCurrencyCode` text default USD; `createdAt`. Unique upsert key `investment_transaction_id`; RLS block identical in structure to Milestone 1's. Sync module `src/lib/sync-investment-transactions.ts` mirrors `syncHoldings`'s shape but pages through `investmentsTransactionsGet` (it is date-windowed with `total_investment_transactions` pagination, not cursor-based: request the trailing 24 months on first sync, then since the last stored date minus 7 days for overlap; upsert on the unique id). Called from the refresh route for items with investment accounts, best-effort like holdings. The API gains a `dividends` block (trailing-12-month sum of `subtype = 'dividend'` rows and a monthly series); the panel gains a dividend tile. The privacy filter (`isExcludedTransaction`) is not applied — investment transactions carry security names, not merchants; note this consciously in review.

Acceptance: after a refresh, dividend rows exist for accounts that pay them (verifiable by psql against a known dividend payer — production holds PM and VALIX, both payers); the dividend tile shows a non-zero trailing sum; re-running sync is idempotent (row count stable). Deployment follows the same §5.5 + deploy order as Milestone 5.

## Concrete Steps

All commands from the repository root `/Users/justin/code/personal/OtterMint`.

    # Milestone 1
    npm run db:generate                 # 0011_<name>.sql; hand-append the RLS blocks after
    npm test -- src/__tests__/capture-snapshots.test.ts
    # Milestone 2
    npm test -- src/__tests__/investment-performance.test.ts
    # Milestone 3
    npm test -- src/__tests__/investments-route.test.ts
    # Milestone 4
    npm test -- src/__tests__/investment-performance-panel.test.tsx
    npm run lint && npx tsc --noEmit && npm test && npm run build

    # Milestone 5 (after pushing main)
    shasum -a 256 drizzle/0011_*.sql    # hash for the journal row
    grep -A3 '"tag": "0011' drizzle/meta/_journal.json   # "when" millis
    # apply per docs/DEPLOYMENT.md §5.5 (BEGIN; DDL + RLS; INSERT journal row; COMMIT), then:
    scripts/deploy.sh
    # press Refresh in the app, then verify:
    ssh otterholt 'docker exec ottermint-db-1 psql -U postgres -d ottermint \
      -c "SELECT date, count(*) FROM account_balance_snapshots GROUP BY 1 ORDER BY 1;" \
      -c "SELECT date, count(*) FROM holding_snapshots GROUP BY 1 ORDER BY 1;"'

Expected after the first refresh: one `account_balance_snapshots` row per Plaid account (production today: 11) and one `holding_snapshots` row per position (production today: 33) for the current date. Commit at each milestone boundary; keep this plan's Progress current at every stopping point.

## Validation and Acceptance

The feature is accepted when: (1) capture accrues — two refreshes on different days yield two dated rows per account and the daily-upsert keeps same-day refreshes at one row; (2) the module's attribution fixture reconciles by hand-checkable arithmetic and XIRR returns 10.0% ± 0.01 on the canonical one-year fixture, null across coverage boundaries; (3) the API payload's attribution identity `start + contributions − withdrawals + marketPnl + coverageSteps = end` holds exactly; (4) in the production browser, the portfolio chart splits at the Jul 20 legacy boundary with the amber annotation, contribution markers appear on their dates, per-account lines appear after the second capture day, and no per-account return figure exists anywhere; (5) unrealized gains exclude basis-less positions with the exclusion visible; (6) the full local gate passes (`npm test`, lint, `tsc`, build). Milestone 6, if built: dividend rows verifiably present and idempotent, dividend tile non-zero for a known payer.

## Idempotence and Recovery

The migration is additive and journaled; §5.5 application is transactional (DDL + RLS + journal row commit together, or nothing). Capture is a daily upsert — refreshing twice is safe by construction; a failed capture is caught and logged without failing the refresh, and the next refresh self-heals (at worst one missing day, which the chart renders as a gap, never interpolated). No backfill exists or is attempted: per-account history before deploy day is unrecoverable, which is stated in the UI rather than papered over. Rolling back the app (git revert + redeploy) leaves the new tables inert and harmless. Milestone 6's sync overlaps its date window by 7 days on each run so interrupted syncs self-repair via the unique-key upsert.

## Artifacts and Notes

The production-reality fixture anchoring the attribution and chart tests (values queried 2026-08-14):

    aggregate investment series (segment 1): Jul 5 391,010.83 … Jul 19 372,462.75
    coverage boundary: Jul 19 → Jul 20 step +62,225.27 (account connected, pre-event-capture)
    aggregate investment series (segment 2): Jul 20 434,688.02 … Aug 14 459,956.89
    contributions in window: Jul 7 +2,000 · Jul 16 +4,000 · Jul 31 +2,500  (= 8,500)
    attribution: 391,010.83 + 8,500 − 1,779.21 (market, residual) + 62,225.27 = 459,956.89
    unrealized: value-with-basis 441,206.06 · cost 302,145.39 → +139,060.67 (+46.0%);
                excluded (no basis): 16,330.21 across 4 positions
    per-account unrealized: Self-Directed 120,103.88/59,450.76 (+102.0%) ·
      Self-Directed 280,077.41/195,369.77 (+43.4%) · Roth 12,261.81/9,891.58 (+24.0%) ·
      Individual 45,093.17/37,433.28 (+20.5%)

Design mockup (visual target, built from these numbers): https://claude.ai/code/artifact/35694a82-36ba-43b7-8fa0-ef7d68589a1e

## Interfaces and Dependencies

No new packages. Recharts, Drizzle, Vitest as established.

In `src/lib/db/schema.ts`: `accountBalanceSnapshots` and `holdingSnapshots` as specified in Milestone 1.

In `src/lib/capture-snapshots.ts`:

    export async function captureAccountSnapshots(
      userId: string,
      executor: DbExecutor
    ): Promise<void>;

In `src/lib/investment-performance.ts`:

    export interface PortfolioSeriesPoint { date: string; value: string; segment: number; }
    export interface CoverageBoundary { date: string; step: string; }
    export interface AccountSeries { accountId: string; name: string; points: PortfolioSeriesPoint[]; }
    export interface Attribution {
      start: string; contributions: string; withdrawals: string;
      marketPnl: string; coverageSteps: string; end: string;
    }
    export interface UnrealizedPosition {
      accountId: string; account: string; securityId: string; ticker: string | null;
      name: string; value: string; cost: string; gain: string; gainPct: string;
    }
    export interface Unrealized {
      total: { value: string; cost: string; gain: string; gainPct: string; excludedValue: string };
      byAccount: Array<{ accountId: string; name: string; value: string; cost: string;
        gain: string; gainPct: string }>;
      positions: UnrealizedPosition[];
    }
    export function buildPortfolioSeries(aggregateRows, accountRows):
      { segments: PortfolioSeriesPoint[]; boundaries: CoverageBoundary[]; accounts: AccountSeries[] };
    export function computeAttribution(series, flows, windowStart: string, windowEnd: string): Attribution;
    export function computeXirr(flows, startValue: number, startDate: string,
      endValue: number, endDate: string): number | null;
    export function computeUnrealized(holdingRows): Unrealized;

In `src/app/api/analytics/investments/route.ts`: `GET` returning
`{ series, accounts, attribution, xirr: string | null, unrealized }` with the types above.

In `src/components/dashboard/InvestmentPerformancePanel.tsx`:
`export function InvestmentPerformancePanel({ refreshKey }: { refreshKey?: number })`.

Milestone 6 adds `investmentTransactions` to the schema, `src/lib/sync-investment-transactions.ts`
(`syncInvestmentTransactions(accessToken, investmentAccountIds, userId, sinceDate, executor)`), and a
`dividends` block on the API response.
