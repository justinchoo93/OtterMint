# Add an Analytics tab: category trends, recurring charges, savings rate and year to date

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. It is maintained in accordance with `docs/PLANS.md` at the repository root.

## Purpose / Big Picture

OtterMint's Dashboard (the analytics view that `src/app/page.tsx` renders for the "Dashboard" destination) answers "how am I doing this period": net worth, income, spending, saved, cash flow by month and spending by category. It cannot answer "what is changing, and what repeats". After this change the sidebar has an "Analytics" destination again, and it holds four things the owner asked for on 2026-09-29. A savings-rate card shows the share of income kept over a chosen time range, one line of the monthly rate, and how the rate moved against the equal period before. A category-trends table shows, for each of the eight largest spending categories plus "Other", a row of small monthly bars, the average per month, and the change against the equal period before, sorted fastest-growing first. A year-to-date card compares January through the current month with the same months of the previous year, figure by figure. A recurring-charges table lists every merchant that charges on a steady schedule, with cadence, amount, last and next dates, and notes when a charge is new, its price went up, or its amount varies.

The design is the private canvas at https://claude.ai/artifact/BqCLEaTd9dAx9sfRVm578b (a desktop board at 1440 px and a phone board at 390 px). Its boards are committed as `docs/design/analytics-tab/source/*.dc.html` and rendered to static `desktop.html` and `phone.html` in Milestone 1, so a reader of this repository can see the target without the canvas.

To see it working after implementation: sign in, click "Analytics" in the sidebar, and see the four cards. Press "6M" and the savings-rate line and the category bars shrink to six months while the year-to-date card and the recurring table stay put.

## Progress

- [x] (2026-09-29 19:05Z) Milestone 1: design reference committed under `docs/design/analytics-tab/` (sources, static renders with zero leftover holes, README with intended deviations); `render.mjs` takes the design folder as an argument.
- [x] (2026-09-29 19:20Z) Milestone 2: `toDate` on every `CashflowMonth`; `asToDate`, `likeForLikePrior`, `monthRate`, `windowRate`, `savingsRateSummary`, `rateScale`, `categoryTrends`, `yearToDate` and `formatSignedPoints`, unit tested (cashflow, analytics-model and format suites pass).
- [x] (2026-09-29 19:25Z) Milestone 3: `detectRecurringCharges` with its bands, steadiness and bill rules; `GET /api/analytics/recurring`; 17 tests across `recurring.test.ts` and `recurring-route.test.ts`.
- [x] (2026-09-29 19:30Z) Milestone 4: `TrendsView`, `SavingsRateCard`, `SavingsRateChart`, `CategoryTrendsCard` with `MiniColumns`, `YearToDateCard`, `RecurringChargesCard`; the Analytics nav item is back; 10 tests in `trends-view.test.tsx`.
- [x] (2026-09-29 19:35Z) Milestone 5: both harness files serve data from Jan 2025 with `toDate` and answer `/api/analytics/recurring`; the page was screenshotted at 1440 and 390 with the prod fixtures and compared with the renders (section order, hero, line, nine trend rows, year card, twelve recurring rows all present; no horizontal overflow; range buttons 44 px on phones; Tab reaches the range buttons, the chart and both details summaries with the 2 px focus ring; no page errors). One fix: twelve month labels collided on the phone chart, so the axis now thins colliding labels (`interval="equidistantPreserveStart"`) and shows every other month at 390 px.
- [x] (2026-09-29 19:45Z) Milestone 6, production check: the owner's last thirteen months of classified rows (1,388) were exported read-only and run through `aggregateCashflow`, `categoryTrends`, `yearToDate` and `detectRecurringCharges`; findings below. Merged to main after the check.
- [ ] Milestone 6, deploy: waiting for the owner's go-ahead (`scripts/deploy.sh` from a checkout at `origin/main`), then the owner confirms the page.

## Surprises & Discoveries

- Observation: production transactions start on 2025-01-01, not 2026-01-01 as `docs/plans/analytics-redesign.md` recorded on 2026-09-27; a statement backfill added 2025.
  Evidence (2026-09-29, read-only over ssh): `kchoosun@gmail.com|2025|1322|2025-01-01|2025-12-31` and `kchoosun@gmail.com|2026|882|2026-01-01|2026-09-25`. So every range up to 1Y has a full prior period today, and a 24-month "All" reaches back to October 2024, of which only January 2025 onward has data.

- Observation: the backfilled rows (before about mid-April 2026, when the Plaid connections took over) carry bank descriptors with no merchant name and often no category. A merchant therefore appears under two keys: "NETFLIX.COM 866-579-7172 CA" until March 2026 and, had it continued, "Netflix" after. Detection still finds every active subscription from the Plaid era (three or more charges since April), but `firstDate` and `count` start at the boundary and a price change across it is invisible. Category trends over windows that include the backfill months show "Uncategorized" as the second-largest row (average $1,901 a month over the last twelve months, all before May 2026).
  Evidence (2026-09-29, production rows through the pure functions): recurring found 5 charges, $3,780.57 a month, 47% of the $7,999 average complete month: Bilt Rent (monthly, varies $3,465–$3,885, since June), Xfinity $51.59, YouTube Premium $29.83, Medium $5.00, Apple $0.99. Rejected steady groups all ended at the boundary: `MEDIUM MONTHLY MEDIUM.COM CA` x8 to 2026-04-17 (continues as "Medium"), `NETFLIX.COM` x7 to 2026-03-13, `HLU*HULUPLUS` x6 to 2026-02-27, `The Hemlock Rent` x7 to 2026-04-02 (replaced by Bilt). Groceries, Amazon, Costco and Uber were rejected for varying amounts, and a weekly chiropractor ($62–$270) for the same reason. The 1Y kept rate is 48.0%; year to date shows income $129,363, spending $64,447, saved $74,719, net $64,917, highest month March ($10,974), lowest May ($2,524).
  Follow-up (outside this plan): normalize descriptor names so a backfill descriptor joins its Plaid merchant (strip ".com", store numbers, trailing city and state), and consider whether a weekly charge with a steady day but a varying amount (the chiropractor) should count as a bill.

