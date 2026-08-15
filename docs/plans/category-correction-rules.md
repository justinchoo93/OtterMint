# User-owned category correction rules and cash-flow drilldown

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `docs/PLANS.md` from the repository root. A contributor should be able to implement and verify the feature with only this file and the current working tree.


## Purpose / Big Picture

OtterMint's cash-flow analytics classify every Plaid transaction into exactly one of income, spending, savings, or internal plumbing, and the dashboard charts those totals per month. The classification trusts Plaid's category labels, and Plaid is sometimes wrong: in production, three Chase transactions named "Manual CR-Bkrg" — money moved *from* a brokerage *into* checking — arrive tagged `INCOME_CONTRACTOR`. The dashboard therefore overstates April 2026 income by $3,000.00 and May 2026 income by $595.00, overstates savings for those months by the same amounts (a brokerage withdrawal should *subtract* from net savings), and silently omits $3,595.00 of withdrawals from the investment-performance flow extraction. There is currently no mechanism anywhere in the codebase to disagree with Plaid, and no way to even see the line items behind the Income and Saved numbers without querying the production database by hand.

After this work, two things exist that do not today. First, a correction-rules layer: a small, tested list of pattern-to-category rules that is applied to every transaction row the application reads — the two analytics endpoints via a single shared query helper, and the two display surfaces (the Recent Transactions feed's API and the shared-link API) via the same pure function — so a Plaid mistake is fixed once, retroactively, and for every future transaction matching the pattern — without touching the raw data Plaid wrote and without any database migration or backfill. The seeded first rule corrects "Manual CR-Bkrg" to an investment-funds withdrawal. Second, a drilldown: clicking the Income or Saved tile on the dashboard's Cash Flow panel lists the dated line items that make up that month's number, so the next miscategorization is visible to a human eyeball instead of requiring SQL.

A human can demonstrate the result: open the dashboard's Analytics view, select April 2026 in the Cash Flow panel, and see Income $16,064.86 (previously $19,064.86) and Saved $6,905.28 (previously $9,905.28); click the Income tile and see eleven dated line items — salary deposits, interest, and no "Manual CR-Bkrg" — and click the Saved tile and see the month's brokerage contributions listed with the corrected withdrawal subtracting.


## Progress

- [x] (2026-08-15) Researched the classifier, both analytics routes, the sync overwrite behavior, the panel, the test idioms, and the production data on the NAS. Wrote this plan.
- [x] (2026-08-15) Load-bearing assumption validation: four assumptions surfaced; two resolved by the user (scope widened to the display surfaces; CR-Bkrg semantics confirmed by the account owner), two accepted as residual risks with mitigations (see Decision Log).
- [x] (2026-08-15) Acceptance-criteria numbers validated: a fresh production export (435 non-pending rows) run through the proposed rule and the existing `aggregateCashflow`/`extractInvestmentFlows` reproduces every number in the Validation section exactly — April 16,064.86/6,905.28, May 14,278.03/7,710.49, June–July unchanged, three new withdrawal flows, zero INCOME rows left matching a rule pattern.
- [x] (2026-08-15 22:12Z) Milestone 1: `src/lib/category-rules.ts` with the seeded CR-Bkrg rule; 6 unit tests including the two-consumer end-to-end assertions (classifies as savings, extracts as withdrawal).
- [x] (2026-08-15 22:15Z) Milestone 2: `selectClassifiedTransactionRows` helper; both analytics routes rewired (mock chains survived as designed); `/api/transactions` and `/api/shared/[token]` map through `applyCategoryRules` with response shapes unchanged; new route tests prove a CR-Bkrg fixture lands in savings (cashflow) and withdrawals (investments). Full suite 330 passed / 41 skipped.
- [x] (2026-08-15 22:20Z) Milestone 3: `CashflowRow` widened, `CashflowLineItem` added, `aggregateCashflow` emits date-sorted `incomeItems`/`savingsItems`; 3 new unit tests (display signs, sorting, pending/internal exclusion). Suite 333 passed.
- [x] (2026-08-15 22:25Z) Milestone 4: Income/Saved tiles are toggle buttons (`aria-pressed`), `LineItemList` renders date/name/category·account/amount with withdrawals in red, drilldown resets on month change; 5 new component tests. Suite 338 passed.
- [ ] Milestone 5: gate + deploy. (Completed 2026-08-15 22:32Z: full gate green — 338 passed / 41 skipped, tsc clean, lint clean except the known pre-existing `sync-holdings.ts` warning, build compiles; fresh production export through the real shipped modules reproduces the acceptance table exactly, April income drilldown = 9 salary/interest items with no CR-Bkrg, tripwire 0; pushed as e4dff10 and deployed via `scripts/deploy.sh`, health check `{"status":"ok","db":"ok"}`. Remaining: Justin eyeballs the deployed dashboard — April Income $16,064.86 / Saved $6,905.28, drilldowns, and the feed showing CR-Bkrg as "transfer in".)


## Surprises & Discoveries

Pre-seeded from research; add implementation discoveries below.

- Observation: Production contains exactly three misclassified rows, all named "Manual CR-Bkrg", all on Chase checking accounts, all tagged `INCOME_CONTRACTOR`: 2026-04-21 −$1,000.00, 2026-04-29 −$2,000.00, 2026-05-05 −$595.00 (Plaid sign convention: negative = money arrived). Their mirror image, "Manual DB-Bkrg MM/DD" debits, are correctly tagged `TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS`. CR = credit from brokerage, DB = debit to brokerage; the CR rows are brokerage withdrawals, not contractor income.
  Evidence: production query 2026-08-15 over all 437 transactions; the full list of `INCOME_*` names contains only salary, interest, and these three rows.
- Observation: One production row is uppercase — "MANUAL DB-BKRG 08/14" — so any name-matching rule must be case-insensitive.
  Evidence: same production query.
- Observation: A database-side fix would not survive: all four write paths in `src/lib/sync-transactions.ts` re-write `category`/`categoryDetailed` from Plaid's answer on every sync via `onConflictDoUpdate`. This forces the correction to live in application code, not data.
  Evidence: the `set: { ..., category: txn.personal_finance_category?.primary ?? null, ... }` blocks at lines 55–66 and 95–106.
- Observation: Correcting only the flow classification (income → savings) would not fix investment performance. `extractInvestmentFlows` in `src/lib/investment-performance.ts` first gates on `classifyTransaction(row) === "savings"` and then switches on `row.categoryDetailed` equaling the investment-funds detailed values, so a row with a corrected flow but an uncorrected category falls through both branches and stays invisible. The correction must rewrite the category itself before any consumer sees the row.
  Evidence: lines 96–110 of `src/lib/investment-performance.ts`.
- Observation: Both analytics routes hand-roll the identical three-table join (`transactions ⋈ accounts ⋈ plaid_items`) selecting the same classifiable fields. Factoring it into one helper is both the deduplication and the guarantee that every consumer gets corrected rows — forgetting to apply the rules becomes impossible rather than merely discouraged.
  Evidence: `src/app/api/analytics/cashflow/route.ts` lines 29–50 and `src/app/api/analytics/investments/route.ts` lines 97–112.
- Observation: Two user-visible surfaces outside analytics read raw transaction categories and would have contradicted the corrected analytics on the same screen: `src/app/api/transactions/route.ts` (feeds `TransactionsFeed.tsx`, which renders `formatCategory(txn.category)`) and the shared-link payload in `src/app/api/shared/[token]/route.ts` (selects `transactions.category` at line 160). Surfaced by the load-bearing analysis; the user chose to correct everywhere.
  Evidence: `grep -rn "from(transactions)" src/app` returns exactly four route files — the two analytics routes and these two.
- Observation: The corrected rows barely move the investments view in practice: attribution and XIRR only trust flows inside the snapshot window, which begins 2026-07-04, and the default 90-day fetch window reaches back only to mid-May — all three CR-Bkrg rows (April 21/29, May 5) predate both. They appear in the `flows` array only when the user selects a range long enough to include them. The fix is still required for correctness whenever the range covers them.
  Evidence: `user_net_worth_snapshots` earliest row 2026-07-04 (production, 2026-08-14); `days` defaults to 90 in `src/app/api/analytics/investments/route.ts`.


## Decision Log

- Decision: Correct categories at read time in application code (a rules module applied by a shared query helper), not by editing the database and not at sync-write time.
  Rationale: sync's `onConflictDoUpdate` re-writes Plaid's categories on every refresh, so a data fix is undone at the next sync; a write-time fix is not retroactive without a cursor-reset backfill on the NAS (a hand-verified production operation this deployment environment makes expensive — the dev machine has no reachable database at all) and it destroys Plaid's raw answer, hurting debuggability. Read-time correction is retroactive the moment it deploys, needs no migration, and is reversible by editing code.
  Date/Author: 2026-08-15 / Claude + Justin.
- Decision: Rules live as a constant list in `src/lib/category-rules.ts`, not in a database table with a management UI.
  Rationale: single-user app; adding a rule is a five-line tested code change and a deploy. A DB table plus settings UI changes nothing architecturally (the choke point stays) and can be added later if rule churn ever justifies it. Minimum code that solves the problem.
  Date/Author: 2026-08-15 / Claude + Justin.
- Decision: A rule rewrites both `category` and `categoryDetailed` (for CR-Bkrg: `TRANSFER_IN` / `TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS`), matches on the transaction `name` with a case-insensitive regular expression, and does not filter on account type or institution.
  Rationale: rewriting both columns keeps every downstream reading (`primaryOf` consults `category` first) consistent; production shows the name string is specific enough, and one row proves case varies. The corrected detailed value makes `classifyTransaction` rule 3 classify the row as savings (its negative amount subtracts — a withdrawal) and makes `extractInvestmentFlows` emit a withdrawal, with zero changes to either consumer.
  Date/Author: 2026-08-15 / Claude + Justin.
- Decision: The shared helper drops the SQL-level `pending = false` filter the cashflow route used; both pure libraries already skip pending rows.
  Rationale: one uniform helper for both routes; `aggregateCashflow` (line 209 of `src/lib/cashflow.ts`) and `extractInvestmentFlows` (line 99 of `src/lib/investment-performance.ts`) each begin by skipping pending rows, so behavior is unchanged and the pending policy lives in exactly one layer (the pure functions) instead of two.
  Date/Author: 2026-08-15 / Claude.
- Decision: Drilldown covers Income and Saved only, not Spending.
  Rationale: Spending already has a per-category breakdown chart in the panel; Income and Saved are the opaque single numbers that hid this bug.
  Date/Author: 2026-08-15 / Justin (scope agreed in conversation).
- Decision: The correction applies to every category-reading surface, not just analytics: `/api/transactions` and `/api/shared/[token]` also map their rows through `applyCategoryRules`.
  Rationale: load-bearing analysis found that otherwise a CR-Bkrg row would display as "Income" in the Recent Transactions feed on the same dashboard whose Cash Flow panel counts it as savings. The user chose "correct everywhere". The two display routes get a thin `.map(applyCategoryRules)` over the unit-tested pure function; no new route-test files for them (they have none today, and the mapping carries no logic of its own — the type-checker proves the wiring, the unit tests prove the behavior).
  Date/Author: 2026-08-15 / Justin (load-bearing outcome).
- Decision: The CR-Bkrg premise is confirmed, and the two unverifiable-future assumptions are accepted as residual risks with mitigations.
  Rationale: the account owner confirmed the three "Manual CR-Bkrg" credits are brokerage→checking withdrawals, mirrors of the "Manual DB-Bkrg" contributions. Residual risk 1 — the pattern could someday match a non-withdrawal: accepted without guard fields because the signed-sum design self-corrects the plausible case (a positive-amount CR-Bkrg clawback would count as a contribution exactly offsetting the erroneous withdrawal, netting to the true answer). Residual risk 2 — Chase/Plaid could rename the memo, silently reverting the fix on a future re-sync: accepted because the Income drilldown built in Milestone 4 is the detection mechanism (a reappearing CR-Bkrg income line is visible on sight), and the pre-deploy production check asserts no `INCOME_*` row matches a rule pattern at ship time.
  Date/Author: 2026-08-15 / Justin + Claude (load-bearing outcome).
- Decision: `CashflowRow` gains three required fields (`name`, `merchantName`, `accountName`) rather than optional ones.
  Rationale: the route always supplies them; optional fields would force fallback rendering for a state that cannot occur. Test fixtures get a mechanical three-field addition.
  Date/Author: 2026-08-15 / Claude.


## Outcomes & Retrospective

(2026-08-15, shipped) The purpose is met: OtterMint can now disagree with Plaid. The correction layer is one pure module + one query choke point + two thin display-route maps, zero schema changes, zero data operations — the entire fix deployed as application code and was retroactive on arrival. Measured impact: April 2026 income −$3,000.00 and savings −$3,000.00, May income −$595.00 and savings −$595.00, and $3,595.00 of previously invisible brokerage withdrawals now reach the investment-flow extraction. The drilldown turns the next miscategorization from a NAS SQL session into a glance.

Process notes worth keeping: (a) the load-bearing pass earned its cost — it caught that two non-analytics surfaces would have contradicted the corrected numbers on the same screen, which widened the design from "analytics choke point" to "choke point + pure-function maps at the remaining readers"; (b) validating the acceptance table by running the production export through the real modules before deploy meant the deploy step carried no numerical uncertainty at all; (c) main moved underneath this work mid-implementation (the allocation/dividends feature landed between research and Milestone 2) — the order-based investments-route mock survived because the helper preserved the flows select's queue position, exactly the compatibility the plan had specified as a constraint. Remaining: Justin's eyeball of the deployed dashboard, and the two accepted residual risks (pattern false-positives, vendor name drift) stand with their documented mitigations.


## Context and Orientation

OtterMint is a single-user Next.js (App Router) personal-finance dashboard. Bank data arrives from Plaid (a financial-data aggregator) and is stored in Postgres via drizzle-orm. The dev machine has **no reachable database** — `.env` points at localhost:5432 where nothing listens — so all development is test-driven, and data verification happens against the production Postgres running in the `ottermint-db-1` container on the OtterHolt NAS, reachable with `ssh otterholt`. Deployment is `scripts/deploy.sh`, which builds `origin/main` on the NAS; this plan requires **no schema migration**, which removes the riskiest step of previous deployments.

The pieces this plan touches:

`src/lib/cashflow.ts` is the pure cash-flow brain. `classifyTransaction` partitions a transaction into `income | spending | savings | internal` using ordered rules over Plaid's category columns (`category` is the primary, e.g. `INCOME`; `categoryDetailed` the specific, e.g. `INCOME_SALARY`). Plaid's sign convention is: positive amount = money left the account. `aggregateCashflow(rows, {months, today})` buckets rows into calendar months and returns `CashflowMonth` objects with string-decimal totals (`income`, `spending`, `savings`, `netCashFlow` = income − spending, and `spendingByCategory`). Savings is a *signed* sum: contributions (positive amounts, money out of checking) add; withdrawals (negative amounts) subtract. `labelForCategoryKey` prettifies a category key by stripping its primary prefix ("INCOME_SALARY" → "Salary").

`src/app/api/analytics/cashflow/route.ts` authenticates (`getUserId`), opens a row-level-security-scoped transaction (`withUser` from `src/lib/db/with-user.ts`, which sets the Postgres session variable RLS policies key on), selects the classifiable fields from `transactions` joined to `accounts` and `plaid_items`, and returns `aggregateCashflow`'s output as JSON.

`src/app/api/analytics/investments/route.ts` does the same dance for investment performance; among its five selects is a `flowRows` select identical in shape to the cashflow route's. It feeds `extractInvestmentFlows` in `src/lib/investment-performance.ts`, which keeps rows that classify as savings and whose `categoryDetailed` is `TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS` (contribution) or `TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS` (withdrawal).

`src/components/dashboard/CashflowPanel.tsx` is the client panel: a month selector, four `KpiTile`s (Income, Spending, Saved, Net cash flow), a monthly trend bar chart, and a spending-by-category chart. It fetches `/api/analytics/cashflow?months=6`.

`src/lib/sync-transactions.ts` writes transactions from Plaid and **overwrites `category`/`categoryDetailed` on every sync** — the fact that forces this plan's read-time design. It is not modified by this plan.

Tests are vitest. Pure-lib tests construct row fixtures directly (`src/__tests__/cashflow.test.ts`). Route tests (`src/__tests__/cashflow-route.test.ts`) mock `withUser` with a fake `tx` whose `select().from().innerJoin().innerJoin().where()` chain resolves fixture rows from a single `mockWhere` — a shape the new helper must preserve. Panel tests (`src/__tests__/cashflow-panel.test.tsx`) mock recharts and `fetch`, and use testing-library.

The term "choke point" in this plan means: the single function through which every analytics read of transaction rows passes, so a correction applied there is applied everywhere.


## Plan of Work

Milestone 1 creates the rules module. Milestone 2 creates the shared helper, applies the rules there, and rewires both routes. Milestone 3 adds line-item data to the aggregation. Milestone 4 adds the drilldown UI. Milestone 5 gates and deploys. Each milestone leaves the suite green.


### Milestone 1 — the category-rules module

Create `src/lib/category-rules.ts`, a pure module (no server-only imports, mirroring the header comment style of `src/lib/cashflow.ts`). It defines:

    export interface CategoryRule {
      /** Case-insensitive test against the transaction's `name`. */
      pattern: RegExp;
      /** Replacement Plaid primary category. */
      category: string;
      /** Replacement Plaid detailed category. */
      categoryDetailed: string;
      /** Why this rule exists — shown to future maintainers, not users. */
      reason: string;
    }

    export const CATEGORY_RULES: CategoryRule[] = [
      {
        pattern: /\bCR-BKRG\b/i,
        category: "TRANSFER_IN",
        categoryDetailed: "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
        reason:
          "Chase manual brokerage credits ('Manual CR-Bkrg') are money returning from a brokerage; Plaid tags them INCOME_CONTRACTOR.",
      },
    ];

    export function applyCategoryRules<T extends {
      name: string;
      category: string | null;
      categoryDetailed: string | null;
    }>(row: T): T;

`applyCategoryRules` returns the row unchanged (same object identity is fine) when no rule's pattern matches `row.name`, and a shallow copy with `category` and `categoryDetailed` replaced when one does. First matching rule wins; document that ordering contract in a comment. Do not mutate the input.

Create `src/__tests__/category-rules.test.ts` covering: the production CR-Bkrg fixture (name "Manual CR-Bkrg", category "INCOME", detailed "INCOME_CONTRACTOR", amount "-1000.00") comes back `TRANSFER_IN` / `TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS`; matching is case-insensitive ("MANUAL CR-BKRG" also corrected); non-matching names — including the look-alike "Manual DB-Bkrg 04/06" and "MANUAL DB-BKRG 08/14" — pass through untouched with the original object's values; the input object is not mutated; and the corrected row now classifies as savings and extracts as a withdrawal (import `classifyTransaction` and `extractInvestmentFlows` and assert both behaviors end to end on the fixture, since those two consumers are the entire point of the rule).

Acceptance: `npx vitest run src/__tests__/category-rules.test.ts` passes; the full suite still passes.


### Milestone 2 — the shared query helper, applied at the choke point

Create `src/lib/db/classified-transactions.ts`:

    import { and, eq, gte } from "drizzle-orm";
    import { transactions, accounts, plaidItems } from "@/lib/db/schema";
    import type { WithUserTx } from "@/lib/db/with-user";
    import { applyCategoryRules } from "@/lib/category-rules";

    export interface ClassifiedTransactionRow {
      amount: string;
      date: string;
      name: string;
      merchantName: string | null;
      category: string | null;
      categoryDetailed: string | null;
      pending: boolean;
      accountType: string;
      accountSubtype: string | null;
      accountName: string;
    }

    export async function selectClassifiedTransactionRows(
      tx: WithUserTx,
      userId: string,
      since: string
    ): Promise<ClassifiedTransactionRow[]>;

The function runs the canonical join — `transactions` inner-joined to `accounts` on `accountId` and to `plaidItems` on `plaidItemId`, filtered to `plaidItems.userId = userId` and `transactions.date >= since` — selecting the ten fields above (`accountName` is `accounts.name`), then maps every row through `applyCategoryRules` before returning. The doc comment must state the contract: *every analytics read of transaction rows goes through this helper; that is what guarantees category corrections apply everywhere.* Keep the chain shape exactly `select → from → innerJoin → innerJoin → where` so the existing route-test mocks keep working.

Rewire `src/app/api/analytics/cashflow/route.ts`: replace the inline select with `selectClassifiedTransactionRows(tx, userId, windowStart)` (the SQL pending filter is intentionally dropped — see Decision Log). Rewire `src/app/api/analytics/investments/route.ts`: replace the `flowRows` select with `selectClassifiedTransactionRows(tx, userId, since)`. The other four selects in that route are not transaction reads and are untouched.

Correct the two display surfaces with the pure function directly (their query shapes — `orderBy`/`limit`, `inArray` scoping — don't fit the helper, and per the Decision Log they get no new route-test files). In `src/app/api/transactions/route.ts`, map each row through `applyCategoryRules` before building the `TransactionRow` result — the `getTableColumns(transactions)` select already includes `name` and `categoryDetailed`, so rows satisfy the function's constraint as-is. In `src/app/api/shared/[token]/route.ts`, add `categoryDetailed: transactions.categoryDetailed` to the transactions select (around line 160), map the rows through `applyCategoryRules`, and then project back to the original five response fields so the shared payload's shape is unchanged — the corrected `category` is what ships. After this, a CR-Bkrg row renders in the Recent Transactions feed as "transfer in" (via `formatCategory`'s lowercase fallback) instead of "Income".

Update `src/__tests__/cashflow-route.test.ts`: add `name`, `merchantName`, `accountName` to the fixture rows, and add one CR-Bkrg fixture row (name "Manual CR-Bkrg", category "INCOME", detailed "INCOME_CONTRACTOR", amount "-500.00", checking) plus assertions that income does **not** include the $500 and savings *decreases* by $500 relative to the fixture's contribution — proving the correction through the real route code path. Update `src/__tests__/investments-route.test.ts` (or the equivalent investments route test file) the same way if its flow fixtures need the new fields, and add an assertion that a CR-Bkrg fixture row surfaces in `flows` as a withdrawal.

Acceptance: both analytics route test files pass; the full suite passes; the two analytics routes no longer hand-roll the transactions join (`grep -rn "from(transactions)" src/app/api/analytics` returns nothing); `grep -rln "applyCategoryRules" src/app` lists exactly the two display routes.


### Milestone 3 — line items in the aggregation

In `src/lib/cashflow.ts`: extend `CashflowRow` with required `name: string`, `merchantName: string | null`, `accountName: string`. Add:

    export interface CashflowLineItem {
      date: string;
      /** Display-signed: income received is positive; savings contributions
          positive, withdrawals negative. */
      amount: string;
      name: string;
      merchantName: string | null;
      /** categoryDetailed ?? category ?? "UNCATEGORIZED" — feed to
          labelForCategoryKey for display. */
      categoryKey: string;
      accountName: string;
    }

Extend `CashflowMonth` with `incomeItems: CashflowLineItem[]` and `savingsItems: CashflowLineItem[]`. In `aggregateCashflow`, when a non-pending row classifies as income push a line item with the sign flipped (Plaid inflows are negative; display positive), and when it classifies as savings push one with the raw signed amount (contribution positive, withdrawal negative). Sort each month's lists by date ascending, then by name for a stable order. Amounts format through the existing `fromCents`.

Update `src/__tests__/cashflow.test.ts` fixtures with the three new fields (mechanical), and add tests: an income row yields a positive-amount line item with the right key and account; a savings withdrawal yields a negative-amount item; pending and internal rows yield no items; items are sorted; months with no activity have empty arrays. Update `src/__tests__/cashflow-route.test.ts` expectations if they assert whole-month object shapes.

Acceptance: `npx vitest run src/__tests__/cashflow.test.ts` passes; full suite passes.


### Milestone 4 — the drilldown UI

In `src/components/dashboard/CashflowPanel.tsx`: add state `drilldown: "income" | "savings" | null` (reset to `null` when the selected month changes). Make the Income and Saved `KpiTile`s clickable — render them as buttons with `aria-pressed` reflecting the active state; clicking toggles, and only one is active at a time. When active, render a section between the KPI grid and the Monthly Trend chart titled "Income — {month label}" or "Saved — {month label}", listing that month's `incomeItems` or `savingsItems`: date, name (fall back to `merchantName` only if you find real data where name is empty — production says name is always set), the category label via `labelForCategoryKey(item.categoryKey)`, the account name, and the amount right-aligned in the panel's mono font, negative amounts in the red accent (`var(--accent-red)`), positive in the default text color. An empty list renders the panel's existing dashed-border empty state with "No line items for this month". Match the surrounding Tailwind/CSS-variable idiom; no new dependencies.

Extend `src/__tests__/cashflow-panel.test.tsx`: the `month()` fixture builder gains `incomeItems`/`savingsItems`; tests cover — clicking Income reveals its items (names and amounts visible), clicking Saved switches the section, clicking the active tile again hides it, a withdrawal renders with a leading minus, and changing the month selector resets the drilldown.

Acceptance: `npx vitest run src/__tests__/cashflow-panel.test.tsx` passes; full suite passes.


### Milestone 5 — gate, deploy, verify in production

Run the full gate from the repo root: `npx vitest run` (expect all passing, count recorded in Progress), `npx tsc --noEmit` (clean), `npm run lint` (clean except the known pre-existing `sync-holdings.ts` warning), `npm run build` (all routes compile). Before deploying, re-verify the acceptance numbers by exporting production rows and running them through the *built* classification path (see Concrete Steps). Commit to `main`, push, and run `scripts/deploy.sh`. No migration step exists for this deploy. After the NAS reports healthy, Justin opens the dashboard: April 2026 shows Income $16,064.86 / Saved $6,905.28, May shows $14,278.03 / $7,710.49, June–July are unchanged, and the Income drilldown for April lists no "Manual CR-Bkrg" while the Saved drilldown shows the corrected withdrawals subtracting. (August is the live partial month; its numbers move with new transactions and are verified only for the absence of CR-Bkrg income items.)


## Concrete Steps

All commands run from the repository root, `/Users/justin/code/personal/OtterMint`, unless stated.

Per-milestone test runs are given in each milestone. The full gate is:

    npx vitest run
    npx tsc --noEmit
    npm run lint
    npm run build

To re-verify acceptance numbers against live data before deploying, export the rows from the NAS (read-only query) and run them through the local libs with tsx:

    ssh otterholt 'docker exec -i ottermint-db-1 psql -U postgres -d ottermint -At' <<'SQL' > /tmp/txns.json
    SELECT coalesce(json_agg(row_to_json(r)), '[]'::json)::text FROM (
      SELECT t.date::text AS date, t.amount::text AS amount, t.name,
             t.merchant_name AS "merchantName", t.category,
             t.category_detailed AS "categoryDetailed", t.pending,
             a.type AS "accountType", a.subtype AS "accountSubtype",
             a.name AS "accountName"
      FROM transactions t
      JOIN accounts a ON a.account_id = t.account_id
      JOIN plaid_items p ON p.id = a.plaid_item_id
      WHERE t.pending = false ORDER BY t.date DESC
    ) r;
    SQL

then a small tsx script that maps the rows through `applyCategoryRules` and `aggregateCashflow` and prints each month's income/savings — expected output is the acceptance table below.

Deploy:

    git push origin main
    ./scripts/deploy.sh

The deploy script builds origin/main on the NAS and health-checks `http://127.0.0.1:3000/api/health` inside the container.


## Validation and Acceptance

The suite-level acceptance is that every test run listed above passes, with new tests that fail before their milestone's change and pass after (the route-level CR-Bkrg test in Milestone 2 is the key one: it fails against the pre-helper route because the $500 fixture credit lands in income, and passes after because the rule reroutes it to savings).

The data-level acceptance, computed from the production export of 2026-08-15 (437 transactions; data begins 2026-04-05) and to be re-verified against a fresh export before deploy:

    month     income        savings       (previously)
    2026-04   16064.86      6905.28       (19064.86 / 9905.28)
    2026-05   14278.03      7710.49       (14873.03 / 8305.49)
    2026-06   14271.56      11887.10      (unchanged)
    2026-07   18859.22      10000.00      (unchanged)

`netCashFlow` for April and May drops by exactly the corrected amounts ($3,000.00 and $595.00) since spending is untouched. For investment performance, requesting `/api/analytics/investments?days=730` yields three new withdrawal entries in `flows`: $1,000.00 on 2026-04-21, $2,000.00 on 2026-04-29, $595.00 on 2026-05-05; the default 90-day view is unchanged because those dates fall outside it, and attribution/XIRR are unchanged because the trusted snapshot window begins 2026-07-04.

The UI-level acceptance is behavioral: on the deployed dashboard, the April Income drilldown lists exactly the salary and interest deposits (no CR-Bkrg), the Saved drilldown lists the brokerage transfers, amounts and dates match the tables above, toggling works as described in Milestone 4, and a month with no line items shows the empty state. The Recent Transactions feed, scrolled or limited to reach the April/May rows, shows "Manual CR-Bkrg" categorized "transfer in", not "Income", and a shared link with transactions included carries `category: "TRANSFER_IN"` for those rows.


## Idempotence and Recovery

Every step is additive application code guarded by tests; re-running any test or build command is harmless. There is no migration and no data operation, so there is nothing to roll back in the database — reverting the commit and redeploying restores the previous behavior exactly. The production export query is read-only. If `scripts/deploy.sh` fails mid-deploy, re-running it is safe (it rebuilds from origin/main). If a rule ever proves wrong, delete or amend its entry in `CATEGORY_RULES` and redeploy; the raw Plaid categories were never modified.


## Artifacts and Notes

The production evidence for the misclassification (query of 2026-08-15, all names carrying an `INCOME_*` category):

    INCOME_CONTRACTOR      | Manual CR-Bkrg                    | 3 rows | $3,595.00
    INCOME_INTEREST_EARNED | Interest Paid / INTEREST PAYMENT  | 8 rows |   $453.44
    INCOME_SALARY          | five payroll name variants        | 28 rows| $70,162.18

The three CR-Bkrg rows: 2026-04-21 −$1,000.00, 2026-04-29 −$2,000.00 (TOTAL CHECKING), 2026-05-05 −$595.00 (PREMIER PLUS CKG). Their correctly-tagged mirrors are the "Manual DB-Bkrg MM/DD" debits (`TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS`), including one uppercase "MANUAL DB-BKRG 08/14".


## Interfaces and Dependencies

No new dependencies. The module surface at completion:

In `src/lib/category-rules.ts` (new, pure): `CategoryRule`, `CATEGORY_RULES`, `applyCategoryRules<T>(row: T): T` as specified in Milestone 1.

In `src/lib/db/classified-transactions.ts` (new, server): `ClassifiedTransactionRow`, `selectClassifiedTransactionRows(tx: WithUserTx, userId: string, since: string): Promise<ClassifiedTransactionRow[]>` as specified in Milestone 2 — the choke point.

In `src/lib/cashflow.ts` (modified): `CashflowRow` gains `name: string`, `merchantName: string | null`, `accountName: string`; new `CashflowLineItem`; `CashflowMonth` gains `incomeItems` and `savingsItems`. `classifyTransaction`, `ClassifiableTransaction`, and `labelForCategoryKey` are unchanged.

In `src/lib/investment-performance.ts`: unchanged.

In `src/app/api/analytics/cashflow/route.ts` and `src/app/api/analytics/investments/route.ts` (modified): transaction reads go through `selectClassifiedTransactionRows`.

In `src/app/api/transactions/route.ts` and `src/app/api/shared/[token]/route.ts` (modified): rows map through `applyCategoryRules` before the response is built; response shapes unchanged.

In `src/components/dashboard/CashflowPanel.tsx` (modified): drilldown state and line-item section per Milestone 4.


---

Revision note (2026-08-15): After the load-bearing analysis, the correction scope widened from analytics-only to every category-reading surface (`/api/transactions` and `/api/shared/[token]` added to Milestone 2), because the user judged a same-screen contradiction between the feed and the Cash Flow panel unacceptable. The CR-Bkrg semantics were confirmed by the account owner, and two future-vendor-behavior assumptions were accepted as residual risks with mitigations. All sections updated accordingly.
