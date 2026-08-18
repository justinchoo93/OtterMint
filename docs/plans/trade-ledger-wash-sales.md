# Trade ledger with adjusted cost basis, cross-account wash sales, and Form 8949 export

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `docs/PLANS.md` from the repository root. A contributor should be able to implement and verify the feature with only this file and the current working tree.

## Purpose / Big Picture

Justin actively trades stocks, ETFs, and options across four brokerage accounts — two Chase Self-Directed taxable accounts, a Schwab Individual taxable account, and a Schwab Roth IRA — and has traded the same underlying tickers across them without tracking wash sales. A wash sale (defined fully in Context and Orientation) disallows a realized loss when a substantially identical security is bought within 30 days before or after the loss sale, and the rule applies across all of a taxpayer's accounts. Brokers only report wash sales that happen inside one account with the identical security, so cross-brokerage wash sales appear on no 1099-B; the taxpayer must find and report them. Today OtterMint stores every trade (Plaid's investment-transaction feed, synced since 2026-08-15 with a 24-month backfill) but computes nothing from them.

After this work, a new Taxes view in the dashboard shows, computed deterministically from the stored trade feed: a per-security tax-lot ledger with adjusted cost basis; every realized gain and loss for the current year, split short-term versus long-term; every wash sale detected across all four accounts, including the deferred loss added to the replacement lot's basis and — the worst case — losses permanently destroyed because the replacement purchase happened inside the Roth IRA; review flags for gray areas the law does not settle (same-underlying options with different terms, single-stock leveraged ETFs versus their underlying); and a downloadable Form 8949-format CSV — the per-sale schedule (description, dates, proceeds, basis, wash-sale code W with the adjustment amount, gain, short- versus long-term) that tax platforms like TurboTax consume, either by import or as the statement behind summary totals. A reconciliation check compares the ledger's computed share counts to Plaid's live holdings so the user can see exactly where the ledger is trustworthy and where it needs seeded opening lots.

A human can demonstrate the result: open the Taxes view, see YTD short-term and long-term realized totals with a wash-sale-disallowed amount, click a flagged wash sale and see the loss, the replacement purchase (naming both accounts), and the adjusted basis on the replacement lot; download the Form 8949 CSV and confirm a washed row carries code W, the disallowed amount in the adjustment column, and a gain column equal to proceeds minus basis plus adjustment; and confirm the reconciliation table shows zero share-count mismatch for both Schwab accounts.

## Progress

- [x] (2026-08-18 19:30Z) Research complete: codebase survey (existing `investment_transactions` feed, RLS/migration/test conventions, feature anatomy), IRS rules verified (Pub 550, Rev. Rul. 2008-5, 1099-B instructions), 2026 rates (Rev. Proc. 2025-32), Schwab/Chase CSV formats, Plaid investments field coverage, prior-art lot engines (adlr/wash-sale-calculator, bbreslauer/wash-sale-tracker). Plan written.
- [ ] Milestone 0: production feasibility probe (SQL evidence recorded in Artifacts and Notes).
- [ ] Milestone 1: schema — `securities`, `opening_lots`, `investment_transactions.fees`; sync persists securities and fees; one-time full-window resync; exchange-token initial investment sync.
- [ ] Milestone 2: engine part 1 — normalized trade events, lot building, realized gains, holdings reconciliation (`src/lib/tax-lots.ts`).
- [x] (2026-08-18 20:10Z) Revision: dropped the tax estimator; the filing deliverable is now a Form 8949-format CSV export (see Decision Log revision and the note at the bottom).
- [ ] Milestone 3: engine part 2 — cross-account wash-sale pass, review flags, provisional-window handling, Form 8949 row builder.
- [ ] Milestone 4: API — `GET /api/analytics/taxes`, the 8949 CSV export route, opening-lot CRUD routes.
- [ ] Milestone 5: UI — Taxes navigation destination and `TaxLedgerPanel`.
- [ ] Milestone 6: production rollout (migration per DEPLOYMENT.md §5.5, deploy, forced resync, verification queries recorded here).
- [ ] Milestone 7 (optional, separately deployable): CSV import for broker reconciliation and pre-window Chase lots.

## Surprises & Discoveries

Pre-seeded from research; add implementation discoveries below.

- Observation: The trade data largely already exists. `investment_transactions` holds a 24-month backfill (2024-08-15 → present, 794 rows at backfill time) for all four accounts, with signed `quantity`, `price`, and `amount`. No CSV download is needed for YTD coverage.
  Evidence: `docs/plans/investment-performance.md` Milestone 6 completion notes; production row counts recorded there.

- Observation: `security_id` is a bare string with no securities table — a security fully sold before 2026-08-15 (when holding snapshots began) has no ticker stored anywhere, and tickers are the only way to match "substantially identical" across accounts. Plaid returns a `securities[]` array on every `investmentsTransactionsGet` response that `src/lib/sync-investment-transactions.ts` currently discards.
  Evidence: `src/lib/db/schema.ts` (no securities table); `sync-investment-transactions.ts` reads only `response.data.investment_transactions`.

- Observation: Plaid's `fees` field exists on every investment transaction but is not persisted. Because later syncs upsert on `investment_transaction_id`, a one-time full-window resync after adding the column will backfill fees into existing rows.
  Evidence: `node_modules/plaid/dist/api.d.ts` (`InvestmentTransaction.fees`); the upsert in `sync-investment-transactions.ts`.