## Decision Log

- Decision: One time-range control, sharing `ANALYTICS_RANGES` (3M, 6M, 1Y, All) with the Dashboard, defaulting to 1Y, scopes the savings-rate card and the category-trends table only. The year-to-date card and the recurring table are not scoped by it, and a caption beside the control says so.
  Rationale: the owner asked how to incorporate time ranges. A window is what makes a trend and a rate meaningful, and sharing the Dashboard's ranges keeps one model. "Year to date" is a fixed window by definition, and recurring charges describe today; hiding either behind a range would only lose information. Defaulting to 1Y gives twelve bars per category, where a trend is readable.
  Date/Author: 2026-09-29, Claude, from the owner's question about ranges and the canvas revision they saw.

- Decision: Comparisons are "the window against the equal window immediately before it", the rule the Dashboard's tiles already use, and when the window ends in the current (partial) month, the prior window's last month is counted only through the same day of the month. The year-to-date card applies the same rule to the previous year's last month.
  Rationale: comparing a partial September with a full September would understate every figure, and the Dashboard's whole-month rule was accepted only because a single partial month there never gets a comparison. Same-day counting makes the comparison like for like without hiding it. This needs a month-to-date figure per month from the API, which is an additive field (see Milestone 2).
  Date/Author: 2026-09-29, Claude.

- Decision: "Savings rate" means net cash flow divided by income (the share of income not spent), the Dashboard's "kept" figure. Transfers into savings and investments ("Saved") are shown as a second figure on the card, not as the headline.
  Rationale: the kept share is robust to how transfers are categorized, and it matches a number the owner already reads on the Dashboard tiles.
  Date/Author: 2026-09-29, Claude.

- Decision: Recurring detection runs on the server in a pure module over the last thirteen months of classified spending rows, grouped by merchant, and a charge counts as recurring only when its intervals fit one cadence and its amount is steady, except for bill categories (rent and utilities, loan payments, insurance) where a varying amount is allowed and flagged "Varies".
  Rationale: a client-side detection would need every spending row for a year, more than the items route's 500-row cap. Grouping by merchant with a steadiness test keeps groceries and restaurants, which recur weekly but vary, out of the list while keeping subscriptions and bills in.
  Date/Author: 2026-09-29, Claude.

- Decision: The owner asked on 2026-09-29 to create a worktree off main and "work on this" after seeing the canvas with the range control. The canvas at that point is the reference; later design changes go through this plan's Decision Log.
  Rationale: records what "approved" means for this plan.
  Date/Author: 2026-09-29, Claude.

## Outcomes & Retrospective

Implemented and verified on 2026-09-29 in the worktree branch `worktree-analytics-deeper`, merged to main the same day; deployment waits for the owner. The Analytics destination is back with the four cards the owner asked for, scoped by the Dashboard's range control where a window makes sense and fixed where it does not. Every figure comes from a pure, tested function (`src/lib/analytics-model.ts`, `src/lib/recurring.ts`), and the only API addition is one route plus one optional field on the cash-flow month. The database-free harness screenshots matched the design at both widths after one axis-label fix.

What the production check taught: the data has a seam in April 2026 between backfilled statement rows and Plaid rows, and every feature that groups by merchant or category feels it. The recurring list is right about what is active today, but its history starts at the seam. Filling in merchant names and categories for the backfilled rows (or normalizing descriptors) would improve this page more than any further detection rule.

Gaps: no account or category filter (the routes have no account parameter yet), and the details behind a trend row or a recurring charge are not clickable. Both are natural next steps once the owner has lived with the page.

## Context and Orientation

OtterMint is a Next.js 16 and React 19 personal-finance app with a Postgres database read through Drizzle ORM and transactions synced from Plaid. The signed-in app is one client page, `src/app/page.tsx`, which keeps an `activeDestination` in React state and renders one of four destinations: Dashboard (the `AnalyticsView` component), Accounts, Transactions and Investments. The sidebar's items come from the `NAV_ITEMS` array in that file, each with a `lucide-react` icon. There is no "Analytics" item today; it was removed on 2026-09-29 when the analytics view became the Dashboard (commit `2cfc883`).

Cash flow is the app's word for classifying each transaction into exactly one of income, spending, savings, or internal plumbing, and summing per calendar month. The pure classification and aggregation live in `src/lib/cashflow.ts`: `classifyTransaction` decides the flow, `aggregateCashflow(rows, { months, today })` returns one `CashflowMonth` per month (ascending, zero-filled), and `labelForCategoryKey` turns a Plaid category key such as `FOOD_AND_DRINK_RESTAURANTS` into "Restaurants". A `CashflowMonth` carries `month` ("YYYY-MM"), `partial` (true only for the current month), `income`, `spending`, `savings` and `netCashFlow` as decimal strings, `spendingByCategory` (key, primary, total), and the line items behind income and savings. Amounts follow Plaid's sign convention in the database (positive means money left the account); the aggregation flips income to positive.

The route `GET /api/analytics/cashflow?months=N` (`src/app/api/analytics/cashflow/route.ts`, N clamped to 24) reads the user's rows with `selectClassifiedTransactionRows(tx, userId, since)` from `src/lib/db/classified-transactions.ts`, which joins transactions to accounts and Plaid items, scopes to the user, and applies category-correction rules. Every API route wraps database work in `withUser(userId, tx => ...)` from `src/lib/db/with-user.ts` (which sets the Postgres row-level-security context), gets the user with `getUserId()` from `src/lib/auth/get-user-id.ts` (it throws an auth error that routes turn into HTTP 401 through `isAuthError`), and logs failures with `logServerError` from `src/lib/logging.ts`. A second route, `GET /api/analytics/cashflow/items`, lists the transactions behind one figure, capped at 500 rows.

