# Separate savings from spending with a cash-flow analytics model

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `docs/PLANS.md` from the repository root. A contributor should be able to implement and verify the feature with only this file and the current working tree.

## Purpose / Big Picture

OtterMint's only spending analytic today is a bar chart that treats every dollar leaving any account as "spending." That makes the chart wrong in three specific ways the owner has observed on real data. A transfer from checking into a brokerage account shows up as spending under "Transfer Out," even though that money was saved, not spent. A credit-card payment shows up as spending under "Loans," even though the purchases it settles were already counted as spending when they hit the card — so groceries are counted twice. And Plaid's top-level category names ("Loans" vs "Bills") are ambiguous because the database throws away the detailed subcategory that would disambiguate them.

After this work, a user on the Analytics view of the dashboard can answer four basic questions at a glance for any recent month: how much did I earn, how much did I actually spend, how much did I move into savings and investments, and what did I spend it on. Concretely: a KPI row shows Income, Spending, Saved, and Net cash flow for a selected month; a bar chart shows those three flows per month over the last six months; and the spending-by-category chart shows only true spending, broken down by Plaid's detailed subcategories (restaurants vs groceries, rent vs utilities), for a labeled month — with credit-card payments and internal transfers excluded entirely.

A human can demonstrate the result end to end: after re-syncing transactions, open the Analytics destination in the left navigation. A transfer to a brokerage account (Plaid detailed category `TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS`) must appear in the "Saved" KPI and never in any spending chart. A credit-card payment (`LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`) must appear in neither spending nor savings. The category chart must be able to show "Restaurants" and "Groceries" as separate bars, which is impossible today because only the primary category `FOOD_AND_DRINK` is stored.

## Progress

- [x] (2026-08-13 00:00Z) Researched the repository: transaction sync and storage, dashboard structure, migration workflow, test patterns, API route conventions. Wrote this plan.
- [ ] Milestone 1: store `categoryDetailed` on transactions and backfill via full re-sync. (Completed 2026-08-13 23:35Z: schema column, generated `drizzle/0010_equal_zeigeist.sql`, sync writes the detailed category in all four paths, sync tests extended, 10/10 passing. Remaining: apply the migration and run the cursor-reset backfill against the live database — no Postgres was reachable from the dev machine during implementation; see Surprises.)
- [x] (2026-08-13 23:36Z) Milestone 2: pure classification and aggregation module `src/lib/cashflow.ts` with 25 unit tests passing, including the hand-computed reconciliation fixture.
- [x] (2026-08-13 23:37Z) Milestone 3: `GET /api/analytics/cashflow` endpoint with 4 route tests passing (401, reconciled totals, months clamp, zero-filled window).
- [x] (2026-08-13 23:38Z) Milestone 4: `CashflowPanel` (KPI row + monthly trend + spending-only category chart with month selector) wired into the Analytics destination; `SpendingChart.tsx` deleted with no dangling imports; 6 component tests passing.
- [ ] Final validation. (Completed 2026-08-13 23:39Z: full suite 272 passed / 35 skipped, `npx tsc --noEmit` clean, `npm run lint` clean except one pre-existing unrelated warning in `sync-holdings.ts`, `npm run build` compiles all 35 routes including `/api/analytics/cashflow`. Remaining: live-database migration + backfill, then the manual browser verification of the acceptance scenarios — both blocked on database access, see Surprises.)

## Surprises & Discoveries

Pre-seeded from the research phase; add implementation discoveries below these.

- Observation: The sync layer discards the disambiguating data. Only `personal_finance_category.primary` is stored; `.detailed` is dropped.
  Evidence: `src/lib/sync-transactions.ts` lines 50, 61, 88, 99 all read `txn.personal_finance_category?.primary ?? null` and nothing reads `.detailed`.

- Observation: The current spending chart counts every posted outflow as spending, which double counts credit-card activity (purchases counted on the card, then the payment counted again from checking) and misclassifies investment transfers as spending.
  Evidence: `src/components/dashboard/SpendingChart.tsx` filters `parseFloat(t.amount) > 0 && !t.pending` with no category exclusions.

- Observation: The spending chart's time window is "the last 200 transactions," not a date range, so the period it covers is undefined and unlabeled.
  Evidence: `SpendingChart.tsx` fetches `/api/transactions?limit=200`.

- Observation: A full transaction re-sync is cheap to trigger because sync is cursor-based and upserts on `transaction_id`. Resetting the cursor re-pulls all history Plaid holds for the item and rewrites existing rows in place.
  Evidence: `src/lib/sync-transactions.ts` passes the stored cursor to `transactionsSync` and every insert has `onConflictDoUpdate` targeting `transactions.transactionId`.

- Observation: The refresh endpoint skips items refreshed within the last two hours, so a backfill must also clear `accounts.last_refreshed_at`, not just the cursor.
  Evidence: `src/app/api/accounts/refresh/route.ts` computes `isStale` from `lastRefreshedAt` against `STALE_THRESHOLD_MS = 2h` and `continue`s when fresh.