- Observation: The two Chase accounts have truncated history — their first stored rows sit exactly at the 24-month window edge (2024-08-15) and are buys, not deposits, with large unexplained cash residuals (+$172,649.96 and +$2,305.53). Both Schwab accounts are lifetime-complete (residual $0.00). Lots opened at Chase before 2024-08-15 cannot be derived from the feed and need user-seeded opening lots.
  Evidence: `docs/plans/account-net-gain.md` per-account residual table.

- Observation: Production feed taxonomy is exactly eight `type|subtype` shapes: `buy|buy`, `sell|sell`, `transfer|transfer`, `transfer|split`, `cash|interest`, `cash|dividend`, `fee|dividend`, `fee|interest` — and 111 of 119 dividends arrive as `type='fee'`. The repo's standing lesson (three plans running): match on `subtype`, never on `type` or name heuristics, and treat every taxonomy list as non-exhaustive.
  Evidence: `docs/plans/account-net-gain.md` production `GROUP BY type, subtype`.

- Observation: Rev. Rul. 2008-5 makes an IRA (explicitly including Roth) replacement purchase the worst wash-sale outcome: the loss is disallowed AND the basis adjustment is lost forever — the loss is destroyed, not deferred. The Roth is identifiable via `accounts.subtype`.
  Evidence: Rev. Rul. 2008-5 (irs.gov/pub/irs-drop/rr-08-05.pdf); IRS Pub 550 Wash Sales section.

- Observation: Brokers report wash sales on 1099-B only for identical-CUSIP legs inside the same account (Form 1099-B instructions), so nothing this feature detects across accounts will ever be pre-computed by Chase or Schwab — and same-account wash sales the brokers DO adjust must not be double-counted when comparing to broker statements.
  Evidence: Instructions for Form 1099-B, "wash sales" reporting scope.

## Decision Log

- Decision: The Plaid `investment_transactions` feed is the primary trade source; CSV import is a later, optional reconciliation milestone (M7), not the ingestion path.
  Rationale: YTD data for all four accounts is already in the database and syncs on every refresh; a CSV pipeline would duplicate it. CSV still matters for verifying the engine against broker records, recovering pre-window Chase history, and capturing anything Plaid drops — but as a check, not the source of truth. The Chase CSV header format is publicly undocumented, so its parser cannot be specified until Justin captures a real export (M7 prerequisite).
  Date/Author: 2026-08-18 / Claude + Justin

- Decision: The ledger is computed, not stored. Lots, realized gains, wash-sale adjustments, and adjusted basis are recomputed on demand by a pure function over raw tables (`investment_transactions`, `securities`, `opening_lots`, `accounts`); the only new user data at rest is seeded opening lots.
  Rationale: A stored ledger must be invalidated every time a sync backfills or corrects a row, and every correction bug becomes a data-corruption bug. Deterministic recompute from raw rows is idempotent, testable with plain fixtures, and matches the repo's read-time-correction precedent (`category-rules`). At production scale (~1–2k trade rows) recompute is milliseconds.
  Date/Author: 2026-08-18 / Claude + Justin

- Decision: Lot matching is FIFO (first-in, first-out) within each account, and wash-sale replacement matching is earliest-purchase-first, one share absorbing at most one disallowed loss.
  Rationale: FIFO is both brokers' default disposal method (neither account uses specific-lot election today), and Pub 550's "more or less stock bought than sold" section prescribes earliest-first matching for replacements. If Justin ever elects specific lots at a broker, that becomes a new decision here.
  Date/Author: 2026-08-18 / Claude + Justin

- Decision: Substantially-identical policy has three tiers. Auto-match: the same security across any accounts (same `security_id`, or same CUSIP/ticker when ids differ between institutions), and — statutory — a loss on a stock followed by acquiring a call option on that same underlying inside the window. Warn (flag for review, no automatic adjustment): options on the same underlying with different strike or expiry; a single-stock leveraged ETF (e.g. MUU, the Direxion 2X MU fund) versus its underlying stock or versus another issuer's fund on the same underlying. Ignore: everything else.
  Rationale: The auto tier is settled law (§1091 text covers "a contract or option to acquire"). The warn tier is genuinely unregulated — Treasury has never defined substantially identical for differing option terms, and practitioner consensus holds a daily-reset leveraged fund is a different security from a different issuer — so silently taxing them would invent law, and silently ignoring them would hide risk. Flags with the dollar amount at stake let Justin decide with his tax preparer.
  Date/Author: 2026-08-18 / Claude + Justin

- Decision: A replacement purchase in the Roth IRA disallows the loss permanently: no basis adjustment anywhere, and the UI reports these losses in their own "permanently lost" figure, visually distinct from deferred wash sales.
  Rationale: Rev. Rul. 2008-5. This is also the single most actionable output of the feature — it tells Justin to stop rebuying taxable-account losers inside the Roth within the window.
  Date/Author: 2026-08-18 / Claude + Justin