The Dashboard's client model is `src/lib/analytics-model.ts`. `ANALYTICS_RANGES` defines 3M, 6M, 1Y and All (24 months). `resolvePeriod(months, { range, month })` returns the window (the range clipped to the first month with data), the period the tiles summarize, `priorMonths` (an equal-length stretch immediately before, only when data covers it), and labels: `comparisonLabel` ("Compared with the previous 6 months"), `comparisonShortLabel` ("vs prior 6 mo") and `historyStartsLabel` ("History starts Jan 2025"). `sumPeriod` totals months in integer cents. `periodDelta(current, prior, upIsGood)` returns a `Delta` with `pct`, `direction` and `good`. `rankCategories(period, prior, top)` ranks spending categories, folds the tail into "Other" with `memberKeys`, and attaches a delta per row. `monthShortLabel`, `monthLongLabel`, `monthAxisLabel` and `spanLabel` format month keys. `todayUtc()` is the UTC date string the routes use.

The Dashboard's components live in `src/components/dashboard/`: `AnalyticsView.tsx` owns the range state and the cash-flow fetch (`/api/analytics/cashflow?months=24`, once per mount and on refresh, sliced client-side), `NetWorthOverview.tsx` and `NetWorthChart.tsx` (a Recharts line with an area wash, a two-line tooltip and a collapsed "About this chart" details block), `StatTile.tsx`, `CashflowChart.tsx`, `CategoryList.tsx` (one bar color for every row) and `AnalyticsDetails.tsx` (a scrolling table). Shared primitives are exported from `src/components/ui`: `Card`, `CardHeader` (serif title, subtitle, actions), `SegmentedControl` (aria-pressed buttons, 44 px tall on phones), `Chip`, `DeltaIndicator` (arrow plus signed text, tone positive, negative or neutral), `LegendKey`, `EmptyState`, `Skeleton` and `cx`. The design system is documented in `docs/design-system.md`: quiet surfaces, one mint accent, serif for titles only, nominal lists in one color, a legend only for two or more series, caveats in a collapsed details block. Formatters are in `src/lib/format.ts`: `formatWholeCurrency` ("$396,516"), `formatSignedWholeCurrency`, `formatCompactCurrency` ("$7.5k"), `formatCurrency` (cents), `formatSignedPercent(value, digits)`.

Tests use Vitest with jsdom (`vitest.config.ts`), Testing Library for components, and `// @vitest-environment node` for routes. Route tests mock `@/lib/auth/get-user-id`, `@/lib/db/with-user` (a chain of `select().from().innerJoin().innerJoin().where`) and `@/lib/logging`; copy `src/__tests__/cashflow-route.test.ts`. Component tests mock `recharts` with pass-through elements and stub `fetch`; copy `src/__tests__/analytics-view.test.tsx`. Run tests with `npx vitest run --dir src` from the repository root; the `--dir src` matters because bare runs pick up stale copies under `.claude/worktrees/`.

The database-free harness is how the real page is screenshotted without a database: `docs/design/analytics-redesign/harness/prod-fixtures.js` and `mock-fixtures.js` are Playwright page functions that set a fake session cookie (the middleware only checks its UUID shape) and answer every `/api/*` request from fixtures. Run one with the Playwright MCP tool's run-code action passing `filename`, then open `http://localhost:3000/` against `npm run dev -- --port 3000`. `docs/design/analytics-redesign/README.md` explains the steps; `render.mjs` there expands a canvas board's `{{ }}` holes, `<sc-for>` and `<sc-if>` into static HTML using the repository's `jsdom`.

Deployment is `scripts/deploy.sh` from a checkout whose HEAD equals `origin/main`; it fast-forwards the NAS checkout over ssh (`otterholt` on the LAN) and rebuilds the app container. Production can be queried read-only with `ssh otterholt 'docker exec ottermint-db-1 psql -U postgres -d ottermint -Atc "<sql>"'`; the owner's user is `kchoosun@gmail.com`.

Terms used below. A "window" is the months a range selects, oldest first, clipped to the first month with data. The "prior window" is the equal number of months immediately before it. "Month to date" means counting a month's transactions only through today's day of the month. "Cadence" is how often a charge repeats: weekly, every two weeks, monthly, quarterly or yearly.

## Plan of Work

### Milestone 1: the design reference

Goal: a reader can see the target page without the canvas. Copy the two canvas boards into `docs/design/analytics-tab/source/desktop.dc.html` and `docs/design/analytics-tab/source/phone.dc.html` (the canvas files are named `Main.dc.html` and `Phone.dc.html`; rename on copy). Generalize `docs/design/analytics-redesign/render.mjs` so it takes the design folder as its first argument (defaulting to its own folder, so the existing invocation keeps working) and titles the output from the folder name; then `node docs/design/analytics-redesign/render.mjs docs/design/analytics-tab` writes `docs/design/analytics-tab/desktop.html` and `phone.html`. The boards use `class Component` with a constructor that sets `this.state = { range: '1Y' }`; the renderer's `DCLogic` stub already supports a state field, and the render shows the 1Y state. Write `docs/design/analytics-tab/README.md` in the same shape as the redesign's README: the canvas link, how to render, how to check the implementation with the harness (Milestone 5), and the intended deviations listed here so anything else that differs is a bug.

Intended deviations from the boards: the app keeps its own header (page title, household switch, Refresh with "Updated … ago", Connect Account, avatar menu) and sidebar, and phones keep the app's header and top navigation; the range control is the app's `SegmentedControl`; the "About this chart" and "How detection works" links are collapsed details blocks, not links; the category-trends header column for the window reads the window label ("Oct 2025–Sep 2026") as the mock does; recurring rows on phones show the cadence and next date as a caption under the merchant and hide the last-charged and note detail; every control is at least 44 px tall on phones; the sample data in the boards is generated inside the mock and is not real.