- Observation: `npm run db:push` must never be used; it would silently drop the Row Level Security policies and REVOKE grants that exist only in the journaled SQL migrations. Schema changes go through `npm run db:generate` + `npm run db:migrate`.
  Evidence: the warning header in `scripts/apply-schema-changes.sql` and the RLS migrations `drizzle/0006_rls_prototype.sql`, `drizzle/0008_rls_full_rollout.sql`.

- Observation: No database is reachable from the dev machine during implementation. `.env`'s `DATABASE_URL` points at `localhost:5432`, but nothing listens there: Docker is not running, the compose `db` service publishes no ports by design, and no Homebrew Postgres (or even `psql`) is installed. Production Postgres lives inside `ottermint-db-1` on the OtterHolt NAS and is never published to a host port (`docs/DEPLOYMENT.md`). Consequence: `npm run db:migrate` and the backfill must be run wherever the real database is reachable; all code milestones and tests proceed without a live DB because every test mocks the database.
  Evidence: `node` connection attempt to the `.env` URL returns `ECONNREFUSED 127.0.0.1:5432`; `which psql` finds nothing; `docker ps` cannot reach a daemon.

- Observation: An "analytics" navigation destination already exists and currently renders `NetWorthCard`, `NetWorthChart`, and `SpendingChart` (personal mode) — so the new UI has a natural home and no new routing is needed.
  Evidence: `src/app/page.tsx`, the final branch of `renderContent()` and the `NAV_ITEMS` array containing `{ id: "analytics", label: "Analytics" }`.

## Decision Log

- Decision: Classify every transaction into exactly one of four flow types — `income`, `spending`, `savings`, `internal` — with a single pure function, and derive all analytics from that classification.
  Rationale: The user's questions (earn / spend / save / where) are all views over one partition of transactions. One tested function is the single source of truth; SQL never encodes the taxonomy.
  Date/Author: 2026-08-13 / Claude + Justin

- Decision: Credit-card payments (`LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`) are `internal` on both sides.
  Rationale: The purchases the payment settles were already counted as spending when they posted to the card. Counting the payment too double counts roughly the entire monthly card balance. The card-side payment credit is the mirror image of the same internal move.
  Date/Author: 2026-08-13 / Claude + Justin

- Decision: Transfers out to investment or savings destinations (`TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS`, `TRANSFER_OUT_SAVINGS`) are `savings`; inflows classified as savings-related subtract from the same total (signed sum), so a withdrawal from investments reduces "Saved" for the month rather than inflating income.
  Rationale: This is the user's explicit definition: money moved to accounts you own that grow is saved, not spent. Signed summation makes withdrawals self-correcting without a separate "dis-saving" concept.
  Date/Author: 2026-08-13 / Claude + Justin

- Decision: `TRANSFER_IN_SAVINGS` landing in an account whose subtype is `savings` is `internal` (it is the receiving side of a contribution whose sending side is already counted); the same category landing anywhere else is `savings` (a withdrawal from savings, negative by sign).
  Rationale: When both sides of a checking→savings move are linked, counting both sides would double count the contribution. Account context is available at classification time via the accounts join.
  Date/Author: 2026-08-13 / Claude + Justin

- Decision: Ambiguous outflows (`TRANSFER_OUT_OTHER_TRANSFER_OUT`, `TRANSFER_OUT_WITHDRAWAL`, unknown/null categories) default to `spending`; ambiguous inflows (`TRANSFER_IN_DEPOSIT`, `TRANSFER_IN_OTHER_TRANSFER_IN`, `TRANSFER_IN_ACCOUNT_TRANSFER`, `TRANSFER_IN_CASH_ADVANCES_AND_LOANS`) default to `internal` — except fully uncategorized inflows (null category), which count as `income`.
  Rationale: Asymmetric conservatism. Overstating spending is a safe error (the user investigates); overstating savings or income is a flattering error (the user is misled). Cash withdrawals leave OtterMint's visibility, so they are treated as spent. Loan proceeds create an equal liability, so they are not income. Fully uncategorized inflows are usually genuine deposits (Plaid categorizes internal transfers reliably), so dropping them would make income visibly wrong; they surface as an "Uncategorized" income line to be revisited with real data.
  Date/Author: 2026-08-13 / Claude + Justin