- Decision: Options exercise and assignment events are flagged for manual review, not automatically folded into stock basis, in v1. Expiration is handled (a disposition at zero proceeds).
  Rationale: Production has never emitted an exercise/assignment row (eight known shapes, none of them), so there is no real data to build against; the basis-folding rules (premium adjusts the stock's basis or proceeds) are mechanical but untestable without a real row shape. Flag loudly, implement when one appears.
  Date/Author: 2026-08-18 / Claude + Justin

- Decision: Tax estimation is federal-only, uses hardcoded 2026 constants (Rev. Proc. 2025-32), and takes filing status and "taxable ordinary income excluding trades" as user inputs on the panel. (Superseded 2026-08-18 — see the revision entry below.)
  Rationale: The app knows nothing about wages, deductions, or state residency, and should not grow a tax-profile table for two scalars.
  Date/Author: 2026-08-18 / Claude + Justin

- Decision (revision): Drop the tax estimator entirely. The filing deliverable is a Form 8949-format CSV export — one row per realized disposition with description, date acquired, date sold, proceeds, cost basis, code `W` and the disallowed adjustment amount on washed rows, and the resulting gain, grouped short-term (Part I) versus long-term (Part II) — downloadable from the Taxes view for handoff to a tax platform (TurboTax and peers accept this per-sale schedule via import or as the statement behind summary totals).
  Rationale: Justin's actual need is feeding a tax-reporting platform, and any platform recomputes the tax itself from full income data it has and OtterMint never will — an in-app estimate duplicates that work with strictly less information, plus a rate table to maintain every year. The hard, valuable part (adjusted basis and cross-account wash detection, which no broker 1099-B and no platform import will do across brokerages) is unchanged; the export is where that value leaves the app. Bracket constants, filing-status/income inputs, NIIT, and the netting/$3,000-cap logic all leave the plan with it — netting is Schedule D's job, done by the platform.
  Date/Author: 2026-08-18 / Claude + Justin (Justin's call, replacing the estimator)

- Decision: Section 1256 contracts (broad-based index options like SPX/NDX/XSP, taxed 60/40 and exempt from wash sales) are out of scope; if such a ticker ever appears it is flagged as unsupported rather than mis-taxed as an equity option.
  Rationale: Justin trades equity and single-stock-ETF options, which are ordinary ST/LT capital assets. Building mark-to-market 60/40 treatment for instruments he does not hold is speculative code.
  Date/Author: 2026-08-18 / Claude + Justin

- Decision: Dispositions whose 30-day forward window extends past the newest synced data are marked provisional in the ledger and the YTD totals.
  Rationale: A loss taken 20 days ago can still be washed by a purchase 10 days from now; presenting it as final would be invented certainty. Same honesty rule as the coverage-aware net-worth chart: label what is not yet knowable.
  Date/Author: 2026-08-18 / Claude + Justin

## Outcomes & Retrospective

(To be written at milestone completions.)

## Context and Orientation

OtterMint is a Next.js 16 (App Router) personal-finance app; server and UI code live in `src/`. Data comes from Plaid (a bank/brokerage data aggregator) into PostgreSQL 17 via Drizzle ORM — schema in `src/lib/db/schema.ts`, journaled SQL migrations in `drizzle/`. Every API route authenticates via `getUserId()` (`src/lib/auth/get-user-id.ts`) and does database work inside `withUser(userId, tx => ...)` (`src/lib/db/with-user.ts`), which opens a transaction and sets the row-level-security context (`app.current_user_id`). Row Level Security (RLS) means PostgreSQL policies hide one user's rows from another at the database layer; every user-owned table needs `GRANT`s to `app_user`, `ENABLE`/`FORCE ROW LEVEL SECURITY`, and an isolation policy comparing `user_id` to `app_current_user_id()` — these are hand-appended to generated migrations (copy the structure of `drizzle/0012_ancient_invisible_woman.sql`). Never run `npm run db:push`; it silently destroys RLS (banner at the top of `schema.ts`). The dev machine has no reachable database: all tests mock I/O, and production migrations are applied by hand on the OtterHolt NAS per `docs/DEPLOYMENT.md` §5.5 (statements plus a `drizzle.__drizzle_migrations` journal row in one psql transaction inside the `ottermint-db-1` container), always before deploying app code that reads the new columns. Deploys run `scripts/deploy.sh`. There are no Plaid investment webhooks in use; data changes on manual refresh (`POST /api/accounts/refresh`), which skips items refreshed within the last 2 hours — production verification must clear `accounts.last_refreshed_at` or wait out the gate.

The trade feed: `investment_transactions` (in `schema.ts`) stores Plaid investment transactions per user and account — `investmentTransactionId` (unique, the upsert key), `securityId` (nullable text; no securities table exists yet), `date`, `name`, `amount` numeric(14,2), `type`, `subtype`, `quantity` numeric(18,8), `price` numeric(12,4). Plaid's sign conventions, used verbatim in the table: `quantity` is positive on buys and negative on sells; `amount` is the opposite-signed cash effect (positive = cash left the account, so buys are positive amounts). `src/lib/sync-investment-transactions.ts` pages through Plaid's `investmentsTransactionsGet` (offset pagination, 500/page), backfilling 24 months on first sync and re-requesting from `max(date) − 7 days` afterwards, upserting on the Plaid id. It is called from the refresh route for investment accounts, best-effort (a failure cannot fail a refresh). Production reality: exactly eight `type|subtype` shapes so far (`buy|buy`, `sell|sell`, `transfer|transfer`, `transfer|split`, `cash|interest`, `cash|dividend`, `fee|dividend`, `fee|interest`); the four accounts are two Chase Self-Directed (masks 6850, 6940 — history truncated at the 2024-08-15 window edge, so pre-window positions have no derivable basis) and Schwab Individual 5111 and Roth IRA 6093 (both lifetime-complete). Current positions live in `holdings` (delete-and-reinsert per refresh; has `tickerSymbol`, `quantity`, `costBasis` (nullable, aggregate not per-lot), `securityType`, `isCashEquivalent`) and daily `holding_snapshots` since 2026-08-15.

Feature anatomy in this repo (copy it): a pure, I/O-free math module in `src/lib/` doing all arithmetic in integer cents with money entering and leaving as strings; an API route under `src/app/api/analytics/` that queries inside one `withUser` and feeds rows to the pure module, exporting its response type; a client panel component in `src/components/dashboard/` fetching that route; a navigation destination in `src/app/page.tsx` (`NAV_ITEMS` array + `renderContent()`). Tests live flat in `src/__tests__/`: pure-module tests use plain row fixtures with hand-computed expectations in comments; route tests are `// @vitest-environment node` with `vi.hoisted` mocks and a `mockQueue` resolving `select()` chains in the route's exact query order (append new queries after existing ones to keep older mocks valid); component tests mock `fetch`. The verification gate is `npm test` (356 passed / 41 skipped today), `npm run lint` (one known pre-existing warning), `npx tsc --noEmit`, `npm run build` (needs dummy `PLAID_ENV`/`PLAID_CLIENT_ID`/`PLAID_SECRET`/`ENCRYPTION_KEY` locally).

Tax terms used throughout, in plain language. A tax lot is a parcel of shares acquired together (date, quantity, total cost); selling matches sale shares against lots to compute realized gain (proceeds minus the matched lots' basis). Basis is what you paid; adjusted basis is basis after corrections such as wash-sale additions. Holding period decides short-term (held one year or less, taxed as ordinary income) versus long-term (over one year, preferential rates). A wash sale (IRC §1091, IRS Pub 550): if you sell stock or securities at a loss and within 30 days before or after the sale (a 61-day window counting the sale date) you buy substantially identical stock or securities, acquire a contract or option to buy them, or acquire them for your IRA or Roth IRA, the loss is disallowed. The disallowed loss is added to the basis of the replacement shares (deferral) and the old holding period tacks onto the replacement — except when the replacement sits in an IRA/Roth IRA, where Rev. Rul. 2008-5 denies the basis adjustment entirely and the loss is permanently gone. Wash sales apply only to losses; gains are always recognized. When fewer replacement shares than loss shares are bought, only the proportional part of the loss is disallowed, matched share-for-share, earliest replacement purchases first, and a replacement share can absorb only one disallowed loss. The shares disposed of in the loss sale are not their own replacements. Options: equity options (on single stocks or ETFs) are ordinary capital assets; a loss on shares followed by buying a call on the same underlying within the window is statutorily a wash sale; whether two options with different strikes or expirations are "substantially identical" is undefined by Treasury (this plan warns, never auto-adjusts); an option expiring worthless is a disposition at zero proceeds on the expiration date. Whether a single-stock leveraged ETF (a fund from another issuer that delivers a daily-reset multiple of one stock's return, e.g. MUU for MU) is substantially identical to its underlying has no IRS authority; practitioner consensus says no; this plan warns. Form 8949 is the IRS schedule listing every capital-asset sale for the year — Part I short-term, Part II long-term — with columns (a) description, (b) date acquired, (c) date sold, (d) proceeds, (e) cost basis, (f) adjustment codes, (g) adjustment amount, (h) gain or loss, where h = d − e + g; a wash sale carries code `W` in (f) and the disallowed loss as a positive amount in (g). Tax platforms (TurboTax and peers) consume exactly this row shape, and it is this plan's filing deliverable; the platform computes the tax itself from it.

## Plan of Work

### Milestone 0 — Production feasibility probe

Goal: ground the engine in real data before any code, per house convention. Over `ssh otterholt`, run read-only SQL inside `ottermint-db-1` and record results in Artifacts and Notes: (1) 2026 YTD `buy|buy` and `sell|sell` counts and gross amounts per account; (2) distinct `security_id`s appearing in trades versus those present in `holdings`/`holding_snapshots` (how many traded securities currently have no ticker anywhere — the securities-table gap, and whether any 2026 sells are affected); (3) the four derivative holdings' `ticker_symbol` format (do Plaid option tickers carry OCC-style underlying/strike/expiry text we could parse as a fallback?); (4) all `transfer|split` rows (which securities, what quantity shapes — this defines split handling); (5) per security per account: `sum(quantity)` from the feed versus current `holdings.quantity` — the mismatch list is exactly the set of positions needing seeded opening lots (expect Chase mismatches, Schwab zeros); (6) any rows with null `quantity` or `price` among buys/sells. Acceptance: the numbered evidence block exists below and any surprises are logged with follow-on decisions.

### Milestone 1 — Schema and sync: securities, fees, opening lots

Goal: three additive schema changes in one migration (`drizzle/0014_*.sql`), sync persisting what Plaid already sends, and the historical fees recovered.

In `src/lib/db/schema.ts` add, following existing column idioms: `securities` — id serial PK; `userId` uuid FK cascade; `securityId` text not null (Plaid's id); `tickerSymbol` text; `cusip` text; `name` text; `type` text; `subtype` text; `isCashEquivalent` boolean; `optionUnderlyingTicker` text; `optionContractType` text (call/put); `optionStrikePrice` numeric(12,4); `optionExpirationDate` date; `updatedAt` timestamptz; unique on `(userId, securityId)` (Plaid ids are global, two users can hold the same one); index on `(userId, tickerSymbol)`. `opening_lots` — id serial PK; `userId`; `accountId` text FK to `accounts.accountId` cascade; `securityId` text not null; `acquiredDate` date not null; `quantity` numeric(18,8) not null; `costBasisTotal` numeric(14,2) not null; `note` text; `createdAt`. And on `investmentTransactions`: `fees` numeric(14,2) nullable. Generate with `npm run db:generate`, then hand-append the full RLS block for both new tables (grants on table and sequence, enable/force RLS, isolation policy `USING (user_id = app_current_user_id()) WITH CHECK (...)`), copying `0012_ancient_invisible_woman.sql` verbatim in structure.

In `src/lib/sync-investment-transactions.ts`: persist `fees` in the upsert (insert and update sets), and after paging, upsert every entry of the accumulated `response.data.securities` arrays into `securities` on `(userId, securityId)` — ticker, cusip, name, type, subtype, is_cash_equivalent, and the four `option_contract` fields when present (Plaid: `contract_type`, `expiration_date`, `strike_price`, `underlying_security_ticker`; nullable per institution). Do the same securities upsert in `src/lib/sync-holdings.ts` from `investmentsHoldingsGet`'s `securities[]` (holdings responses carry them too, and this covers securities that stopped trading). Fix the known linking gap: `src/app/api/plaid/exchange-token/route.ts` runs `syncTransactions` and `syncHoldings` but not `syncInvestmentTransactions` — add it, same best-effort wrapping. Finally, historical fees: because later syncs only re-request 7 days back, add a one-time full-window path — `syncInvestmentTransactions` gains a `fullWindow?: boolean` option that re-requests the whole 24 months (the upsert makes this idempotent), and the refresh route passes it exactly once via a temporary env-guarded branch or, simpler, we trigger it in production by clearing each item's stored max — the concrete mechanism is decided in implementation and recorded here; the acceptance is that post-deploy, historical rows carry fees.

Tests: extend `src/__tests__/sync-investment-transactions.test.ts` (hoisted-mock pattern) — securities upserted from the response, fees persisted, full-window flag requests from the 24-month edge; extend the RLS isolation suite (`src/__tests__/rls-isolation.test.ts`) with both new tables and bump its migration-range comment. Acceptance: `npm test` green; after M6, production `securities` has one row per distinct `security_id` seen anywhere, and `select count(*) from investment_transactions where fees is not null` is nonzero.

### Milestone 2 — Engine part 1: events, lots, realized gains, reconciliation

Goal: `src/lib/tax-lots.ts`, pure and I/O-free, integer cents throughout, building the ledger with no wash-sale logic yet.

Inputs are plain rows: investment transactions (all four accounts, full stored history — basis depends on pre-YTD trades), securities, opening lots, and account info (id, name, subtype — `roth` identifies the IRA). Stage one normalizes rows into trade events: `buy|buy` → acquisition (quantity, total cost = amount + nothing extra; Plaid's amount already includes fees on most institutions, but with `fees` now stored, cost = amount where amount is the cash debit — record fees separately for display); `sell|sell` → disposition (quantity as positive shares sold, proceeds = −amount i.e. cash received, net of fees); `transfer|split` → a split event adjusting share counts (exact semantics fixed by M0's evidence — split rows carry quantity deltas; per-lot quantities scale proportionally so basis is preserved, and a row whose shape defies proportional scaling flags the security for review); any subtype among `exercise`, `assignment`, `sell short`, `buy to cover` (never yet seen in production, present in Plaid's enum) → a review flag on the security, excluded from lot math; everything else (dividends, interest, cash transfers) is ignored by the ledger. Options are securities like any other; an `expire`-subtype row, or a position whose option `optionExpirationDate` passed while shares remained, disposes remaining lots at zero proceeds on the expiration date (the latter also flagged, since a missing expire row means the feed is incomplete). Stage two seeds each account-security with its `opening_lots`, then processes events chronologically per account and security: acquisitions append lots (date, quantity, cost in cents); dispositions consume lots FIFO, splitting the last-matched lot when partial, and emit one realized-gain record per consumed lot: proceeds share, basis share, gain, holding period from the lot's (possibly tacked, in M3) acquisition date, short-term if held ≤ 365 days. A disposition exceeding available shares (missing opening lot) consumes what exists and emits an unreconciled flag with the shortfall — never fabricated zero-basis shares presented as fact. Stage three, reconciliation: computed end-quantity per account-security versus a supplied current-holdings list, reporting matches and mismatches with the shortfall direction (this is the UI's "seed opening lots here" list).

Tests in `src/__tests__/tax-lots.test.ts`, every expectation hand-computed in comments: FIFO across three lots with a partial consume; short/long boundary at exactly 365 vs 366 days; a 2:1 split preserving total basis; an expired option realizing a full loss; a disposition with no lots flagging a shortfall of the right size; opening lots participating as ordinary lots; reconciliation zero on a complete fixture and negative on a truncated one modeled on the Chase shape.

### Milestone 3 — Engine part 2: wash sales and the Form 8949 rows

Goal: the §1091 pass over part 1's realized records, and the 8949 row builder.

Wash-sale pass, operating on the full multi-account event set (this is the point of the feature — the window search spans accounts): sort all realized-loss records chronologically; for each, find acquisitions of substantially identical securities dated within 30 days before through 30 days after the sale date, in any account, excluding the disposition's own consumed shares and excluding replacement shares already consumed by an earlier loss (one share absorbs one loss). Identity tiers, from the Decision Log: automatic — same `security_id`, or same CUSIP, or same ticker (covers the same stock held at both brokers under different Plaid ids), plus the statutory stock-loss-then-call-option case via `optionUnderlyingTicker`; warning-only — same-underlying options differing in strike/expiry/type, and leveraged-ETF↔underlying pairs from a small hardcoded map of Justin's actual tickers (seeded at implementation from M0's distinct-ticker list; e.g. MUU→MU) — these emit flags carrying the at-stake loss amount but change no numbers. For each automatic match: disallowed = matched-share fraction of the loss; if the replacement lot sits in a taxable account, add the disallowed amount to that lot's basis and tack the holding period (the replacement lot's holding-period start becomes the earlier of its own date and the washed lot's start), then part 1's downstream computation re-runs so a later sale of the replacement uses adjusted numbers — concretely, the engine iterates: apply adjustments, recompute realized records, repeat until no new wash sale appears (bounded, since each pass only defers losses forward); if the replacement sits in the Roth IRA, the loss is disallowed with no basis adjustment anywhere, tagged permanent. A loss whose forward window extends past the newest transaction date in the dataset is tagged provisional. Output: realized records annotated (allowed loss, disallowed deferred, disallowed permanent, provisional), per-lot adjusted bases, the flag list, and YTD aggregates — total short-term and long-term gain after wash adjustments, disallowed deferred, disallowed permanent, provisional count. No tax-rate math anywhere: netting, the $3,000 loss cap, and the tax itself are the filing platform's job (Schedule D), computed from the rows this engine hands over.

Form 8949 row builder, exported alongside: `buildForm8949Rows` maps the year's realized records to 8949 shape — (a) description as "<quantity> sh. <ticker>" (options: the contract's own identity, e.g. "2 MU 09/18/2026 100 C"), (b) date acquired (the lot's original date; when one disposition consumed multiple lots, one row per lot, never "VARIOUS" — precision costs nothing here), (c) date sold, (d) proceeds allocated per lot, (e) the lot's basis before wash adjustment on the sale itself, (f) `W` when washed, (g) the disallowed amount as a positive value (empty otherwise), (h) gain = d − e + g, partitioned short-term versus long-term. Permanently-disallowed (Roth) washes still appear as code-W rows — that is exactly how they are reported; the permanence only means no basis adjustment lands anywhere. Provisional rows are included but the export is watermarked (a header comment row naming `dataThrough` and the provisional count) so a mid-year download is not mistaken for final. Because Chase and Schwab will each have adjusted any same-account identical-security wash on their own 1099-Bs, the export notes (in the watermark row) that these rows are taxpayer-computed across all accounts and must be reconciled against the 1099-Bs at filing time rather than blindly summed with them.

Tests in `src/__tests__/tax-lots.test.ts` (same file, wash-sale describe blocks): the canonical cross-account wash — sell 100 X at Chase on day 0 at a $1,000 loss, buy 100 X at Schwab taxable day +10 → loss disallowed, Schwab lot basis +$1,000, holding tacked, later profitable sale of that lot uses adjusted basis; partial replacement (buy 40 of 100) → $400 disallowed, $600 allowed; replacement in the Roth → permanent, no basis change; buy 30 days before the loss (window is two-sided); two losses one replacement lot → only the first washes; stock loss + call on same underlying → statutory wash; same-underlying different-strike option → flag only, numbers unchanged; MUU↔MU → flag only; loss 10 days before dataset end → provisional; 8949 rows — a washed row carries `W`, a positive (g), and h = d − e + g exactly; a multi-lot disposition emits one row per lot whose (d) sums to the sale's proceeds; a Roth-washed row appears with `W` while no lot's basis changed; short/long partition matches each lot's (possibly tacked) holding period.

### Milestone 4 — API

Goal: one analytics route plus opening-lot CRUD. `GET /api/analytics/taxes?year=2026` (`src/app/api/analytics/taxes/route.ts`, conventions copied from `src/app/api/analytics/investments/route.ts`: `getUserId`, `withUser`, `logServerError`, exported response type): under one `withUser`, select investment transactions, securities, opening lots, accounts, current holdings; run the engine; return `{ ledger, realized, washSales, flags, aggregates, reconciliation, dataThrough }` with money as strings (shape pinned in Interfaces and Dependencies). A sibling `GET /api/analytics/taxes/export?year=2026` runs the same engine and `buildForm8949Rows`, returning `text/csv` with a `Content-Disposition` attachment filename like `ottermint-8949-2026.csv` — the watermark comment row first, then a header row matching the 8949 columns, short-term rows, a part separator, long-term rows. `POST/DELETE /api/opening-lots` (`src/app/api/opening-lots/route.ts`): create expects accountId, securityId, acquiredDate, quantity, costBasisTotal, optional note — validated (positive quantity/basis, date not in the future, account owned by the user via RLS-scoped select), same-origin enforced by existing middleware; delete by id. Route tests per the mock-queue pattern: 401 unauthenticated; a fixture producing one deferred and one permanent wash; the export route returning `text/csv` whose washed row reads back with `W` and the right adjustment; opening-lot creation validating and rejecting bad rows; queries appended after any shared helpers so existing mocks stay ordered.

### Milestone 5 — UI

Goal: a `taxes` destination in `NAV_ITEMS` (`src/app/page.tsx`, personal mode only, like the investments panel) rendering `src/components/dashboard/TaxLedgerPanel.tsx` (client, `{ refreshKey?: number }`, fetches the taxes route, sibling card chrome and skeletons). Top to bottom: KPI tiles — YTD short-term gain, long-term gain, wash-disallowed deferred, permanently lost (Roth, distinct alarm styling); the export block — a "Download Form 8949 CSV" link to the export route with the `dataThrough` date and, when provisional dispositions exist, a visible "not final — window still open" caption; the reconciliation strip — per account-security mismatches with an inline "add opening lot" form (posting to the CRUD route) so seeding happens where the gap is visible; the wash-sale list — each detected wash naming loss security, sale date/account, replacement date/account, disallowed amount, deferred vs permanent vs provisional; the flags list — warning-tier items with at-stake amounts; the ledger — per security, expandable to lots with dates, quantities, basis, adjusted basis, and realized events. Empty state before any securities sync: a quiet card pointing at Refresh. Component tests: tiles from a fixture; the permanent-loss styling present; the export link targets the export route and the provisional caption appears when the fixture says so; flags render; opening-lot form posts; loading skeleton.

Acceptance for M2–M5 together: the full gate (`npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`) passes; in a dev-server browser with mocked data unavailable (no local DB), the route tests and component tests stand in as the pre-production proof.

### Milestone 6 — Production rollout

Order fixed by house rules: push `main`; apply migration 0014 on the NAS per `docs/DEPLOYMENT.md` §5.5 (hash + journal `when`, DDL + RLS + journal row in one psql transaction); `scripts/deploy.sh`; health check; clear the 2-hour staleness gate (`update accounts set last_refreshed_at = null` for the items, or wait); press Refresh; run the one-time full-window resync; verify with psql: securities row count ≥ distinct traded `security_id`s, fees nonnull on historical rows, and the taxes API returning YTD aggregates. Then seed Chase opening lots in the UI until the reconciliation strip shows what M0 predicted, download the Form 8949 CSV and spot-check one washed row against the raw feed by hand, and record the final YTD figures (ST, LT, disallowed, permanent) in this plan. Update `interests/OtterHolt.md` in the Obsidian vault per its binding rules.

### Milestone 7 (optional, separately deployable) — CSV import for reconciliation

Goal: verify the Plaid-derived ledger against broker records and recover pre-window Chase history. Prerequisite: Justin downloads real exports — Schwab: History → Export, CSV, columns `"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"`, title line first, `"Transactions Total"` footer row, newest-first, dates sometimes `"MM/DD/YYYY as of MM/DD/YYYY"` (parse the first token), options symbols space-delimited `ROOT MM/DD/YYYY STRIKE C|P` with quantity in contracts, reverse-splits/mergers spanning two rows, chunk by date range (per-export record caps reported between 1,500 and 10,000); Chase: Investments → Transactions → custom date range → "Things you can do" → CSV, limited to two years in one-year increments, header format publicly undocumented — capture a real file before writing the parser. Build: an upload route (multipart; same-origin middleware already covers it), parsers into the M2 event shape with a dedupe key of hash(account, date, action, symbol, quantity, price, amount), and a diff view against the Plaid-derived events (missing here / missing there / field mismatches) rather than a second ingestion path — imported rows either confirm the ledger or generate opening lots for pre-window Chase positions. Scope details (storage table vs transient diff) are decided when the real files are in hand and recorded here.

## Concrete Steps

All commands from the repository root.

    # Milestone 0 (read-only; record output in Artifacts and Notes)
    ssh otterholt 'docker exec ottermint-db-1 psql -U postgres -d ottermint -c "..."'

    # Milestone 1
    npm run db:generate            # 0014_*.sql; hand-append RLS blocks for securities + opening_lots
    npm test -- src/__tests__/sync-investment-transactions.test.ts

    # Milestones 2-3
    npm test -- src/__tests__/tax-lots.test.ts

    # Milestone 4
    npm test -- src/__tests__/taxes-route.test.ts src/__tests__/opening-lots-route.test.ts

    # Milestone 5, then the full gate
    npm test && npm run lint && npx tsc --noEmit && npm run build

    # Milestone 6 (after pushing main)
    shasum -a 256 drizzle/0014_*.sql
    grep -A3 '"tag": "0014' drizzle/meta/_journal.json
    # apply per docs/DEPLOYMENT.md §5.5, then:
    scripts/deploy.sh

## Validation and Acceptance

The feature is accepted when: (1) the engine's fixtures reconcile by hand-checkable arithmetic — in particular the canonical cross-account wash (Chase loss, Schwab replacement) moves exactly the disallowed amount into the replacement lot's basis and a later sale of that lot uses it; (2) a Roth replacement produces a permanent disallowance with no basis adjustment anywhere; (3) warning-tier pairs (different-strike options, MUU↔MU) change no numbers and appear as flags; (4) reconciliation reports zero share mismatch for both Schwab accounts against live holdings, and the Chase mismatches equal M0's predicted list until opening lots are seeded, after which they clear; (5) YTD aggregates equal the sum of the year's realized records after wash adjustments, and every disallowed dollar appears in exactly one of deferred or permanent; (6) the exported CSV satisfies h = d − e + g on every row, its per-part totals equal the on-screen ST/LT aggregates, each washed row carries `W` with a positive (g), and the watermark row names `dataThrough`; (7) the full local gate passes; (8) in production, the Taxes view renders real YTD figures, at least one real cross-account wash sale is visible with both account names (Justin believes several exist — if zero appear, that itself must be explained against the raw feed before acceptance), and the recorded figures land in this plan.

## Idempotence and Recovery

Migration 0014 is additive and journaled; §5.5 application is transactional. Securities and fee writes are upserts — re-running any sync, including the full-window resync, converges (production row counts have already proven the transaction upsert stable at 794 across re-syncs). The ledger is recomputed on every request from raw rows, so there is no derived state to corrupt or rebuild; a bad engine release is fixed by deploying a fix, with no data repair. Opening lots are ordinary user rows — deletable in the UI, cascade-deleted with the account. Rolling back the app leaves the new tables inert. The Chase truncation is permanent upstream (Plaid serves 24 months, Chase CSV two years); opening lots plus the reconciliation strip are the designed recovery, and the UI never presents unseeded positions as reconciled.

## Artifacts and Notes

(M0 evidence lands here: the six probe queries and their outputs, the derivative ticker formats, the split-row shapes, and the per-security share-count residual table that defines the opening-lot seeding list.)

Prior art for the matching algorithm (read for shape, not copied): adlr/wash-sale-calculator and bbreslauer/wash-sale-tracker on GitHub — immutable acquisition lots, chronological disposition processing, ±30-day replacement scan with FIFO matching and per-share consumption marking. Legal grounding embedded in Context and Orientation: IRS Pub 550 (Wash Sales), Rev. Rul. 2008-5 (IRA/Roth permanence), Form 1099-B instructions (brokers report same-account identical-CUSIP only), Form 8949 and its instructions (the export's column and code semantics). This plan is record-keeping tooling, not tax advice; the tax itself is computed by the filing platform from the exported rows.

## Interfaces and Dependencies

No new packages. Drizzle, Vitest, Recharts as established.

In `src/lib/db/schema.ts`: `securities`, `openingLots`, and `investmentTransactions.fees` as specified in Milestone 1.

In `src/lib/tax-lots.ts` (all money strings in/out, cents internally):

    export interface TradeEventRow { /* normalized inputs, built from investment_transactions + securities */ }
    export interface RealizedRecord {
      accountId: string; securityId: string; ticker: string | null;
      saleDate: string; quantity: string; proceeds: string; basis: string; adjustedBasis: string;
      gain: string; term: "short" | "long";
      washStatus: "none" | "deferred" | "permanent" | "provisional";
      disallowed: string; replacement?: { accountId: string; date: string };
    }
    export interface WashFlag {
      kind: "option_terms" | "leveraged_etf" | "exercise_assignment" | "unreconciled" | "unsupported_1256";
      securityIds: string[]; atStake: string | null; detail: string;
    }
    export interface TaxAggregates {
      shortTermGain: string; longTermGain: string; disallowedDeferred: string;
      disallowedPermanent: string; provisionalCount: number;
    }
    export interface Form8949Row {
      description: string; dateAcquired: string; dateSold: string;
      proceeds: string; costBasis: string; code: "W" | "";
      adjustment: string; gain: string; term: "short" | "long";
    }
    export function buildLedger(txRows, securityRows, openingLotRows, accountRows, holdingRows, year: number):
      { lots; realized: RealizedRecord[]; washSales; flags: WashFlag[];
        aggregates: TaxAggregates; reconciliation; dataThrough: string };
    export function buildForm8949Rows(realized: RealizedRecord[], year: number): Form8949Row[];

In `src/app/api/analytics/taxes/route.ts`: `GET` returning `TaxesResponse` (the `buildLedger` output serialized, plus account names). In `src/app/api/analytics/taxes/export/route.ts`: `GET` returning the Form 8949 CSV as `text/csv` with an attachment `Content-Disposition`. In `src/app/api/opening-lots/route.ts`: `POST` and `DELETE`. In `src/components/dashboard/TaxLedgerPanel.tsx`: `export function TaxLedgerPanel({ refreshKey }: { refreshKey?: number })`. In `src/app/page.tsx`: a `taxes` entry in `NAV_ITEMS` rendering the panel in personal mode.

---

Revision note (2026-08-18): On Justin's direction, the in-app federal tax estimator was dropped before implementation began. The original design computed an estimated tax from 2026 bracket constants plus user-supplied filing status and income; Justin's actual workflow hands the trade data to a tax platform (TurboTax), which computes the tax itself from complete income data OtterMint never has. The deliverable in its place is a Form 8949-format CSV export with wash-sale code `W` and adjustment amounts — the per-sale schedule those platforms consume — produced by the same engine. Sections updated: title, Purpose, Progress, Decision Log (original estimator decision marked superseded; revision entry added), Context and Orientation (Form 8949 defined; rate material removed with the estimator), Milestone 3 (estimator → 8949 row builder; §1211 netting and the $3,000 cap removed — Schedule D territory, done by the platform), Milestone 4 (export route added), Milestone 5 (estimate inputs and tile → export block), Milestone 6 (export spot-check added), Validation, Artifacts and Notes, Interfaces (`estimateTax` removed; `Form8949Row`/`buildForm8949Rows` and the export route added; `TaxAggregates` fields renamed to `shortTermGain`/`longTermGain` and `carryforward` dropped to avoid implying netting the engine no longer does).