### Milestone 2: the model

Goal: pure, tested functions for everything the four cards show, so the components only lay things out.

In `src/lib/cashflow.ts`, add month-to-date figures. Define `CashflowToDate` as `{ income, spending, savings, netCashFlow: string; spendingByCategory: CashflowCategoryTotal[] }` and add `toDate?: CashflowToDate` to `CashflowMonth`, documented as "the same figures counting only days up to and including today's day of the month; optional so older fixtures still type-check". In `aggregateCashflow`, keep a second set of buckets filled only when the row's day of month (`Number(row.date.slice(8, 10))`) is less than or equal to today's day (`Number(options.today.slice(8, 10))`), and emit `toDate` on every month. Pending rows are still skipped. Extend `src/__tests__/cashflow.test.ts`: with today "2026-08-13", a row on the 12th counts in `toDate` and a row on the 14th does not, and a month's `toDate` totals never exceed its whole-month totals. The routes need no change; the field rides along.

In `src/lib/analytics-model.ts`, add the following, each unit tested in `src/__tests__/analytics-model.test.ts` with a fixture of 24 months from "2024-10" to "2026-09" whose data starts "2025-01" and whose last month is partial (copy `buildMonths` from `src/__tests__/analytics-view.test.tsx` and give it a `toDate` on every month equal to 60% of the month).

`asToDate(month)` returns a copy with `income`, `spending`, `savings`, `netCashFlow` and `spendingByCategory` replaced by `toDate`'s values, or the month unchanged when `toDate` is absent. `likeForLikePrior(period: ResolvedPeriod)` returns `period.priorMonths` with its last month passed through `asToDate` when the period's last month is partial, else `priorMonths` unchanged; null stays null. The trends page calls `resolvePeriod(months, { range, month: null })` for the window and labels, then `likeForLikePrior` for comparisons.

`monthRate(month)` is `netCashFlow / income * 100`, or null when income is zero. `windowRate(months)` is the summed net cash flow over the summed income of the months, times 100, or null when income is zero. `savingsRateSummary(window, prior)` returns `{ rate, deltaPoints, best, lowest }`: `rate` is `windowRate(window)`; `deltaPoints` is `rate - windowRate(prior)` when both exist, else null; `best` and `lowest` are `{ month, rate }` over the window's complete months (all months when the window is a single partial month), null when no month has a rate. `rateScale(values)` returns `{ domain, ticks }` with ticks every 10 points from 0 when no rate is negative (else from `floor((min - 4) / 10) * 10`) to `ceil((max + 4) / 10) * 10` (at least one step above the bottom), so the zero line is always present and the line never touches the top. Test: rates 9 to 31 give ticks 0 to 40; a -6 month gives -10 to 40; no rates give 0 to 10.

`categoryTrends(window, prior, top = 8)` returns `CategoryTrendRow[]` where `CategoryTrendRow` extends `CategoryRow` with `series: number[]` (the row's spending per window month, summed over `memberKeys`, in dollars) and `average: number` (mean over the window's complete months, or over all months when none is complete). It starts from `rankCategories(window, prior, top)` and re-sorts: when `prior` is non-null, rows with a delta by `delta.pct` descending, rows without a delta after them, and "Other" always last; when `prior` is null, keep the ranking by total. Test: a category whose window total doubled sorts first; the partial month contributes to `series` but not to `average`; "Other" stays last whatever its delta.

`yearToDate(months, today)` returns null when the current year has no month with data, else `{ thisYear, lastYear, totals, lastTotals, deltas, highest, lowest, strip, label, comparisonLabel, note }`. `thisYear` is the months whose key starts with today's year, January through the current month (the 24-month fetch always holds them). `lastYear` is the previous year's months with the same month numbers, with its last month passed through `asToDate`, or null when any of them is absent or lies before the first data month. `totals` and `lastTotals` come from `sumPeriod`. `deltas` has `income`, `spending`, `savings` and `netCashFlow`, each `periodDelta(current, last, upIsGood)` with spending's `upIsGood` false, all null when `lastYear` is null. `highest` and `lowest` are `{ month, total }` by spending over this year's complete months (null when none). `strip` has twelve entries, spending in dollars for months of this year that exist and null for later months. `label` is "Jan–Sep 2026" via `spanLabel`; `comparisonLabel` is "Compared with Jan–Sep 2025" or null; `note` is "2025 is counted through the same day of the month, so the current month compares like for like." when `lastYear` exists and its last month was adjusted, "History starts Jan 2025" when `lastYear` is null because of the data start, otherwise null. Test both branches with the fixture (data from 2025-01 gives a comparison; data from 2026-01 gives the history note).

### Milestone 3: recurring charges

Goal: `GET /api/analytics/recurring` returns the merchants that charge on a schedule, with totals, and is unit tested end to end with hand-built rows.

Create `src/lib/recurring.ts`, pure and importable by the client for its types. Define `Cadence` as `"weekly" | "biweekly" | "monthly" | "quarterly" | "yearly"`, `RecurringCharge` as `{ key, merchant, cadence, amount, monthlyEquivalent, firstDate, lastDate, nextExpected, count, varies: { min, max } | null, priceChange: { from, to, since } | null, isNew, categoryKey, accountName }` (amounts as two-decimal strings, dates as "YYYY-MM-DD"), and `RecurringSummary` as `{ charges, monthlyTotal, yearlyTotal, shareOfSpending: number | null, asOf }`. Export `detectRecurringCharges(rows: CashflowRow[], options: { today: string; averageMonthlySpending: number | null }): RecurringSummary`.

