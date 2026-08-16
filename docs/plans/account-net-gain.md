# Per-account true net gain: contributions versus balance

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `docs/PLANS.md` from the repository root. It builds on `docs/plans/investment-performance.md` (checked in), which created the tables and panel this plan extends; that file is incorporated by reference for history, but everything needed to implement this plan is repeated here.

## Purpose / Big Picture

The Investments view currently shows "unrealized gain by account": the market value of the positions an account holds right now minus what was paid for those positions. That number cannot answer the question an account owner actually asks — "am I up or down in this account?" — because it is blind to realized gains (profit already locked in by selling, now sitting as cash) and to dividend and interest income. Production makes the gap concrete: the Individual ····5111 account shows an unrealized loss of −$1,236.78, yet its owner deposited $35,000 and the account is worth $47,514.67 — a true gain of +$12,514.67, because roughly $13,750 of profit was realized by selling and is invisible to the unrealized figure.

After this work, the Investments view gains a "Net Gain by Account" section that reports, per account: total money put in (net contributions), the current balance, and the difference — true net gain, which by construction includes realized gains, unrealized gains, dividends, and interest, minus fees. Each account row carries a small chart plotting cumulative contributions against the account balance over time, and an explicit label saying what window the figure covers: "lifetime" when the account's entire history is verifiably present in our data, or "since <date>" when it is not. A human can demonstrate the result by opening the Investments tab and seeing the Individual account row read approximately +$12,514.67 lifetime net gain on $35,000 contributed, and by cross-checking that figure against the brokerage's own "total gain" display for the same account.

## Progress