- Decision: Aggregate on the fly in the API route (fetch the window's transactions, classify and sum in TypeScript) instead of building the `monthly_spending_summaries` table sketched in `docs/specs/analytics-dashboard.md`.
  Rationale: Personal-scale data (a few thousand rows per 24 months) aggregates in milliseconds; a summary table adds write-path complexity and staleness bugs for no measurable benefit. The pure aggregation function can be lifted into a precompute job later without changing its tests.
  Date/Author: 2026-08-13 / Claude + Justin

- Decision: Cash-flow analytics are personal-only in this plan; the household tab keeps its existing "not available yet" placeholder.
  Rationale: Household transaction feeds do not exist anywhere in the product yet (`src/app/page.tsx` renders a placeholder), and household transaction RLS read paths are unproven. Scope stays matched to what the product already does.
  Date/Author: 2026-08-13 / Claude + Justin

- Decision: `CashflowPanel` replaces `SpendingChart`, and `src/components/dashboard/SpendingChart.tsx` is deleted.
  Rationale: The category chart inside `CashflowPanel` supersedes it (same visual, correct data), and `SpendingChart` has exactly one usage site — the analytics branch of `src/app/page.tsx`. Keeping a known-misleading chart alive would contradict the purpose of this plan.
  Date/Author: 2026-08-13 / Claude + Justin

- Decision: Backfill detailed categories by clearing sync cursors and re-syncing, not by a data migration.
  Rationale: The upsert-on-`transaction_id` sync already rewrites rows in place; Plaid is the source of truth for the detailed value; no hand-written SQL touches financial data. Rows older than Plaid's retained window keep a null `category_detailed` and fall back to primary-category classification, which degrades labels but never correctness of flow type.
  Date/Author: 2026-08-13 / Claude + Justin

- Decision: Pending transactions are excluded from all cash-flow aggregates.
  Rationale: Matches the existing spending chart's behavior and avoids double counting when a pending transaction posts under a new `transaction_id`.
  Date/Author: 2026-08-13 / Claude + Justin

## Outcomes & Retrospective

(2026-08-13, code complete) All four milestones are implemented and verified by tests, typecheck, lint, and a production build. The model's correctness claims are proven by the reconciliation fixture at unit and route level: a credit-card payment (both sides) changes no total, an investment transfer lands in Saved, a withdrawal reduces Saved, and category totals sum exactly to the spending total (integer-cents arithmetic). What remains is operational, not code: apply migration 0010 and run the cursor-reset backfill wherever the real database is reachable (production Postgres lives inside `ottermint-db-1` on the OtterHolt NAS and is intentionally unreachable from the dev machine), then confirm the three browser scenarios in Validation and Acceptance against real data. Lesson captured: this repo's dev machine has no local database at all — plans touching data should assume migrations and backfills happen at deploy time on the NAS, not locally.

## Context and Orientation

OtterMint is a Next.js 16 (App Router) personal-finance app in this repository. Server code and UI live under `src/`. Financial data comes from Plaid (a bank-data aggregator) and lands in PostgreSQL via Drizzle ORM (a TypeScript SQL toolkit; the schema is `src/lib/db/schema.ts`, journaled SQL migrations live in `drizzle/`). Every API route authenticates with `getUserId()` from `src/lib/auth/get-user-id.ts` and runs its database work inside `withUser(userId, tx => ...)` from `src/lib/db/with-user.ts`, which sets the Row Level Security context (RLS: PostgreSQL policies that make rows invisible to other users at the database layer). Tests use Vitest (`npm test`), with jsdom as the default environment and `// @vitest-environment node` pragmas on server-side test files.

The transaction pipeline: `src/lib/sync-transactions.ts` exposes `syncTransactions(accessToken, cursor, userId, executor)`, which calls Plaid's `transactionsSync` API repeatedly until `has_more` is false and upserts each transaction into the `transactions` table keyed on the unique `transaction_id`. It is invoked from two places — the manual refresh endpoint `src/app/api/accounts/refresh/route.ts` and the Plaid webhook `src/app/api/plaid/webhook/route.ts` — both of which persist the returned `nextCursor` onto `plaid_items.transactions_cursor`. Passing a null cursor makes Plaid return the item's full retained history, and the upsert rewrites existing rows, which is what makes the backfill in Milestone 1 safe and idempotent. A privacy filter (`src/lib/transaction-filter.ts`) drops transactions matching `EXCLUDED_MERCHANT_KEYWORDS` before they are ever written; a re-sync preserves that behavior automatically.

Plaid categorization: every transaction carries a `personal_finance_category` object with a `primary` value (16 coarse buckets such as `FOOD_AND_DRINK`, `TRANSFER_OUT`, `LOAN_PAYMENTS`, `INCOME`) and a `detailed` value that refines it (for example `FOOD_AND_DRINK_RESTAURANTS`, `TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS`, `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`, `INCOME_WAGES`). The detailed string always begins with its primary string as a prefix. Only `primary` is currently stored (column `transactions.category`). The detailed values this plan relies on, with their plain meanings:

    INCOME_*                                      wages, dividends, interest, tax refunds, pension,
                                                  unemployment, other income — money in from outside
    TRANSFER_IN_DEPOSIT                           a deposit (check/cash) whose origin Plaid cannot see
    TRANSFER_IN_ACCOUNT_TRANSFER                  incoming move between the user's own accounts
    TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS   money arriving FROM investment/retirement funds
    TRANSFER_IN_SAVINGS                           money arriving from/into savings
    TRANSFER_IN_CASH_ADVANCES_AND_LOANS           loan proceeds / cash advances
    TRANSFER_IN_OTHER_TRANSFER_IN                 unrecognized inflow (Venmo receipts often land here)
    TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS  money sent to investment/retirement accounts
    TRANSFER_OUT_SAVINGS                          money sent to savings
    TRANSFER_OUT_ACCOUNT_TRANSFER                 outgoing move between the user's own accounts
    TRANSFER_OUT_WITHDRAWAL                       cash withdrawal (ATM)
    TRANSFER_OUT_OTHER_TRANSFER_OUT               unrecognized outflow (Venmo/Zelle payments often land here)
    LOAN_PAYMENTS_CREDIT_CARD_PAYMENT             a credit-card payment
    LOAN_PAYMENTS_{MORTGAGE,CAR,STUDENT,PERSONAL_LOAN,OTHER}_PAYMENT   real debt-service payments

Do not assume this list is exhaustive — Plaid adds values. The classifier in Milestone 2 therefore matches specific detailed values first and falls back to the primary prefix for anything unrecognized.

Sign convention (Plaid's, preserved verbatim in the `transactions.amount` numeric column): positive means money left the account; negative means money arrived. A $2,000 paycheck is `-2000.00` with category `INCOME_WAGES`. A $50 restaurant refund is `-50.00` with a `FOOD_AND_DRINK_*` category.

The accounts context needed by one classification rule: the `accounts` table stores Plaid's `type` (`depository`, `credit`, `investment`, `loan`) and `subtype` (for depository: `checking`, `savings`, etc.). Transactions join to accounts on `transactions.account_id = accounts.account_id` — the existing pattern is in `src/app/api/transactions/route.ts`, which joins `transactions → accounts → plaid_items` and filters `plaid_items.user_id`.

The UI: `src/app/page.tsx` is one client component with a left navigation (`NAV_ITEMS`) whose destinations render inside `renderContent()`. The `analytics` destination is the fallback branch at the end of `renderContent()` and currently renders `NetWorthCard`, then a two-column grid of `NetWorthChart` and `SpendingChart` (or a "Household spending analytics are not available yet" placeholder in household mode). Charts use Recharts; money is formatted with `formatCurrency` from `src/lib/format.ts`; panels follow a shared visual idiom (rounded-xl bordered cards, CSS-variable colors, skeleton pulse while loading) visible in any existing dashboard component.

Numeric convention: Drizzle returns PostgreSQL `numeric` columns as strings, and API responses keep money as strings (see `TransactionRow.amount: string`). This plan's new API keeps that convention; all arithmetic happens in `number` internally and is serialized with `.toFixed(2)`.

## Plan of Work

The work is four milestones, each independently verifiable, ordered so that every later milestone consumes only artifacts the earlier ones produced.

### Milestone 1 — Store the detailed category and backfill it

Goal: the `transactions` table gains a nullable `category_detailed` text column, the sync layer populates it, and existing rows are backfilled by a full re-sync. Nothing user-visible changes yet; this milestone makes every later distinction possible.

In `src/lib/db/schema.ts`, inside the `transactions` table definition, add directly after the existing `category` column:

    categoryDetailed: text("category_detailed"),

Generate and apply the journaled migration (never `db:push` — see Surprises):

    cd /Users/justin/code/personal/OtterMint
    npm run db:generate    # writes drizzle/0010_<name>.sql
    npm run db:migrate

Inspect the generated file; it must contain exactly one statement of the form `ALTER TABLE "transactions" ADD COLUMN "category_detailed" text;`. Adding a nullable column does not touch RLS policies, so no hand-edits to the migration are needed.

In `src/lib/sync-transactions.ts`, there are four places that write `category` (the `values` and the `onConflictDoUpdate.set` of both the `added` and `modified` loops). In each of the four, add the sibling line:

    categoryDetailed: txn.personal_finance_category?.detailed ?? null,

Update `src/__tests__/sync-transactions.test.ts`: the `makePlaidTransaction` helper already includes `detailed: "FOOD_AND_DRINK_COFFEE"`, so extend the existing assertions that check the inserted `values` payload to also expect `categoryDetailed: "FOOD_AND_DRINK_COFFEE"`, and add one case where `personal_finance_category` is undefined and both `category` and `categoryDetailed` are null. Also update the schema mock in that file if it enumerates columns.

Backfill. Connect to the database (the connection string is `DATABASE_URL` in `.env`) and clear both the sync cursors and the staleness timestamps — the refresh endpoint skips items refreshed within two hours, so clearing only the cursor would silently do nothing:

    psql "$DATABASE_URL" -c "UPDATE plaid_items SET transactions_cursor = NULL;"
    psql "$DATABASE_URL" -c "UPDATE accounts SET last_refreshed_at = NULL;"

Then trigger a refresh: either click the refresh button in the running app, or with the app running locally and a logged-in browser session, press the dashboard Refresh button (the endpoint is `POST /api/accounts/refresh` and requires the session cookie, so the button is the practical path). The re-sync re-pulls all history Plaid retains and the upsert rewrites each row with its detailed category. The refresh endpoint is rate limited to 6 calls per hour per user (`accountsRefresh` in `src/lib/rate-limit.ts`), which one backfill fits comfortably.

Acceptance for Milestone 1 (observable): `npm test` passes including the updated sync tests. After the backfill refresh completes, this query returns a number near zero — exactly zero for rows within Plaid's retained window, with any remainder being rows older than the window Plaid no longer returns:

    psql "$DATABASE_URL" -c "SELECT count(*) FROM transactions WHERE category_detailed IS NULL;"

And a spot check shows real detailed values:

    psql "$DATABASE_URL" -c "SELECT category, category_detailed, count(*) FROM transactions GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15;"

Expected shape of that output: rows like `FOOD_AND_DRINK | FOOD_AND_DRINK_RESTAURANTS | 214` and, critically, `TRANSFER_OUT | TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS | ...` and `LOAN_PAYMENTS | LOAN_PAYMENTS_CREDIT_CARD_PAYMENT | ...` appearing as distinct rows.

### Milestone 2 — The classification and aggregation module

Goal: a new pure module `src/lib/cashflow.ts` that turns raw transaction rows into the numbers the user asked for, fully unit tested with no I/O. This file must not import anything server-only (no db, no next), because Milestone 4's client components import its label helper and types.

The module defines these exports (full signatures in Interfaces and Dependencies):

`FlowType` — the union `"income" | "spending" | "savings" | "internal"`, where `internal` means "a move between the user's own accounts; excluded from every total."

`classifyTransaction(txn)` — takes `{ amount, category, categoryDetailed, accountType, accountSubtype }` and returns a `FlowType`. The rules, in order (first match wins), each traced to the Decision Log:

1. `categoryDetailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"` → `internal` (double-count fix; both the checking-side debit and the card-side credit match this rule).
2. `categoryDetailed` is `TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS` or `TRANSFER_OUT_SAVINGS` → `savings`.
3. `categoryDetailed === "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS"` → `savings` (its negative amount subtracts: a withdrawal).
4. `categoryDetailed === "TRANSFER_IN_SAVINGS"` → `internal` if `accountSubtype === "savings"` (receiving side of a contribution already counted from the sending side), else `savings` (money pulled out of savings; negative amount subtracts).
5. `categoryDetailed` is `TRANSFER_OUT_ACCOUNT_TRANSFER`, `TRANSFER_IN_ACCOUNT_TRANSFER`, `TRANSFER_IN_DEPOSIT`, `TRANSFER_IN_CASH_ADVANCES_AND_LOANS`, or `TRANSFER_IN_OTHER_TRANSFER_IN` → `internal`.
6. Primary category (from `category`, or the prefix of `categoryDetailed` when `category` is null) is `INCOME` → `income`.
7. Primary is `TRANSFER_IN` (any remaining unrecognized detailed value) → `internal`; primary is `TRANSFER_OUT` (remaining values, including `TRANSFER_OUT_WITHDRAWAL` and `TRANSFER_OUT_OTHER_TRANSFER_OUT`) → `spending`.
8. Both category fields null: `amount > 0` → `spending`, otherwise `income` (surfaced as "Uncategorized").
9. Everything else — all remaining primaries including `FOOD_AND_DRINK`, `RENT_AND_UTILITIES`, `GENERAL_MERCHANDISE`, `BANK_FEES`, and the non-credit-card `LOAN_PAYMENTS_*` values (mortgage, car, student, personal) → `spending`.

`aggregateCashflow(rows, options)` — takes rows shaped `{ amount, date, category, categoryDetailed, accountType, accountSubtype, pending }` plus `{ months, today }` (an explicit `today` keeps the function deterministic for tests) and returns one entry per calendar month for the last `months` months up to and including the current month, zero-filled for empty months, each entry:

    {
      month: "2026-08",            // YYYY-MM from the transaction date string
      partial: true,               // true only for the current month
      income: "4200.00",           // sum of -amount over income rows
      spending: "3100.50",         // sum of amount over spending rows (refunds subtract naturally)
      savings: "1000.00",          // signed sum of amount over savings rows (withdrawals subtract)
      netCashFlow: "1099.50",      // income - spending
      spendingByCategory: [        // spending rows only, sorted by total descending
        { key: "FOOD_AND_DRINK_RESTAURANTS", primary: "FOOD_AND_DRINK", total: "412.33" },
        { key: "UNCATEGORIZED", primary: "UNCATEGORIZED", total: "80.00" }
      ]
    }

Pending rows are skipped entirely. The category `key` is `categoryDetailed ?? category ?? "UNCATEGORIZED"`. Month bucketing slices the `date` string (`date.slice(0, 7)`) — transaction dates are calendar dates from Plaid, so no timezone math exists to get wrong.

`labelForCategoryKey(key)` — turns a category key into a display label: strip the primary prefix from a detailed key when present, lowercase, replace underscores with spaces, title-case (so `FOOD_AND_DRINK_RESTAURANTS` → "Restaurants", `RENT_AND_UTILITIES_RENT` → "Rent", bare `FOOD_AND_DRINK` → "Food And Drink", `UNCATEGORIZED` → "Uncategorized"). A small explicit override map handles the handful of names where mechanical prettifying reads badly; extend it as real data reveals them.

Tests in `src/__tests__/cashflow.test.ts` (jsdom default environment is fine — the module is pure). Every Decision Log rule gets a test: the credit-card payment is internal from both the checking side (positive amount) and the card side (negative amount); the brokerage transfer is savings; the investment withdrawal produces negative savings; `TRANSFER_IN_SAVINGS` flips on account subtype; a Venmo-style `TRANSFER_OUT_OTHER_TRANSFER_OUT` is spending; a null-category outflow is spending and a null-category inflow is income; a refund reduces its category's spending total; pending rows are ignored; months with no rows appear zero-filled; the current month is flagged `partial`; an unknown future detailed value like `TRANSFER_OUT_SOMETHING_NEW` falls back to its primary's rule. One reconciliation test builds a realistic month — paycheck −4200, groceries +350, restaurants +412.33, rent +1800, card payment +1850 (internal), brokerage transfer +1000, Venmo out +120 — and asserts income 4200.00, spending 2682.33, savings 1000.00, netCashFlow 1517.67, proving by construction that the card payment inflates nothing.

Acceptance for Milestone 2 (observable): `npm test` runs the new file; all cases pass; the reconciliation test's expected numbers are computed by hand in the test source with a comment, so a reviewer can verify the arithmetic without running anything.

### Milestone 3 — The aggregation API

Goal: an authenticated endpoint that serves the aggregation to the UI: `GET /api/analytics/cashflow?months=6`.

Create `src/app/api/analytics/cashflow/route.ts` modeled line-for-line on the conventions of `src/app/api/transactions/route.ts` (auth via `getUserId` with `isAuthError` → 401; `withUser` around all queries; `logServerError` + 500 on failure; no rate limit, matching the other GET read endpoints). Parse `months` with the same clamp idiom the net-worth route uses for `days`: default 6, minimum 1, maximum 24, `NaN` → default.

The query joins `transactions → accounts → plaid_items` filtered to `plaidItems.userId` (RLS enforces the same boundary underneath), restricted to `transactions.date >=` the first day of the window's earliest month (compute the `YYYY-MM-01` string from `new Date()` in UTC), `pending = false`, selecting `amount`, `date`, `category`, `categoryDetailed`, `accounts.type`, `accounts.subtype`. Feed the rows to `aggregateCashflow` with `today` set to the current UTC date string and return `NextResponse.json({ months: [...] })`. Export the response entry type as `CashflowMonth` (defined in `src/lib/cashflow.ts`, imported with `import type` by the UI, matching how `TransactionRow` is shared today).

Tests in `src/__tests__/cashflow-route.test.ts` with the `// @vitest-environment node` pragma, mocking exactly as `src/__tests__/net-worth-routes.test.ts` does (`vi.hoisted` mocks for `getUserId` and the drizzle chain behind `withUser`). Cases: unauthenticated → 401; a seeded row set returns reconciled totals (reuse the Milestone 2 reconciliation fixture); `months=99` clamps to 24 and `months=abc` falls back to 6 (assert via the length of the returned months array); a user with zero transactions gets a zero-filled window, not an empty array.

Acceptance for Milestone 3 (observable): `npm test` passes. With the dev server running (`npm run dev`) and a logged-in browser session, opening `http://localhost:3000/api/analytics/cashflow?months=3` in that browser returns JSON like:

    { "months": [
        { "month": "2026-06", "partial": false, "income": "...", "spending": "...",
          "savings": "...", "netCashFlow": "...", "spendingByCategory": [ ... ] },
        { "month": "2026-07", ... },
        { "month": "2026-08", "partial": true, ... } ] }

and two manual reconciliation checks against the raw data hold: (a) the sum of `spendingByCategory` totals equals `spending` for each month, and (b) no `spendingByCategory` key is `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`, `TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS`, or `TRANSFER_OUT_SAVINGS`.

### Milestone 4 — The Analytics UI

Goal: the Analytics destination answers the four questions. One new component, one edit to the page, one deletion.

Create `src/components/dashboard/CashflowPanel.tsx`, a client component styled to match its siblings (copy the card chrome, skeleton loading, and Recharts theming from `NetWorthChart.tsx`/`SpendingChart.tsx`). It takes `{ refreshKey?: number }`, fetches `/api/analytics/cashflow?months=6` (re-fetching when `refreshKey` changes, the established pattern), and renders three stacked pieces inside one panel:

First, a month selector and KPI row. The selector is a simple `<select>` of the returned months, defaulting to the latest; the current month's option is labeled with "(month to date)". Four KPI tiles below it, mirroring `NetWorthCard`'s typography: Income (green), Spending (red), Saved (blue; when negative, show the negative value — it means net withdrawal from savings), and Net cash flow (green/red by sign, with a sub-line showing the savings rate `netCashFlow / income` as a percentage, omitted when income is zero).

Second, a monthly trend chart: a Recharts `BarChart` over all returned months with three `Bar` series — income, spending, savings — colored to match the KPI tiles, tooltip formatted with `formatCurrency`, axis styling copied from the existing charts.

Third, spending by category for the selected month: the horizontal bar list visual from the old `SpendingChart` (top 8 by total, remainder summed into an "Other" bar), but sourced from `spendingByCategory` of the selected month and labeled via `labelForCategoryKey`. The section header includes the human month ("Spending — August 2026 (month to date)") so the window is never ambiguous again. When the selected month has no spending rows, render the panel's empty state ("No transaction data for this month") rather than nothing, so a manual-accounts-only user sees a coherent page.

In `src/app/page.tsx`, in the analytics branch of `renderContent()`: replace `<SpendingChart refreshKey={refreshKey} />` with `<CashflowPanel refreshKey={refreshKey} />` moved out of the two-column grid to full width below it (the panel is wider than a half column; `NetWorthChart` keeps its grid cell, with the household placeholder occupying the other cell exactly as today in household mode — in household mode the CashflowPanel is not rendered at all). Remove the now-unused `SpendingChart` import and delete `src/components/dashboard/SpendingChart.tsx` — this deletion is in scope per the Decision Log; nothing else imports it (verify with a grep before deleting).

Tests in `src/__tests__/cashflow-panel.test.tsx`, following the fetch-mocking pattern of `src/__tests__/net-worth-chart.test.tsx`: mock `fetch` to return a two-month payload; assert the four KPI labels and their formatted values render; assert the "(month to date)" label appears for the partial month; assert switching the month selector swaps the category section's data; assert the loading skeleton shows before the fetch resolves and the empty state shows for an empty `spendingByCategory`.

Acceptance for Milestone 4 (observable): with the dev server running and real data synced, the Analytics destination shows the KPI row, trend chart, and labeled category chart. The three motivating scenarios hold on screen: a brokerage transfer contributes to Saved and appears in no spending chart; a credit-card payment appears in no KPI and no chart; the category chart shows detailed labels (e.g. "Restaurants" and "Groceries" as separate bars). `npm test` passes including the new component tests.

## Concrete Steps

All commands run from the repository root `/Users/justin/code/personal/OtterMint`.

Milestone order is mandatory (each consumes the previous). Per milestone: edit the files named in Plan of Work, then run the relevant slice of the suite before moving on:

    npm test -- src/__tests__/sync-transactions.test.ts     # after Milestone 1 edits
    npm run db:generate && npm run db:migrate                # Milestone 1 schema change
    npm test -- src/__tests__/cashflow.test.ts               # after Milestone 2
    npm test -- src/__tests__/cashflow-route.test.ts         # after Milestone 3
    npm test -- src/__tests__/cashflow-panel.test.tsx        # after Milestone 4

The backfill (once, after Milestone 1 is deployed or running locally against the real DB):

    psql "$DATABASE_URL" -c "UPDATE plaid_items SET transactions_cursor = NULL;"
    psql "$DATABASE_URL" -c "UPDATE accounts SET last_refreshed_at = NULL;"
    # then press Refresh in the app (POST /api/accounts/refresh needs the session cookie)

Full validation at the end:

    npm run lint
    npm test
    npm run build      # expect all routes to compile; PLAID_ENV must be set or the
                       # build intentionally fails during page-data collection (see
                       # docs/plans/net-worth-coverage-aware-history.md for precedent)
    npm run dev        # then verify the browser scenarios in Validation and Acceptance

Expected test outcome: all pre-existing suites stay green; the three new files add roughly 25–35 passing cases. If `sync-transactions.test.ts` fails after Milestone 1, the likely cause is an assertion enumerating the exact insert payload — extend the expected object with `categoryDetailed` rather than loosening the assertion.

Commit at each milestone boundary with a message naming the milestone, so the plan's Progress section and git history stay in step.

## Validation and Acceptance

The feature is accepted when all of the following are observable:

First, data: after the Milestone 1 backfill, `SELECT count(*) FROM transactions WHERE category_detailed IS NULL` returns (near) zero, and the category spot-check query in Milestone 1 shows distinct detailed rows for restaurants vs groceries and for credit-card payments vs other loan payments.

Second, the model: `npm test` passes, and the reconciliation test in `src/__tests__/cashflow.test.ts` demonstrates on a hand-computed fixture that a credit-card payment changes no total, an investment transfer lands in savings, and a withdrawal from investments reduces savings.

Third, the API: a logged-in request to `/api/analytics/cashflow?months=3` returns three months, each month's `spendingByCategory` sums to its `spending`, and no savings- or internal-classified key ever appears in `spendingByCategory`.

Fourth, the UI: on the Analytics destination, the four KPI tiles answer the four questions for a selectable month; the month is always named on screen; the trend chart shows income/spending/savings side by side per month; and the two headline bugs are visibly gone (no "Loans" bar inflated by card payments, no "Transfer Out" bar at all — investment transfers surface only in Saved).

Fifth, hygiene: `npm run lint` and `npm run build` pass, and `SpendingChart.tsx` is deleted with no dangling imports (`grep -rn "SpendingChart" src` returns nothing).

## Idempotence and Recovery

The migration is additive (one nullable column) and journaled; re-running `npm run db:migrate` is a no-op once applied. Never run `npm run db:push` — it would drop the RLS policies that exist only in the journaled SQL (see Surprises).

The backfill is safely repeatable: clearing cursors and re-syncing rewrites rows idempotently via the `transaction_id` upsert, and the privacy exclusion filter re-applies on every pass. If a re-sync is interrupted, the stored cursor resumes from Plaid's last page; in the worst case clear the cursors again and re-refresh. The refresh endpoint's 6-per-hour rate limit is the only throttle to be aware of when retrying.

The UI change is a pure replacement in one branch of `renderContent()`; reverting the page edit and restoring `SpendingChart.tsx` from git restores the old behavior exactly. Rows the backfill cannot reach (older than Plaid's retained history) keep `category_detailed = NULL` and are handled by the classifier's primary-prefix fallback and, when both fields are null, by the direction rule — degraded label granularity, never a wrong flow total in the four-flow partition's terms.

## Artifacts and Notes

The reconciliation fixture that anchors the whole model (used in both the unit test and the route test):

    paycheck            -4200.00  INCOME_WAGES                                  → income
    groceries            +350.00  FOOD_AND_DRINK_GROCERIES                      → spending
    restaurants          +412.33  FOOD_AND_DRINK_RESTAURANTS                    → spending
    rent                +1800.00  RENT_AND_UTILITIES_RENT                       → spending
    card payment        +1850.00  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT             → internal
    card-side credit    -1850.00  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT             → internal
    brokerage transfer  +1000.00  TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS  → savings
    venmo out            +120.00  TRANSFER_OUT_OTHER_TRANSFER_OUT               → spending

    income      = 4200.00
    spending    = 350 + 412.33 + 1800 + 120 = 2682.33
    savings     = 1000.00
    netCashFlow = 4200.00 − 2682.33 = 1517.67

Known limitations, stated so nobody rediscovers them as bugs: pre-tax 401(k) contributions never appear in bank transactions, so "Saved" means post-tax savings; a contribution into a linked savings account from an unlinked external account is invisible on the sending side and classified internal on the receiving side, so it undercounts Saved (revisit if it shows up in practice); rows older than Plaid's retained history keep primary-only categories.

## Interfaces and Dependencies

No new packages. Recharts (already a dependency) renders the charts; Drizzle ORM queries the existing tables; Vitest runs the tests.

In `src/lib/db/schema.ts`, the `transactions` table gains:

    categoryDetailed: text("category_detailed"),

In `src/lib/cashflow.ts` (new, pure, importable from client and server):

    export type FlowType = "income" | "spending" | "savings" | "internal";

    export interface ClassifiableTransaction {
      amount: string;                    // Plaid sign convention: positive = outflow
      category: string | null;           // Plaid primary, e.g. "FOOD_AND_DRINK"
      categoryDetailed: string | null;   // Plaid detailed, e.g. "FOOD_AND_DRINK_RESTAURANTS"
      accountType: string;               // accounts.type: depository | credit | investment | loan
      accountSubtype: string | null;     // accounts.subtype: checking | savings | ...
    }

    export function classifyTransaction(txn: ClassifiableTransaction): FlowType;

    export interface CashflowCategoryTotal {
      key: string;                       // detailed ?? primary ?? "UNCATEGORIZED"
      primary: string;                   // primary ?? "UNCATEGORIZED"
      total: string;                     // "412.33"
    }

    export interface CashflowMonth {
      month: string;                     // "2026-08"
      partial: boolean;
      income: string;
      spending: string;
      savings: string;
      netCashFlow: string;
      spendingByCategory: CashflowCategoryTotal[];
    }

    export interface CashflowRow extends ClassifiableTransaction {
      date: string;                      // "2026-08-13"
      pending: boolean;
    }

    export function aggregateCashflow(
      rows: CashflowRow[],
      options: { months: number; today: string }
    ): CashflowMonth[];

    export function labelForCategoryKey(key: string): string;

In `src/app/api/analytics/cashflow/route.ts` (new): `export async function GET(request: NextRequest)` returning `{ months: CashflowMonth[] }`, authenticated with `getUserId`, queried under `withUser`.

In `src/components/dashboard/CashflowPanel.tsx` (new): `export function CashflowPanel({ refreshKey }: { refreshKey?: number })`.

In `src/app/page.tsx`: the analytics branch renders `CashflowPanel` (personal mode only) and no longer imports `SpendingChart`. `src/components/dashboard/SpendingChart.tsx` is deleted.