The detection, in order. Keep rows that are not pending and whose `classifyTransaction` is "spending" (this excludes credit-card payments, transfers and savings). Group them by a merchant key: `merchantName` when present, else `name`, lower-cased, with every character other than letters and spaces removed and whitespace collapsed (so "NETFLIX.COM 866-579-7172" and "Netflix" both become "netflix"). For each group, sort by date and compute the gaps in days between consecutive charges. The cadence bands are weekly 6 to 8 days, biweekly 13 to 15, monthly 26 to 35, quarterly 85 to 97 and yearly 350 to 380. Pick the band that the most gaps fall into. A group qualifies when it has at least three charges and at least 70 percent of its gaps (and at least two) fall in the chosen band, or, for yearly only, at least two charges whose single gap is in band. The group's median amount is the "typical" amount; a charge is "steady" when at least 70 percent of amounts are within the larger of $1.00 and 5 percent of the median. A group that is not steady qualifies only when its latest category key starts with `RENT_AND_UTILITIES`, `LOAN_PAYMENTS` or equals `GENERAL_SERVICES_INSURANCE` and its cadence is monthly, and is then marked `varies` with the minimum and maximum amounts. A qualifying group must be active: its last charge is within 1.5 cadence lengths of today (12 days weekly, 21 biweekly, 50 monthly, 140 quarterly, 550 yearly). `amount` is the latest charge. `nextExpected` adds one cadence to `lastDate`: 7 or 14 days, or one, three or twelve calendar months with the day clamped to the target month's length. `monthlyEquivalent` converts `amount` by cadence: times 52/12, times 26/12, times 1, divided by 3, divided by 12. `priceChange` is set when the latest amount differs from the median of the earlier charges by more than the steady tolerance, as `{ from: that median, to: amount, since: the date of the first charge at the new amount }`; it is never set on a `varies` row. `isNew` is true when `firstDate` is within 100 days of today and the cadence is not yearly. `merchant` is the latest charge's `merchantName ?? name`; `categoryKey` and `accountName` come from the latest charge. Sort charges by `monthlyEquivalent` descending, then merchant. `monthlyTotal` sums the equivalents, `yearlyTotal` is twelve times that, `shareOfSpending` is `monthlyTotal / averageMonthlySpending * 100` rounded to a whole number, or null when the average is null or zero, and `asOf` is `options.today`.

Test `src/__tests__/recurring.test.ts` with hand-built rows for today "2026-09-29": a Netflix row on the 22nd of twelve months at 15.49 then 17.99 from July qualifies as monthly with a price change from 15.49 to 17.99 since 2026-07-22; a grocery merchant every 6 to 8 days with amounts from 40 to 140 does not qualify; a utility with amounts from 71 to 138 on the 15th qualifies as monthly with `varies`; a yearly charge on 2025-03-14 and 2026-03-14 qualifies with `nextExpected` 2027-03-14; a gym charged on the 31st, then Feb 28, then Mar 31 stays monthly; a merchant last charged 70 days ago is dropped as inactive; a merchant first seen 45 days ago with three weekly charges is `isNew`; a credit-card payment row is ignored; totals and `shareOfSpending` match hand arithmetic; a group of two same-day charges does not qualify.

Create `src/app/api/analytics/recurring/route.ts`, modeled on the cash-flow route: `getUserId`, compute `today` as the UTC date and `since` as the first day of the month twelve months before today's month (thirteen months inclusive), `withUser` with `selectClassifiedTransactionRows(tx, userId, since)`, then `aggregateCashflow(rows, { months: 13, today })` to get the average spending over the complete months that have any data in the last twelve, and `detectRecurringCharges(rows, { today, averageMonthlySpending })`. Export `RecurringResponse = RecurringSummary`. 401 on auth errors, 500 otherwise with `logServerError`. Test `src/__tests__/recurring-route.test.ts` copying the cash-flow route test's mocks: 401 when unauthenticated, a happy path whose response has the Netflix charge and a `shareOfSpending`, `mockWhere` called once, and `asOf` equal to the faked date.

### Milestone 4: the page

Goal: the Analytics destination renders the four cards from the model, with the range control, loading, error and household states, and tests.

Create `src/components/dashboard/TrendsView.tsx` (the file name says what the page is about; the nav label is "Analytics"). Props: `groupId?: string` and `refreshKey?: number`, like `AnalyticsView`. In household mode (`groupId` set) it renders one `EmptyState` reading "Household analytics are not available yet." and fetches nothing. Otherwise it keeps `range` state (default "1Y"), fetches `/api/analytics/cashflow?months=24` and `/api/analytics/recurring` on mount and whenever `refreshKey` changes, each with its own abort controller and its own loading, ready or error state, the same shape as `AnalyticsView`'s `CashflowState`. It computes `period = resolvePeriod(months, { range, month: null })`, `prior = likeForLikePrior(period)`, and passes them down. Layout, top to bottom: a row with the `SegmentedControl` (options from `ANALYTICS_RANGES`, `ariaLabel` "Time range", `fullWidth` with `sm:inline-flex sm:w-auto` like the Dashboard), a caption `period.comparisonLabel ?? period.historyStartsLabel`, and a muted note "Sets the window for savings rate and category trends" (on phones it wraps under the control). Then `SavingsRateCard`, then a grid `xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]` holding `CategoryTrendsCard` and `YearToDateCard`, then `RecurringChargesCard`. While cash flow first loads, show a `Skeleton` card of 380 px, two of 520 px in the grid, and one of 600 px. When the cash-flow fetch fails with nothing loaded, show a `Card` with `EmptyState` "Cash flow couldn't load. Try Refresh." in place of the three cash-flow cards; the recurring card has its own error state.