- [x] (2026-08-15 22:10Z) Feasibility research against production (Milestone 0): confirmed Plaid's investment-transactions feed carries external cash transfers with `account_id` attribution, and that for the two accounts born inside the 24-month backfill window the feed reconciles against the live cash balance to the cent. Evidence in `Surprises & Discoveries`. Wrote this plan.
- [x] (2026-08-16) Load-bearing validation of the plan's two unproven assumptions. Outcome: the `available_balance` cash source was falsified and replaced with holdings-derived cash (see `Decision Log` and `Surprises & Discoveries`); re-link durability of the feed was confirmed, with fragmentation noted as an accepted residual risk. Plan revised accordingly before implementation.
- [x] (2026-08-16 19:00Z) Milestone 1: `computeAccountNetGains` in `src/lib/investment-performance.ts` with 12 unit tests (32 total in the module's suite), built on the revised holdings-cash gate.
- [x] (2026-08-16 19:05Z) Milestone 2: `accountReturns` on `GET /api/analytics/investments` — three new unwindowed queries plus reuse of the existing holdings rows; 2 new route tests (12 total). The new queries sit after the existing ones so the route-test mock queue stays backward-compatible.
- [x] (2026-08-16 19:10Z) Milestone 3: "Net Gain by Account" section in `InvestmentPerformancePanel` between Allocation and Unrealized, with per-account contribution-vs-balance mini charts (sparse series merged per account, `connectNulls`, year-bearing window labels via a new `formatFullDateLabel`); 4 new component tests (15 total). Full gate: 356 passed / 41 skipped, lint (one pre-existing unrelated warning in `sync-holdings.ts`), tsc clean, build compiles all routes (local build needs dummy `PLAID_ENV`/`PLAID_CLIENT_ID`/`PLAID_SECRET`/`ENCRYPTION_KEY` since real values live only in the NAS deploy env).
- [ ] Milestone 4: production rollout and verification (no migration needed).

## Surprises & Discoveries

- Observation: Plaid's investment-transactions feed reports external cash movements per brokerage account, which removes the blocker recorded in `docs/plans/investment-performance.md` ("a checking-side transfer does not say which investment account received the money"). Deposits arrive as `type = 'transfer', subtype = 'transfer'` rows with negative amounts.
  Evidence: production query 2026-08-15, `GROUP BY account, type, subtype` over `investment_transactions`: Individual ····5111 has 8 `transfer|transfer` rows totaling −35,000.00 (2026-04-22 → 2026-06-03, names like "Tfr JPMORGAN CHASE BAN, JUSTIN CHOO - TRANSFER"); Roth ····6093 has 5 rows totaling −17,500.14 (names "IRA ROTH CONV - TRANSFER").

- Observation: For accounts whose entire life fits inside the feed's 24-month backfill window, the feed is complete to the cent: summing every stored transaction amount (sign-flipped) reproduces the account's live available (cash) balance exactly.
  Evidence: production reconciliation 2026-08-15 — Individual ····5111: implied cash 11,318.17 vs `available_balance` 11,318.17, residual 0.00. Roth ····6093: implied 2,261.81 vs 2,261.81, residual 0.00.

- Observation: The two Self-Directed accounts are older than the backfill window: their first stored transactions sit exactly at the window edge (2024-08-15, the date 24 months before the first sync), their first rows are buys rather than deposits, and their cash residuals are large (····6850: +175,149.96; ····6940: +2,305.53). Their history is truncated, so a lifetime figure is not computable for them and must not be invented.
  Evidence: same production queries; `min(date) = 2024-08-15` for both, zero `transfer|transfer` rows for either, residuals as above.

- Observation: The feed's taxonomy in production contains exactly eight `type|subtype` shapes: `buy|buy`, `sell|sell`, `transfer|transfer`, `transfer|split`, `cash|interest`, `cash|dividend`, `fee|dividend`, `fee|interest`. The `transfer|split` rows are stock splits (amount 0.00) and must never count as external flows. This is the same institution-drift landscape that previously forced dividend matching onto subtype alone (111 of 119 dividends arrived as `type = 'fee'`).
  Evidence: the 17-row `GROUP BY` result, 2026-08-15; Self-Directed ····6850 shows `transfer|split, n=2, total 0.00`.

- Observation: `available_balance` is the wrong cash source for the lifetime gate — validated 2026-08-16, one day after this plan first specified it. Plaid's docs define `balances.available` for investment accounts as "the total cash available to withdraw as presented by the institution", warn it may be null ("not all institutions calculate the available balance") and may be cached; and production already disagrees with the feed: the Roth's `available_balance` drifted to 2,261.90 against feed-implied cash of 2,261.81 (residual $0.09 — enough to fail an exact-zero gate), and Chase ····6850 reports $2,500 more withdrawable than its swept cash position. Holdings-derived cash (summing `holdings.value` where `is_cash_equivalent` or `security_type = 'cash'`) reconciles the feed to exactly 0.00 on both lifetime-complete accounts, and is structurally the right quantity: sweep movements appear in the feed as buys/sells of the cash security, so the cash holding row is definitionally feed-consistent.
  Evidence: production 2026-08-16 — residuals vs `available_balance`: 5111 0.00, 6093 0.09, 6850 175,149.96, 6940 2,305.53; residuals vs holdings cash: 5111 0.00, 6093 0.00, 6850 172,649.96, 6940 2,305.53. Plaid docs quoted from https://plaid.com/docs/api/accounts/.

- Observation: Feed history survives every re-link path that exists in the app, so the durable-ledger premise holds — but not by the mechanism one might assume. In-app re-auth is Plaid Link update mode (`src/app/api/plaid/create-update-link-token/route.ts` passes the existing `access_token`; the success handler writes nothing to the database), which keeps the Item and its `account_id`s; there is no per-institution unlink route at all, and the only path that fires the `accounts` ON DELETE CASCADE is whole-user deletion. The exchange-token route does a plain insert of accounts (no upsert), so a duplicate `account_id` would fail loudly and roll back rather than destroy data. The real long-term risk is fragmentation: if an Item dies and the institution is freshly re-linked, Plaid may issue new `account_id`s, stranding the old history under old rows — under this feature that account would honestly downgrade to anchored mode rather than show a wrong number.
  Evidence: `src/app/api/plaid/exchange-token/route.ts` (plain `tx.insert(accounts)`, the only accounts-insert site per grep); `src/components/plaid/PlaidReauthButton.tsx` success handler; webhook `USER_PERMISSION_REVOKED` handler only stamps `errorCode`; production 2026-08-16: six items, all distinct institutions, zero orphaned `investment_transactions` rows; Plaid docs on update mode ("An Item's access_token does not change when using Link in update mode") and on `account_id` change across regenerated access tokens.

- Observation: The lifetime figures this feature will surface are materially different from the unrealized figures already shown, in both directions. Individual ····5111: unrealized −$1,236.78 but lifetime net gain +$12,514.67 (+35.8% on $35,000 in). Roth ····6093: unrealized +$295.92 but lifetime net gain −$5,050.83 (−28.9% on $17,500.14 in).
  Evidence: balances from `accounts` (47,514.67 and 12,449.31) minus net contributions from the transfer rows above; unrealized figures from the live panel.

## Decision Log

- Decision: Source per-account contributions from the brokerage-side feed (`investment_transactions`), not from the checking-side cash-flow classifier used by the portfolio attribution.
  Rationale: The brokerage side is account-attributed (the checking side is not), covers 24 months of history (the classifier's window is the route's `days` parameter), and reconciles to the cent in production. The portfolio attribution keeps its existing checking-side flows — the two measure the same transfers from opposite ends and serve different panels; consolidating them is out of scope.
  Date/Author: 2026-08-15 / Claude with Justin.

- Decision: Two honesty modes per account, decided at compute time. "Lifetime" — used only when the account's birth is verifiably inside our data — reports balance minus net contributions since inception. "Anchored" — the fallback — reports the gain since the account's earliest daily balance snapshot: balance now, minus balance at the anchor, minus net contributions after the anchor. If an account has no snapshot yet, the row shows contributions and balance but no gain ("mode: none").
  Rationale: The repo's coverage philosophy (see `docs/plans/net-worth-coverage-aware-history.md`): never report a number whose measurement basis is unknown. Anchored figures are true statements with a stated start date; a fabricated "lifetime" figure for a truncated account would silently include pre-existing value as gain.
  Date/Author: 2026-08-15 / Claude with Justin.

- Decision: The lifetime gate is three conditions, all required: (a) the cash residual is exactly zero — the account's holdings-derived cash (summed `holdings.value` over rows flagged `is_cash_equivalent` or `security_type = 'cash'`, requiring the account to have at least one holdings row of any kind) equals the sign-flipped sum of every stored feed row for the account; (b) the account's earliest stored feed row is an external cash-in (an external-flow subtype with negative amount); (c) that earliest row is dated at least 7 days after the account's backfill window start, taken as the Plaid item's `created_at` minus 24 months.
  Rationale: (a) proves no cash entered or left invisibly; (b) proves the first thing we ever saw was money arriving, the only way a brokerage account can begin; (c) guards against a truncated account whose first visible row is coincidentally a deposit at the window edge. The `created_at − 24 months` proxy is exact for items linked after the feed shipped (first sync runs at link time) and earlier-than-actual for the legacy items (their first sync ran 2026-08-15) — an error in the permissive direction that conditions (a) and (b) cover, as they do today for both Self-Directed accounts. A residual theoretical hole remains (an account older than the window holding only securities, zero cash, whose first visible row is a deposit); accepted as negligible and caught by the Milestone 4 cross-check against the brokerage's own numbers.
  Date/Author: 2026-08-15 / Claude with Justin.

- Decision: The gate is evaluated fresh on every request, with no persisted state, accepting a rare one-day flicker: on a day the user trades and refreshes, Plaid's feed can lag the balance update, breaking condition (a) until the feed catches up, so the row temporarily downgrades from "lifetime" to "anchored".
  Rationale: Both modes make true statements, so the flicker degrades precision, never correctness — and it self-heals on the next refresh. The alternative (a migration adding a persisted "verified inception" stamp on `accounts`) buys robustness with a schema change and write-path coupling; adopt it as a follow-on only if the flicker proves annoying in practice.
  Date/Author: 2026-08-15 / Claude with Justin.

- Decision: External flows are matched on subtype alone: `subtype ∈ {transfer, deposit, withdrawal, contribution, distribution}`, any type. Corporate-action and option-mechanics subtypes (`split`, `spin off`, `merger`, `assignment`, `exercise`, `trade`) are never external flows.
  Rationale: The repo has been burned repeatedly by Plaid type drift (dividends arriving as `type = 'fee'`); subtype is the narrowest reliable field. The set is deliberately wider than the one shape production shows today (`transfer`), because a future institution may report `deposit`/`withdrawal`; the Milestone 4 verification re-runs the taxonomy query to catch drift.
  Date/Author: 2026-08-15 / Claude with Justin.

- Decision: Percent figures use net contributions as the base in lifetime mode, and anchor balance plus subsequent net contributions in anchored mode; when the base is zero or negative (withdrew more than deposited), the percent is null and the UI shows the dollar figure alone.
  Rationale: "What did the money I put in turn into" is the question being answered; a negative or zero base makes any percentage meaningless rather than merely awkward.
  Date/Author: 2026-08-15 / Claude with Justin.

- Decision (revision): Gate condition (a) measures cash from holdings rows, not from `accounts.available_balance` as this plan originally specified. A load-bearing validation pass (2026-08-16) falsified the original choice: Plaid documents `available` as nullable, cacheable, and meaning "available to withdraw" rather than "uninvested cash", and production showed a $0.09 drift on the Roth that would have silently blocked lifetime mode on day one, plus a $2,500 divergence on Chase ····6850. Holdings-derived cash reconciles the feed to exactly zero on both lifetime-complete accounts and is already synced in the same refresh pass as the feed. An account with holdings rows but no cash row counts as zero cash (genuinely all-invested); an account with no holdings rows at all fails the gate (nothing to reconcile against).
  Rationale: Build the gate on the quantity the feed itself moves (sweep transactions are buys/sells of the cash security) rather than on an institution-computed number with different semantics. Full evidence in `Surprises & Discoveries`.
  Date/Author: 2026-08-16 / Claude with Justin.

- Decision: Feed durability across re-links is confirmed and needs no lifecycle protection in this plan; Item-death fragmentation (a freshly re-linked institution getting new `account_id`s, stranding old history) is accepted as a residual risk because its failure mode under this feature is an honest downgrade to anchored mode, never a wrong lifetime figure. Revisit only if an Item actually dies.
  Rationale: Validation (2026-08-16) showed in-app re-auth is Link update mode with zero database writes, no per-institution unlink exists, and production has zero orphaned feed rows. Guarding against fragmentation would mean storing `persistent_account_id` and stitching histories — real scope, no current trigger.
  Date/Author: 2026-08-16 / Claude with Justin.

- Decision: No per-account XIRR, and no change to the existing portfolio attribution or unrealized sections. The new section sits above "Unrealized Gain by Account", which stays.
  Rationale: Minimum change that answers the user's question; unrealized-versus-basis remains a useful per-position lens. XIRR needs the same care the portfolio-level rate got (30-day minimum, clean windows) and can be a follow-on.
  Date/Author: 2026-08-15 / Claude with Justin.

## Outcomes & Retrospective

To be written at completion.

## Context and Orientation

OtterMint is a personal-finance Next.js app (App Router, TypeScript, Drizzle ORM over Postgres, Vitest, Tailwind, Recharts). Bank and brokerage data arrives via Plaid. All server database access goes through `withUser(userId, fn)` (`src/lib/db/with-user.ts`), which runs `fn` in a transaction with row-level security scoped to the user; API routes authenticate with `getUserId()` (`src/lib/auth/get-user-id.ts`) and log failures with `logServerError` (`src/lib/logging.ts`).

The Investments tab (`src/app/page.tsx`, destination `investments`) renders `InvestmentPerformancePanel` (`src/components/dashboard/InvestmentPerformancePanel.tsx`) above `HoldingsPanel`. The panel fetches `GET /api/analytics/investments?days=90` (`src/app/api/analytics/investments/route.ts`), whose response type `InvestmentsResponse` is exported from the route file and imported by the panel. All money travels API responses as strings; arithmetic is done in integer cents inside `src/lib/investment-performance.ts` (helpers `toCents`/`fromCents` there) and serialized with two decimals. That module is pure — no server imports — so both the route and tests feed it plain rows.

Four database tables matter here (schema in `src/lib/db/schema.ts`):

`accounts` — one row per linked account. Relevant columns: `accountId` (Plaid's id, text), `name`, `mask` (last-4 like "5111"), `type` (`investment` for brokerage accounts), `currentBalance` and `availableBalance` (numeric strings; for investment accounts `availableBalance` is the uninvested cash), `plaidItemId` referencing `plaid_items`.

`plaid_items` — one row per institution link. Relevant columns: `id`, `userId`, `createdAt` (timestamptz; when the institution was linked).

`investment_transactions` — in-account brokerage activity synced from Plaid's investments-transactions feed by `src/lib/sync-investment-transactions.ts`: buys, sells, dividends, interest, and external cash transfers. Sign convention (Plaid's): positive `amount` = cash debited from the account (a purchase, or money leaving), negative = cash credited (a sale, a dividend, or money arriving). The first sync backfills 24 months from the moment it runs; later syncs re-request from the last stored date minus 7 days and upsert on the unique transaction id. Columns used here: `accountId`, `date`, `amount`, `type`, `subtype`. Production currently holds four accounts' activity in exactly eight `type|subtype` shapes (see `Surprises & Discoveries`).

`account_balance_snapshots` — one row per account per day, captured on refresh/link by `src/lib/capture-snapshots.ts` (last write of the day wins), with `accountId`, `date`, `balance`, and a copied `type`. Capture began 2026-08-15, so per-account balance history accrues forward from that date and cannot be reconstructed backward.

Terms used below. "Net contributions" = external money deposited into the account minus external money withdrawn, both taken from `investment_transactions` rows whose subtype marks an external flow; in Plaid's sign convention that is the negated sum of those rows' amounts. "True net gain" (or just net gain) = current balance minus net contributions over a stated window; by accounting identity it equals realized gains + unrealized gains + dividends + interest − fees over that window. "Cash residual" = the account's live `availableBalance` plus the raw sum of every stored feed amount for the account; zero means every cent of cash movement is accounted for. "Anchor" = the account's earliest `account_balance_snapshots` row, used as the measurement start when lifetime history is unavailable.

## Plan of Work

Milestone 0 (done — evidence above) established feasibility directly against production: the feed carries account-attributed external transfers, reconciles to the cent for in-window accounts, and cleanly identifies the truncated ones.

Milestone 1 adds the pure math. In `src/lib/investment-performance.ts`, add the types and function specified in `Interfaces and Dependencies`: `computeAccountNetGains(feedRows, accountRows, holdingRows, snapshotRows, today)`. The function groups feed rows by account; classifies external flows by subtype (`transfer`, `deposit`, `withdrawal`, `contribution`, `distribution` — lowercase compare; everything else, including `split`, is internal); computes contributions (external rows with negative amounts, negated) and withdrawals (external rows with positive amounts) in cents; evaluates the three-condition lifetime gate from the Decision Log (cash residual exactly zero, where cash is the summed `value` of the account's holdings rows satisfying the module's existing `isCashPosition` predicate, the account must have at least one holdings row, and the residual is that cash in cents plus the raw cents sum of every feed amount; earliest row — ties broken by lowest amount treated as arbitrary, use the first after a stable sort by date — is external with negative amount; earliest row's date at least 7 days after `itemCreatedAt` minus 24 calendar months, computed with the same UTC date arithmetic the module already uses). In lifetime mode: gain = current balance − net contributions, percent base = net contributions. In anchored mode (an anchor snapshot exists): gain = balance − anchor balance − net contributions dated strictly after the anchor date, percent base = anchor balance + those post-anchor net contributions, and the reported `contributions`/`withdrawals` strings are the post-anchor amounts with `startDate` = anchor date. With no snapshot and no verified lifetime: mode `none`, gain and percent null, contributions reported over the full feed. When the percent base is zero or negative the percent is null in any mode. The function also builds two series per account for the chart: `contributionSeries`, the running cumulative net contribution after each external flow in the covered window (starting from zero at `startDate` in anchored mode), with a final point at `today` carrying the ending cumulative value so the step line extends to now; and `balanceSeries`, the account's snapshots in the covered window plus a final point at `today` holding the live balance (replacing a same-date snapshot point if one exists). Accounts are returned sorted by balance descending. Null `currentBalance` rows are skipped entirely — no balance means nothing to report.

Milestone 2 extends the API. In `src/app/api/analytics/investments/route.ts`, inside the existing `withUser` block, add three queries: all `investment_transactions` rows for the user (`accountId`, `date`, `amount`, `type`, `subtype`; no date filter — the table holds at most 24 months plus accrual by construction, and lifetime is the point, so the route's `days` parameter deliberately does not apply); investment accounts joined to `plaid_items` (`accountId`, `name`, `mask`, `currentBalance`, and `plaid_items.createdAt` serialized to a `YYYY-MM-DD` string); and all `account_balance_snapshots` rows with `type = 'investment'` for the user without the `since` filter (the existing windowed query stays for the portfolio chart; this separate unwindowed one exists because the anchor must be the earliest snapshot ever, which the windowed query would eventually exclude as history accrues). The holdings rows the route already fetches for `computeUnrealized` are reused as the cash source. Feed all four row sets into `computeAccountNetGains` with today's date and add the result to the response as `accountReturns: AccountNetGain[]`, extending the exported `InvestmentsResponse` type.

Milestone 3 adds the UI. In `src/components/dashboard/InvestmentPerformancePanel.tsx`, add a "Net Gain by Account" section between the Allocation section and "Unrealized Gain by Account", rendered when `accountReturns` is non-empty. Each account renders: a header line with the account name and mask, the net contributions and current balance as muted mono figures, and the gain on the right — green/red mono `+$X · +Y%` like the unrealized rows, or the dollar figure alone when the percent is null, or a muted em-dash when gain is null; a sublabel under the name stating the window: "lifetime · since <formatted startDate>" for lifetime mode, "since <formatted startDate> — earlier history not visible to OtterMint" for anchored, "gain not yet measurable" for none; and, when either series has at least two points, a small Recharts `LineChart` (about 110px tall, same axis/tooltip styling as the existing portfolio chart) with the contribution series as a purple (`var(--accent-purple)`) `stepAfter` line and the balance series as a blue (`var(--accent-blue)`) line, sharing a time X-axis built the way `buildChartModel` builds one (a per-account merged-row map is enough; do not reuse `buildChartModel` itself, which is portfolio-shaped). Close the section with a one-line muted footnote: "Net gain = balance − money put in; includes realized and unrealized gains, dividends, and interest." Extend the `EMPTY` fixture in the panel with `accountReturns: []`.

Milestone 4 is rollout and verification. There is no migration — every input table already exists in production — so deployment is the standard app deploy. After deploy and a refresh, verify the numbers against the evidence in this plan and against the brokerage's own app.

## Concrete Steps

All commands run from the repository root.

Milestone 1: implement `computeAccountNetGains` and its types in `src/lib/investment-performance.ts`, then add tests to `src/__tests__/investment-performance.test.ts` following that file's existing fixture style (plain row objects, string money). Cover at minimum: a production-shaped lifetime account (deposits summing 35,000.00, buys/sells/interest netting the cash to the live available balance, balance 47,514.67 → gain "12514.67", pct "35.8", mode "lifetime"); a truncated account (non-zero residual → anchored, gain = balance − anchor − post-anchor flows); a first-row-is-a-buy account (residual zero but gate fails → anchored); a margin violation (first deposit 3 days after `itemCreatedAt` − 24 months → anchored); withdrawal netting (deposit 10,000, withdrawal 4,000 → net contributions "6000.00"); negative net contributions → `gainPct` null; `transfer|split` and `cash|dividend` rows excluded from flows and from the contribution series; no snapshots and unverified → mode "none" with null gain; the `today` extension points on both series, including same-date snapshot replacement; sort order by balance descending. Run:

    npm test

and expect all suites green (the file currently holds 20 passing tests; these add roughly ten more).

Milestone 2: extend the route and `InvestmentsResponse`, then extend `src/__tests__/investments-route.test.ts` (hoisted-mock pattern already in that file): the fixture DB returns feed, account-info, and unwindowed snapshot rows, and the response's `accountReturns` carries the expected lifetime and anchored entries; a user with no investment accounts yields `accountReturns: []`. Run `npm test` again.

Milestone 3: extend the panel and `src/__tests__/investment-performance-panel.test.tsx` (fetch-mock pattern already there): the section title renders with a fixture `accountReturns`; a lifetime row shows the gain and "lifetime"; an anchored row shows the "since" wording; a null-gain row shows the em-dash; the `EMPTY` payload renders no section. Then the full gate:

    npm test
    npm run lint
    npx tsc --noEmit
    npm run build

expecting all tests green, no new lint findings, a clean type check, and a successful build.

Milestone 4: merge to `main`, push, and deploy from the repository root with `scripts/deploy.sh` (it fast-forwards the NAS checkout, rebuilds the app container via Dockhand, and probes `/api/health`; see `docs/DEPLOYMENT.md`). Then refresh accounts in the app (note: a refresh within 2 hours of the previous one skips every Plaid item) and verify per `Validation and Acceptance`.

## Validation and Acceptance

Unit and route tests as listed per milestone; `npm test` green throughout, and the new tests fail before their milestone's implementation and pass after.

Behavioral acceptance, against production data as of 2026-08-15 (later dates will differ as prices and contributions move — reconcile with the queries below rather than expecting these exact figures): open the Investments tab. A "Net Gain by Account" section appears above "Unrealized Gain by Account" with four rows. Individual ····5111 reads net contributions $35,000.00, balance $47,514.67, gain about +$12,514.67 · +35.8%, labeled lifetime since Apr 22, 2026, with a chart whose purple step line climbs 3,000 → 35,000 over Apr–Jun 2026 and whose blue line starts Aug 15, 2026. Roth ····6093 reads contributions $17,500.14 against a balance near $12,449.31, a loss around −$5,050.83 · −28.9%, lifetime since Mar 21, 2025. Both Self-Directed rows are labeled "since Aug 15, 2026" (anchored) and show small gains or losses equal to their balance movement since that snapshot, since neither has any external flow in the feed.

Cross-check against the source of truth: in the brokerage's own app, the Individual account's lifetime total gain should match the panel's figure to within normal intraday drift. This is the check that would expose the gate's residual theoretical hole (pre-existing securities invisible to the cash residual).

Reconciliation queries, run from any machine with NAS access (read-only; also the drift check to re-run whenever a new institution is linked):

    ssh otterholt 'docker exec -i ottermint-db-1 psql -U postgres -d ottermint' <<'SQL'
    SELECT a.name, a.mask, -sum(it.amount) AS implied_cash,
           (SELECT sum(h.value) FROM holdings h
             WHERE h.account_id = a.account_id
               AND (h.is_cash_equivalent OR h.security_type = 'cash')) AS holdings_cash,
           (SELECT coalesce(sum(h.value), 0) FROM holdings h
             WHERE h.account_id = a.account_id
               AND (h.is_cash_equivalent OR h.security_type = 'cash')) + sum(it.amount) AS residual
    FROM investment_transactions it JOIN accounts a ON a.account_id = it.account_id
    GROUP BY 1,2,a.account_id ORDER BY 1;
    SELECT it.type, it.subtype, count(*) FROM investment_transactions it GROUP BY 1,2 ORDER BY 3 DESC;
    SQL

Expected today: residual 0.00 for Individual ····5111 and Roth ····6093; large positive residuals for the Self-Directed pair; no external-flow-like subtype outside the plan's set. (`available_balance` is deliberately absent from this check — it was falsified as a cash source; see the Decision Log.)

## Idempotence and Recovery

Every step is additive and repeatable: the math is a pure function, the route change adds read-only queries inside the existing user-scoped transaction, and the UI change renders a new section from response data. There is no migration and no write path. Re-running tests, rebuilds, or deploys causes no drift. If the deploy fails mid-way, `scripts/deploy.sh` builds before swapping containers, so production keeps running the previous image; fix and re-run. Rolling back is an ordinary redeploy of the prior commit.

## Artifacts and Notes

The Milestone 0 production evidence (2026-08-15), condensed. Taxonomy and totals per account:

    name                  | mask | type     | subtype  | n   | total      | first      | last
    Individual            | 5111 | sell     | sell     |  35 | -304078.96 | 2026-05-01 | 2026-08-05
    Individual            | 5111 | buy      | buy      |  28 |  327761.18 | 2026-04-28 | 2026-08-10
    Individual            | 5111 | transfer | transfer |   8 |  -35000.00 | 2026-04-22 | 2026-06-03
    Individual            | 5111 | cash     | interest |   2 |      -0.39 | 2026-06-29 | 2026-07-30
    Roth Contributory IRA | 6093 | transfer | transfer |   5 |  -17500.14 | 2025-03-21 | 2026-04-22
    Self-Directed         | 6850 | transfer | split    |   2 |       0.00 | 2024-10-11 | 2026-07-02
    (Self-Directed accounts: buys/sells/dividends/interest only — zero external transfers in window)

Cash reconciliation (the load-bearing proof):

    name                  | mask | implied_cash | available_balance | residual
    Individual            | 5111 |     11318.17 |          11318.17 |      0.00
    Roth Contributory IRA | 6093 |      2261.81 |           2261.81 |      0.00
    Self-Directed         | 6850 |   -170500.24 |           4649.72 | 175149.96
    Self-Directed         | 6940 |     -1705.02 |            600.51 |   2305.53

Arithmetic for the headline acceptance figures: Individual 47,514.67 − 35,000.00 = +12,514.67 (+35.76% of 35,000); Roth 12,449.31 − 17,500.14 = −5,050.83 (−28.86% of 17,500.14). The Individual deposit dates and amounts, for the chart's step line: 04-22 3,000; 04-30 2,000; 05-06 2,000; 05-11 2,500; 05-18 2,000; 06-02 2,000 and 1,500; 06-03 20,000.

## Interfaces and Dependencies

No new libraries. In `src/lib/investment-performance.ts` (pure, no server imports), define and export:

    export interface AccountFeedRow {
      accountId: string;
      date: string;              // YYYY-MM-DD
      amount: string;            // Plaid sign: positive = cash out of the account
      type: string;
      subtype: string | null;
    }

    export interface AccountInfoRow {
      accountId: string;
      name: string;
      mask: string | null;
      currentBalance: string | null;
      itemCreatedAt: string;            // YYYY-MM-DD of plaid_items.created_at
    }

    export interface AccountNetGain {
      accountId: string;
      name: string;
      mask: string | null;
      mode: "lifetime" | "anchored" | "none";
      startDate: string | null;         // inception (lifetime) or anchor date; null for none
      contributions: string;            // window-scoped, positive magnitude
      withdrawals: string;              // window-scoped, positive magnitude
      netContributions: string;         // contributions − withdrawals (may be negative)
      balance: string;                  // live currentBalance
      gain: string | null;              // null when mode is none
      gainPct: string | null;           // null when base ≤ 0 or mode is none
      contributionSeries: Array<{ date: string; cumulative: string }>;
      balanceSeries: Array<{ date: string; value: string }>;
    }

    export function computeAccountNetGains(
      feedRows: AccountFeedRow[],
      accountRows: AccountInfoRow[],
      holdingRows: HoldingRowInput[],      // existing exported type; cash source for the gate
      snapshotRows: AccountSnapshotRow[],  // existing exported type in this module
      today: string
    ): AccountNetGain[];

`src/app/api/analytics/investments/route.ts` extends `InvestmentsResponse` with `accountReturns: AccountNetGain[]` and supplies the row sets described in the Plan of Work (reusing its existing holdings query for the cash source). `src/components/dashboard/InvestmentPerformancePanel.tsx` consumes `accountReturns` and renders the section; its `EMPTY` constant gains `accountReturns: []`.

---

Revision note (2026-08-16): Before implementation began, a load-bearing validation pass tested this plan's two unproven assumptions. It falsified the original cash source for gate condition (a) — `accounts.available_balance` — on both documentary and empirical grounds, and the plan was revised throughout (Decision Log, Plan of Work, Interfaces, Validation) to use holdings-derived cash instead. The same pass confirmed feed durability across re-links (in-app re-auth is Link update mode with no database writes) and recorded Item-death fragmentation as an accepted residual risk. Nothing else in the design changed.