`SavingsRateCard({ window, prior })`: a `Card` with `padding="lg"` and the same two-column grid as `NetWorthOverview` (300 px column, then the chart). Left: the caption "Savings rate", the hero figure `Math.round(rate)%` in the same classes as the net-worth hero (`text-[2.5rem] ... sm:text-hero`), a sub line "of income kept · {spanLabel(window)}", then a `DeltaIndicator` line with `formatSignedPoints(deltaPoints)` ("+4.5 pts", a new helper in `src/lib/format.ts` beside `formatSignedPercent`, tested in `src/__tests__/format.test.ts`) followed by "vs the previous N months" when `deltaPoints` exists, else the text "no earlier months to compare"; then a divider and rows Income, Kept (net cash flow) and Moved to savings with the savings share in muted text, and a footnote "Kept is income minus spending. Moved to savings counts transfers into savings and investment accounts." Right: a row with "Share of income kept each month" on the left and "Best {monthLongLabel} · {rate}%" and "Lowest … " on the right, then `SavingsRateChart`, then a collapsed `<details>` "About this chart" in the same markup as `NetWorthChart`'s, holding: the current month is month to date; the previous window's last month is counted through the same day; months with no income have no point. When `rate` is null (no income in the window), the hero shows "—" and the chart area shows `EmptyState` "No income in this range."

`SavingsRateChart({ months })`: Recharts `ComposedChart` in a `ResponsiveContainer` of 176 px on phones and 232 px from `sm`, data `{ month, rate }` with `rate` from `monthRate` (null allowed; `connectNulls` false). `CartesianGrid` horizontal only in `var(--chart-grid)`; a `ReferenceLine` at 0 in `var(--chart-baseline)`; category `XAxis` on `month` with `tickFormatter` `monthShortLabel`, or every third month with `monthAxisLabel` when more than twelve months (`interval={2}`); `YAxis` from `rateScale`, width 44, tick formatter `${v}%`; `Area` under the line in `var(--accent-mint)` at 0.1 opacity with `baseValue` 0; `Line` 2 px mint, no dots except a single-point series; `ReferenceDot` on the last point labelled with the rate; `Tooltip` with the cursor hairline and a two-line content: `monthLongLabel(month)` (with " · to date" for the partial month) and `${Math.round(rate)}% kept`. No legend: one series, named by the card.

`CategoryTrendsCard({ rows, windowLabel, comparisonShortLabel, partialLast })`: a `Card` with `CardHeader` "Category trends" and subtitle "Monthly spending by category · growing fastest first" (or "· largest first" when no comparison). A header row and then one row per `CategoryTrendRow` in a grid `minmax(0,1fr) 166px 90px 120px` on desktop (`sm:` and up) and `minmax(0,1fr) 106px 60px` on phones where the average moves under the name as a mono caption. The bars are `MiniColumns({ values, partialLast })`: a flex row of fixed width (106 px on phones, 166 px from `sm`) and height (24 px, then 28 px), `align-items: flex-end`, gap 2 px, each bar a `flex: 1` span capped at 24 px wide so the browser sizes it (12 px for twelve months, 5 px for twenty-four, 24 px for three), height as a percentage of the row's own maximum (minimum 2 px), `bg-series-spending`, `rounded-t-sm`, the last bar at 55 percent opacity when `partialLast`. No JavaScript measuring and one element per bar, so the row is responsive for free. Delta column: `DeltaIndicator` with `formatSignedPercent(pct, 0)`, "Flat" in muted text when direction is flat, "—" when there is no comparison. Footer text: "Each row's bars use their own scale. The lighter bar is the current month to date." Each row carries an `aria-label` of "{label}, average {formatWholeCurrency(average)} a month, {delta or 'no comparison'}". Empty: `EmptyState` "No spending in this range."

`YearToDateCard({ data })`: `CardHeader` "{year} so far" with subtitle "{label} compared with {last year label}" or just "{label}" when there is no comparison. A 2 by 2 grid of raised tiles (`bg-surface-raised rounded-tile p-4`): Income, Spending, Saved and Net cash flow, each with the value in `text-figure` classes, a `DeltaIndicator` line "{formatSignedPercent(pct, 0)} vs {last year}" when the delta exists, and a caption: "{avg} a month" for income and spending, "{share}% of income" for saved, "{kept}% of income kept" for net. Then rows "Highest spending month" and "Lowest spending month" with `monthLongLabel · formatWholeCurrency`, then "Spending by month": twelve flex slots, bars from `strip` (null renders an empty slot), letters J F M A M J J A S O N D in mono under them with future months' letters in `text-chart-muted`. Footer: `data.note` when present.

`RecurringChargesCard({ state })`: `CardHeader` "Recurring charges" with subtitle "Charges that repeat on a steady schedule · as of today · {count} found" and, in `actions`, three small stats (Per month, Per year, Of monthly spending) laid out like the stats in `AnalyticsDetails`' header. Then a table like `AnalyticsDetails`' (sticky header, `text-[13px]`): Merchant, Cadence, Amount (mono, right), Last charged, Next expected, Note; Cadence, Last charged and Note are `hidden md:table-cell`, and on phones the merchant cell shows a caption "{Cadence} · next {date}" beneath the name. The Note cell shows a chip (`bg-surface-hover rounded-md px-2 text-[11px] font-semibold`) reading "New", "Price up", "Price down" or "Varies" followed by muted detail: "first seen {date}", "was {from} until {since}", or "{min}–{max} over the year". Dates print as "Sep 22" or "Mar 14, 2027" when the year differs from today's. Footer: "Detected from 12 months of transactions. A charge counts once it has repeated three times at a steady interval." and a collapsed `<details>` "How detection works" restating the rules in three sentences. States: `Skeleton` while loading with nothing yet, `EmptyState` "Recurring charges couldn't load. Try Refresh." on error, and "No recurring charges found yet. They appear after three charges at a steady interval." when the list is empty.

Wire the destination in `src/app/page.tsx`: import `BarChart3` from `lucide-react` and `TrendsView`; add `"analytics"` back to `NavDestination`; append `{ id: "analytics", label: "Analytics", icon: BarChart3 }` to `NAV_ITEMS`; and make the `renderContent` chain return `<TrendsView groupId={isHousehold ? group?.id : undefined} refreshKey={refreshKey} />` for it, keeping Investments as the branch before it. The page title comes from `NAV_ITEMS`, so the header reads "Analytics".

Tests in `src/__tests__/trends-view.test.tsx`, copying the mocking pattern of `analytics-view.test.tsx` (mock `recharts`, stub `fetch`, fake timers at 2026-09-26): the view requests cash flow with `months=24` and the recurring route once each; the hero shows the fixture's 1Y rate and "vs the previous 12 months"; pressing 6M changes the subtitle to the six-month span and makes no new cash-flow request; with data starting in 2026-01 the caption shows "History starts Jan 2026" and the year card shows the history note instead of deltas; the category row whose total doubled is first and its bar count equals the window length; the recurring table lists the fixture's charges in order with the price-up chip; a failed recurring fetch shows its error while the cash-flow cards still render; the household prop renders the empty state and no fetch. Also test `MiniColumns`: one bar per value, heights as percentages of the row's maximum, and the last bar dimmed when partial.

### Milestone 5: fixtures, screenshots and accessibility

Goal: the real page, rendered without a database, matches the static renders at both widths.

Extend both harness files under `docs/design/analytics-redesign/harness/` (they serve every page): in `cashflow(n)`, data starts at "2025-01" instead of "2026-01" and every month carries a `toDate` equal to the month's figures scaled by 0.85 (categories included); add a `/api/analytics/recurring` answer with twelve charges matching the mock's list (rent, State Farm, City Light & Power with `varies`, Verizon, Xfinity, gym, ChatGPT Plus `isNew`, Netflix with `priceChange`, NYT, Spotify, Amazon Prime yearly, iCloud+) and totals. Start `npm run dev -- --port 3000`, run the prod harness as a Playwright page function, open `http://localhost:3000/`, click Analytics, wait five seconds, and screenshot at 1440 by 1000 and 390 by 844 plus full page; compare with `docs/design/analytics-tab/desktop.html` and `phone.html`: section order, proportions, spacing, type, colors, chart shapes and labels. Fix every unintended difference. Check nothing scrolls horizontally at 390 px, no bar label is clipped, the chart container includes its axis labels, every range button, details summary and table row control is reachable with Tab with the mint focus ring, and the range buttons are 44 px tall on phones. Never commit screenshots.

### Milestone 6: production check, merge and deploy

Goal: the numbers on the live page are right. Before merging, export the owner's classified rows for the last 13 months read-only over ssh as JSON (the same query the route runs, through the join in `selectClassifiedTransactionRows`), run them through `aggregateCashflow` and `detectRecurringCharges` with a small script in the scratchpad, and eyeball the recurring list for false positives (groceries, restaurants) and misses (rent, insurance, subscriptions the owner knows about); record what was found under Surprises & Discoveries and tune the bands or tolerances in the Decision Log if needed. Then run the full checks (Concrete Steps), merge the worktree branch to main by fast-forward push (`git push origin <branch>:main`, no pull request; this is the owner's standing instruction), and deploy with `scripts/deploy.sh` only when the owner says so. After deploy, signing in as the owner is not possible for the agent; verify with a read-only query that the recurring route's inputs exist and ask the owner to confirm the page.

## Concrete Steps

All commands run from the repository root of the worktree (`/Users/justin/code/personal/OtterMint/.claude/worktrees/analytics-deeper` while this plan is in progress; any clone works).

Render the design reference (Milestone 1):

    node docs/design/analytics-redesign/render.mjs docs/design/analytics-tab
    # expected: wrote .../analytics-tab/desktop.html N bytes; leftover holes: 0
    #           wrote .../analytics-tab/phone.html N bytes; leftover holes: 0

Run the unit tests (every milestone):

    npx vitest run --dir src
    # expected: Test Files N passed | 1 skipped, Tests M passed | 41 skipped, no failures

Type-check and lint:

    npx tsc --noEmit -p tsconfig.json
    npx eslint src

Run the app for the harness (Milestone 5):

    npm run dev -- --port 3000
    # then, in the Playwright MCP tool: run docs/design/analytics-redesign/harness/prod-fixtures.js as a page function,
    # navigate to http://localhost:3000/, click Analytics, wait 5 s, screenshot at 1440x1000 and 390x844.

Production read-only check (Milestone 6):

    ssh otterholt 'docker exec ottermint-db-1 psql -U postgres -d ottermint -Atc "<the join query, as JSON rows>"' > <scratchpad>/rows.json

## Validation and Acceptance

After Milestone 4, with the prod harness fixtures: clicking "Analytics" shows the header "Analytics", a range control on 1Y, the caption "Compared with the previous 12 months", a savings-rate hero in whole percent with a "pts" delta, a line with twelve points and a labelled end point, a category table with nine rows of twelve bars each sorted by change, a "2026 so far" card whose four figures carry "vs 2025" deltas, and a recurring table of twelve rows totalling the fixture's monthly sum. Pressing "All" shows twenty-four bars per row with every third month labelled on the line, the caption "History starts Jan 2025", and dashes in the change column. Pressing "3M" shows three bars and "Compared with the previous 3 months". The year card and the recurring table do not change with the range. On the household tab the page shows only "Household analytics are not available yet."

Unit tests: `npx vitest run --dir src` passes with the new files `recurring.test.ts`, `recurring-route.test.ts` and `trends-view.test.tsx` and the extended `cashflow.test.ts`, `analytics-model.test.ts` and `format.test.ts`. Each new test fails before its milestone's code exists and passes after.

Production (Milestone 6): the savings-rate hero on 1Y equals, after rounding, the 1Y "kept" share computed from the owner's `/api/analytics/cashflow?months=24` response (sum of netCashFlow over sum of income for the twelve months); the year card's income equals the sum of the 2026 months' income to the dollar; the recurring table contains the owner's rent and no grocery store.

## Idempotence and Recovery

Every step is additive and can be re-run. Rendering the design reference overwrites the two static files. Tests and lint are read-only. The harness answers every API request in the browser and never touches a database. The only production step is the read-only ssh query. Deploy builds before swapping, so a failed build leaves the running app untouched; to roll back, push the previous main commit and deploy again. If a milestone is interrupted, the Progress section says what is done; commit the partial work with a message naming the milestone and continue from the next unchecked item.

## Artifacts and Notes

Design canvas: https://claude.ai/artifact/BqCLEaTd9dAx9sfRVm578b (private; the boards are committed under `docs/design/analytics-tab/source/`).

Production history check (2026-09-29):

    select u.email, extract(year from t.date) as y, count(*), min(t.date), max(t.date)
    from transactions t join accounts a on a.account_id = t.account_id
    join plaid_items p on p.id = a.plaid_item_id join users u on u.id = p.user_id
    group by 1, 2 order by 1, 2;
    kchoosun@gmail.com|2025|1322|2025-01-01|2025-12-31
    kchoosun@gmail.com|2026|882|2026-01-01|2026-09-25

## Interfaces and Dependencies

No new dependencies. Recharts 3, lucide-react, Testing Library and Vitest are already installed.

In `src/lib/cashflow.ts`:

    export interface CashflowToDate {
      income: string; spending: string; savings: string; netCashFlow: string;
      spendingByCategory: CashflowCategoryTotal[];
    }
    export interface CashflowMonth { /* existing fields */ toDate?: CashflowToDate; }

In `src/lib/analytics-model.ts`:

    export function asToDate(month: CashflowMonth): CashflowMonth;
    export function likeForLikePrior(period: ResolvedPeriod): CashflowMonth[] | null;
    export function monthRate(month: CashflowMonth): number | null;
    export function windowRate(months: CashflowMonth[]): number | null;
    export interface SavingsRateSummary {
      rate: number | null; deltaPoints: number | null;
      best: { month: string; rate: number } | null; lowest: { month: string; rate: number } | null;
    }
    export function savingsRateSummary(window: CashflowMonth[], prior: CashflowMonth[] | null): SavingsRateSummary;
    export function rateScale(values: number[]): { domain: [number, number]; ticks: number[] };
    export interface CategoryTrendRow extends CategoryRow { series: number[]; average: number; }
    export function categoryTrends(window: CashflowMonth[], prior: CashflowMonth[] | null, top?: number): CategoryTrendRow[];
    export interface YearToDate {
      thisYear: CashflowMonth[]; lastYear: CashflowMonth[] | null;
      totals: PeriodTotals; lastTotals: PeriodTotals | null;
      deltas: { income: Delta | null; spending: Delta | null; savings: Delta | null; netCashFlow: Delta | null };
      highest: { month: string; total: number } | null; lowest: { month: string; total: number } | null;
      strip: Array<number | null>; label: string; comparisonLabel: string | null; note: string | null;
    }
    export function yearToDate(months: CashflowMonth[], today: string): YearToDate | null;

In `src/lib/format.ts`:

    export function formatSignedPoints(value: number, digits?: number): string; // "+4.5 pts", "-0.8 pts", "0.0 pts"

In `src/lib/recurring.ts`:

    export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
    export interface RecurringCharge {
      key: string; merchant: string; cadence: Cadence; amount: string; monthlyEquivalent: string;
      firstDate: string; lastDate: string; nextExpected: string; count: number;
      varies: { min: string; max: string } | null;
      priceChange: { from: string; to: string; since: string } | null;
      isNew: boolean; categoryKey: string; accountName: string;
    }
    export interface RecurringSummary {
      charges: RecurringCharge[]; monthlyTotal: string; yearlyTotal: string;
      shareOfSpending: number | null; asOf: string;
    }
    export function detectRecurringCharges(
      rows: CashflowRow[], options: { today: string; averageMonthlySpending: number | null }
    ): RecurringSummary;

In `src/app/api/analytics/recurring/route.ts`: `export type RecurringResponse = RecurringSummary;` and `export async function GET(request: NextRequest)`.

Components, all `"use client"` in `src/components/dashboard/`:

    TrendsView({ groupId?: string; refreshKey?: number })
    SavingsRateCard({ window: CashflowMonth[]; prior: CashflowMonth[] | null })
    SavingsRateChart({ months: CashflowMonth[] })
    CategoryTrendsCard({ rows: CategoryTrendRow[]; windowLabel: string; comparisonShortLabel: string | null; partialLast: boolean })
    MiniColumns({ values: number[]; partialLast: boolean })
    YearToDateCard({ data: YearToDate | null })
    RecurringChargesCard({ state: { status: "loading" | "ready" | "error"; summary: RecurringSummary | null } })

Revision note (2026-09-29): Initial version, written after reading the cash-flow model, the analytics model, the routes, the Dashboard components, the tests and the harness, and after confirming the 2025 production history. No implementation yet.

Revision note (2026-09-29, evening): Milestones 5 and 6 done except deployment. Recorded the harness comparison, the phone axis fix, the production check with its findings about the April 2026 data seam, and the retrospective.

Revision note (2026-09-29, later): Milestones 1 to 4 implemented. Two refinements while implementing: `rateScale` starts at zero whenever no rate is negative (the earlier formula put a 2% rate on a -10 floor), and `MiniColumns` sizes its bars with CSS (`flex: 1`, max 24 px, percentage heights) instead of computing widths, which removed the `box` and `height` props and the width test. The recurring route takes no request argument. Progress and the interfaces reflect the code.
