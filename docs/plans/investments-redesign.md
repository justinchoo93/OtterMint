# Investments page redesign: hero chart with time ranges, account filter, holdings table

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `docs/PLANS.md` from the repository root. It replaces the Investments view that `docs/plans/investment-performance.md` and `docs/plans/account-net-gain.md` built (both checked in and incorporated by reference for history); everything needed to implement this plan is repeated here. The approved design is checked in under `docs/design/investments-redesign/` (three static renders, the three canvas boards they come from, and a README listing intended deviations).

## Purpose / Big Picture

The Investments destination today is two stacked panels: a performance panel with a fixed 90-day window, a multi-line chart with dashed segments and amber reference lines, an attribution table, a donut, per-account mini charts and two per-account gain lists, followed by a flat holdings list. It cannot answer the questions an investor asks in the order they ask them, has no time-range control and no way to look at one account.

After this work the destination is one page in the style of a brokerage app. At the top, a hero shows the portfolio's live value and its change "since <date>" over the chosen range, above one solid line chart that the reader can scrub with the mouse or arrow keys (the hero figure follows the crosshair), with range pills 1M, 3M, 6M, YTD, 1Y and All under the chart. A row of account tiles (All accounts, then one per brokerage account with its value, change over the range and lifetime net gain) is the account filter: clicking a tile scopes the whole page to that account without another network request. Four summary tiles explain the range: Market gain with the money-weighted return for the range, Net contributions with deposit and withdrawal counts, Dividends and interest with a trailing-twelve-month figure, and Unrealized gain versus cost. A Holdings table groups positions by security across the scoped accounts with shares, price, change over the range, value, weight and unrealized gain, filterable by security type and searchable. An Allocation card shows one stacked bar by security type, and an Activity card lists the brokerage feed (buys, sells, dividends, interest, deposits, withdrawals) for the range and scope, newest first.

A human can demonstrate the result by opening the app, choosing Investments, seeing the hero value equal the sum of the investment balances on the Accounts page, clicking 1M and watching the chart, the change line and every tile re-scope to September, clicking the Schwab Individual tile and seeing the page show only that account (its lifetime line reading approximately "+$12,515 lifetime on $35,000 in" as of the last production verification), hovering the chart and watching the hero value follow the crosshair, and typing "AAPL" in the holdings search to see one merged row across two accounts.

## Progress

- [x] (2026-09-29 19:10Z) Research complete: current panel, route and pure math read; design system, primitives and the analytics redesign's conventions read; production shape taken from the checked-in plans (four investment accounts, feed taxonomy, snapshot start dates, option quantity convention); Recharts 3.7's active-point hooks confirmed in `node_modules/recharts/types/index.d.ts`; baseline gate recorded under Concrete Steps.
- [x] (2026-09-29 19:10Z) Milestone 0: the approved mock checked in under `docs/design/investments-redesign/` (boards, renders, README, render script). Plan written.
- [x] (2026-09-29 19:40Z) Milestone 1: `src/lib/investments-model.ts` (ranges, feed classification, stretches, modified-Dietz summary, holdings grouping and filtering, OCC parsing, axis ticks, allocation rows) with 19 tests in `src/__tests__/investments-model.test.ts`, written first and seen failing on the missing module; `monthTicks` and `monthKeyOf` lifted into `src/lib/analytics-model.ts` with `NetWorthChart` importing them. Suite 51 files / 509 tests passing.
- [x] (2026-09-29 20:05Z) Milestone 2: route rewritten to the new response shape (eight queries in a fixed order, live point appended only when the coverage fingerprint is unchanged, feed classified on subtype, positions carrying the earliest in-window snapshot price, activity capped at 200); `InvestmentPerformancePanel` and its 15 tests deleted; `computeAttribution`, `computeXirr`, `extractInvestmentFlows`, `computeDividends` and their describe blocks removed; the two category-rules assertions rewritten against the classifier; route tests rewritten (10 tests, production-shaped fixtures with a lifetime and an anchored account). Suite 50 files / 479 tests.
- [x] (2026-09-29 20:35Z) Milestone 3: `InvestmentsView` (fetch per range with abort, dimmed refetch, empty and error states, `deriveScope` memo), `InvestmentHero` (value, change, caption, range control, "About this chart") and `InvestmentChart` (Recharts `ComposedChart` with an `ActivePointReporter` child on `useActiveTooltipDataPoints`, date-pill tooltip, end label) wired above the old holdings list; 6 view tests in `src/__tests__/investments-view.test.tsx` drive the crosshair through a subscribable hook mock. Suite 51 files / 485 tests.
- [x] (2026-09-29 21:00Z) Milestone 4: `AccountTiles` (the filter; lifetime, anchored and All notes) and `InvestmentSummaryTiles` (Market gain with the modified-Dietz return, Net contributions with counts, Dividends & interest with the trailing figure, Unrealized gain vs cost) built from `accountTiles` and `summaryTiles` in the view; scope switching is client-side. 4 more view tests (10 total; hero queries scoped to the hero region because the All tile repeats its figures). Suite 51 files / 489 tests.
- [ ] Milestone 5: holdings table, allocation card and activity card; old holdings panel and route deleted; view tests complete.
- [ ] Milestone 6: phone layout, accessibility, fidelity against the checked-in renders, harness fixture.
- [ ] Milestone 7: merge, deploy and verify in production (needs the owner's go-ahead in the session; record the date here).

## Surprises & Discoveries

Pre-seeded from research; add implementation discoveries below.

- Observation: For option positions, `holdings.quantity` is contracts × 100 while the transaction feed's `quantity` is contracts, and `holdings.price` is the per-share premium, so `value = quantity × price` holds in the holdings table without a multiplier.
  Evidence: `docs/plans/trade-ledger-wash-sales.md`, Surprises (an AAPL call: feed 5.00 versus holdings 500.00; `holdings` stores option quantity as contracts×100).

- Observation: Dividends do not arrive as `type = 'cash'`: 111 of 119 production dividend rows have `type = 'fee'`. Every classification of feed rows in this plan matches on `subtype` alone.
  Evidence: `docs/plans/account-net-gain.md`, Surprises (the eight production `type|subtype` shapes: `buy|buy`, `sell|sell`, `transfer|transfer`, `transfer|split`, `cash|interest`, `cash|dividend`, `fee|dividend`, `fee|interest`).

- Observation: Per-account balance snapshots and per-holding snapshots exist only from 2026-08-15 (first deploy of the capture loop), while the aggregate `investment_total` exists from early July 2026 with null coverage fingerprints before 2026-07-23. Ranges longer than that will start "since Aug 15" for an account and at the first fingerprinted row for the portfolio.
  Evidence: `docs/plans/investment-performance.md` Progress and Decision Log; `docs/plans/account-net-gain.md` (anchor dates 2026-08-15 for both Chase accounts).

- Observation: The two Chase Self-Directed accounts cannot report a lifetime net gain (their feed history is truncated at the 24-month backfill edge and their first rows are buys, not deposits); the Schwab Individual (opened 2026-04-22) and Roth IRA report lifetime figures that reconcile to the cent. The account tiles therefore carry two kinds of third line.
  Evidence: `docs/plans/account-net-gain.md`, Progress entry of 2026-08-16 19:20Z (Individual: +12,514.67 on 35,000.00; Roth: −5,050.74 on 17,500.14; both Self-Directed accounts anchored at 2026-08-15).

- Observation: Recharts 3.7 exports `useActiveTooltipDataPoints`, `useActiveTooltipLabel` and `useActiveTooltipCoordinate`, hooks any component rendered inside a chart can call to read the point under the cursor or under keyboard navigation. This is how the hero follows the crosshair without the tooltip having to carry the value.
  Evidence: `grep -o "useActiveTooltip[A-Za-z]*" node_modules/recharts/types/index.d.ts` prints the three names.

- Observation: A fresh git worktree has no `node_modules`; `npm ci` is required there before any test runs.
  Evidence: `ls node_modules/.bin/vitest` failed in `.claude/worktrees/investments-redesign` until `npm ci` ran (2026-09-29).

- Observation: `src/__tests__/category-rules.test.ts` reaches through `extractInvestmentFlows` to prove that the brokerage-credit correction rule routes a row into investment withdrawals. Retiring that extractor means rewriting those two assertions against the classifier and the corrected detailed category directly.
  Evidence: `grep -n extractInvestmentFlows src/__tests__/category-rules.test.ts` (lines 4, 69, 70, 120).

## Decision Log

- Decision: One network request per range; switching the account scope, the holdings filter and the search happen in the browser over the same response.
  Rationale: The response for one range is small (four short daily series, a few dozen positions, at most 200 feed rows), and instant scope switching is the point of the account tiles. Refetching on every tile click would make the filter feel like navigation.
  Date/Author: 2026-09-29 / Claude with Justin.

- Decision: Contributions and withdrawals, for every scope, come from the brokerage feed's external-flow rows (`investment_transactions` rows whose `subtype`, lower-cased, is one of `transfer`, `deposit`, `withdrawal`, `contribution`, `distribution`), attributed to their account, with the Plaid sign flipped (a negative amount is money arriving). The checking-side classifier flows (`extractInvestmentFlows` over `TRANSFER_OUT/IN_INVESTMENT_AND_RETIREMENT_FUNDS`) are no longer used for the page.
  Rationale: The portfolio figure and the per-account figures must agree, which needs one source. The feed is account-attributed and reconciles to the cent for lifetime-complete accounts (`docs/plans/account-net-gain.md`), while the checking side cannot say which account received a transfer and only sees transfers from linked checking accounts. Residual risk, accepted: an institution whose feed omits transfers would show zero contributions for that account; its tile would still be honest about lifetime mode because `computeAccountNetGains` gates on feed completeness.
  Date/Author: 2026-09-29 / Claude with Justin.

- Decision: The hero change, the summary tiles and the account tiles measure within the latest comparable stretch of the scoped series intersected with the range, and the caption reads "since <date>". A comparable stretch is a run of points whose coverage segment (the set of covered accounts) does not change. The chart draws every reported point in the range as one solid mint line, including points before that stretch.
  Rationale: This is the rule the net-worth hero adopted on 2026-09-27 (one solid line of reported values; change measured only across trusted history), so the two hero cards behave identically. A value change that includes an account being connected is not a return, and drawing dashed regions and boundary labels was the clutter the redesign removes.
  Date/Author: 2026-09-29 / Claude with Justin.

- Decision: The return figure is the money-weighted return for the range itself, computed by the modified Dietz method (defined under Context and Orientation), never annualized. `computeXirr` and its 30-day rule leave the page.
  Rationale: A strong quarter annualized reads as hype (a +24% quarter prints as +137% a year), and an investor comparing ranges wants the range's own figure. Modified Dietz needs no root finding, is deterministic and is what brokerages label "money-weighted" for a period.
  Date/Author: 2026-09-29 / Claude with Justin.

- Decision: The fourth summary tile is Unrealized gain (value versus cost basis over the scoped positions with a basis), not the mock's Realized gain. When `docs/plans/trade-ledger-wash-sales.md` ships its tax-lot engine, Realized gain takes the slot and unrealized gain remains in the Holdings footer.
  Rationale: Realized gain needs lot matching, split handling, the option multiplier and seeded opening lots; a naive sum over sells would be wrong exactly where that plan is careful. Unrealized gain is computable today by an existing, tested function.
  Date/Author: 2026-09-29 / Claude with Justin.

- Decision: Holdings are grouped by security across the scoped accounts (one row per `security_id`, or per ticker when two accounts hold the same security under different Plaid security ids), with an Account column reading the account or "2 accounts" in the All scope and hidden when one account is scoped. Cash rows are pinned last.
  Rationale: The same stock held at two brokerages is one position to its owner; the account column keeps the detail one glance away.
  Date/Author: 2026-09-29 / Claude with Justin.

- Decision: A position's change over the range is its current price against the price in the earliest holding snapshot on or after the range start, in any scoped account; with no snapshot in the range the cell shows "—". Options display their quantity in contracts (`quantity / 100`) and a label parsed from the OCC symbol.
  Rationale: Per-holding snapshots are the only price history the app has (no market-data dependency, per the original plan's decision), and they exist from 2026-08-15. Price is the same in every account, so the earliest snapshot anywhere is the right anchor.
  Date/Author: 2026-09-29 / Claude with Justin.

- Decision: Ranges are 1M, 3M, 6M, YTD, 1Y and All (default 3M), measured from the first day of the range's first month like the analytics ranges, with All requesting 3650 days. The route's `days` parameter is clamped to 1..3650 (it was 30..730).
  Rationale: Same mental model as the dashboard's range control; 1M and YTD are the two an investor reaches for that the dashboard lacks.
  Date/Author: 2026-09-29 / Claude with Justin.

- Decision: Each account series gains a point for today at the account's live balance, and the aggregate series gains one at the live investment total, but only when today's coverage fingerprint (computed the way `recomputeUserNetWorthSnapshot` computes it) equals the last aggregate snapshot's fingerprint. The hero value is always the live balance sum.
  Rationale: Snapshots are captured only on refresh, so the last point can be days old; the line should reach today and the hero must equal the Accounts page. Appending a live point across a coverage change would fabricate a comparable stretch.
  Date/Author: 2026-09-29 / Claude with Justin.

- Decision: The activity card shows the eight newest feed rows for the range and scope with a "Show all N" control that expands in place; the response caps activity at 200 rows and reports the true count.
  Rationale: The feed is the only place brokerage activity appears in the app; eight rows answer "what happened lately", and the expansion covers the rest without a new destination.
  Date/Author: 2026-09-29 / Claude with Justin.

- Decision: `InvestmentPerformancePanel`, `HoldingsPanel`, the `/api/holdings` route and the pure functions the new route no longer calls (`computeAttribution`, `computeXirr`, `extractInvestmentFlows`, `computeDividends`) are deleted with their tests. `buildPortfolioSeries`, `computeUnrealized`, `computeAllocation` and `computeAccountNetGains` stay.
  Rationale: Dead code that duplicates the new page's semantics would mislead the next reader; the surviving functions are reused as they are.
  Date/Author: 2026-09-29 / Claude with Justin.

- Decision: The household view keeps its placeholder ("Household investment holdings are not available yet.").
  Rationale: Out of scope; the household data path has no investment feed.
  Date/Author: 2026-09-29 / Claude with Justin.

## Outcomes & Retrospective

To be written at completion. Compare against the Purpose: does the page answer value, change, own money versus market, holdings and recent activity, for all accounts and for one, in the chosen range?

## Context and Orientation

OtterMint is a Next.js 16 (App Router) personal-finance app in TypeScript with React 19, Tailwind CSS v4 and Recharts 3.7. Server and UI code live in `src/`. Bank and brokerage data comes from Plaid (a bank-data aggregator) into PostgreSQL via Drizzle ORM (schema in `src/lib/db/schema.ts`). Every API route authenticates with `getUserId()` from `src/lib/auth/get-user-id.ts` and runs its queries inside `withUser(userId, tx => ...)` from `src/lib/db/with-user.ts`, which sets the row-level-security context so one user never sees another's rows. Money travels API responses as decimal strings; arithmetic happens in integer cents and is serialized with two decimals. The dev machine has no reachable database: unit tests mock all I/O, and pages are checked visually with a database-free harness (a fake `session_id` cookie plus in-browser route fixtures; `docs/design/analytics-redesign/README.md` explains it). Production runs on the OtterHolt NAS and is deployed with `scripts/deploy.sh` after `origin/main` is fast-forwarded; there are no Plaid webhooks in production, so data changes only on a manual Refresh.

The work happens in the git worktree `/Users/justin/code/personal/OtterMint/.claude/worktrees/investments-redesign` on branch `worktree-investments-redesign`, created from the tip of `origin/main` (commit 2cfc883) on 2026-09-29. Run every command from that directory. It needs its own `npm ci` once.

Terms used throughout, in plain language. A snapshot is a dated row recording a value as observed that day; `user_net_worth_snapshots` holds one aggregate row per day with an `investment_total`, `account_balance_snapshots` holds one row per account per day, and `holding_snapshots` holds one row per position per day, all captured by `captureAccountSnapshots` (`src/lib/capture-snapshots.ts`) at the end of a Refresh or a new link, last capture of the UTC day wins. A coverage fingerprint is a hash of the set of accounts that fed an aggregate snapshot (`computeUserCoverageFingerprint` in `src/lib/net-worth-history.ts`, over every Plaid account id plus every manual account id); rows before 2026-07-23 carry a null fingerprint, called the legacy region. A coverage segment is a run of consecutive aggregate points with the same fingerprint (`buildPortfolioSeries` in `src/lib/investment-performance.ts` numbers them); a comparable stretch is the latest such run. An external flow is money the owner moved into or out of a brokerage account (a deposit, a withdrawal, a Roth conversion), as opposed to market movement, dividends or trades; in the feed these are rows whose `subtype` is `transfer`, `deposit`, `withdrawal`, `contribution` or `distribution`, and Plaid's sign convention for the feed is positive = cash left the account, so a deposit has a negative amount. Cost basis is what was paid for a position; unrealized gain is current value minus cost basis. The modified Dietz return over a period is `marketGain / (startValue + Σ flowᵢ × wᵢ)`, where `marketGain = endValue − startValue − Σ flowᵢ` (deposits positive, withdrawals negative) and `wᵢ` is the fraction of the period remaining after flow i (days from the flow date to the end, divided by days in the period); it is the standard money-weighted return for a period that needs no root finding. An OCC option symbol is the 21-character ticker Plaid gives an option, for example `AAPL261218C00260000`: the underlying ticker padded, then the expiry as YYMMDD, then C or P, then the strike times 1000 in eight digits. Scope is "all" or one account id; range is one of the six pills; the window is the date span requested from the server for a range; the stretch is the comparable part of the window that figures are measured over.

The relevant files as they are before this plan:

`src/app/api/analytics/investments/route.ts` answers `GET /api/analytics/investments?days=N` (N clamped to 30..730, default 90) with `InvestmentsResponse`: a segmented portfolio series with per-account series, a trusted-window attribution, an annualized XIRR, unrealized gains, checking-side flow markers, trailing-twelve-month dividends, allocation by security type and per-account net gains. Its queries run in a fixed order that `src/__tests__/investments-route.test.ts` mirrors with a queue of mocked results (aggregate rows, account snapshots, coverage events, classified transactions, dividend rows, holdings, then the three unwindowed per-account-gain queries).

`src/lib/investment-performance.ts` is the pure math (no server imports), tested in `src/__tests__/investment-performance.test.ts` (32 tests in eight describe blocks). This plan keeps and reuses `buildPortfolioSeries(aggregateRows, accountRows, events)` (segmented points with a `quality` of `legacy` or `known`, boundary dates, per-account series), `computeUnrealized(holdingRows)` (totals, per-account and per-position gains; cash and basis-less positions excluded and reported), `computeAllocation(holdingRows)` (slices by Plaid security type with value, share and count, sorted by value) and `computeAccountNetGains(feedRows, accountRows, holdingRows, snapshotRows, today)` (per-account true net gain in `lifetime`, `anchored` or `none` mode). It retires `computeAttribution`, `computeXirr`, `extractInvestmentFlows` and `computeDividends`.

`src/components/dashboard/InvestmentPerformancePanel.tsx` (793 lines, raw `var(--…)` classes, uppercase tracked labels, Recharts `LineChart` with dashed legacy segments and amber `ReferenceLine`s, a `PieChart` donut) and `src/components/dashboard/HoldingsPanel.tsx` (a flat list fetched from `GET /api/holdings`, `src/app/api/holdings/route.ts`) are the two panels the `investments` branch of `renderContent()` in `src/app/page.tsx` stacks in personal mode; household mode shows a placeholder. `src/__tests__/investment-performance-panel.test.tsx` (15 tests) covers the old panel.

`src/components/dashboard/NetWorthOverview.tsx` and `NetWorthChart.tsx` are the house pattern for a hero card with a chart: label, big value, `DeltaIndicator` with a "since" caption from `sinceLabel`, a Recharts `ComposedChart` with an `Area` under a 2px mint `Line`, `netWorthScale` for the y-axis, first-of-month x ticks from a private `monthTicks` helper, a `ReferenceDot` end label in compact currency, a tooltip on a `--chart-muted-line` cursor, and an "About this chart" `<details>` for caveats. `src/components/dashboard/AnalyticsView.tsx` shows how a view owns a range (`SegmentedControl`), fetches with an `AbortController`, keeps the previous render dimmed during refetches and renders error and empty states. `src/components/dashboard/StatTile.tsx` is the tile idiom (14px radius, 13px secondary label, 28px figure, delta line).

`src/components/ui/` exports the primitives every new component must use: `Button`, `Card` and `CardHeader` (serif title, subtitle, actions slot), `SegmentedControl` (`aria-pressed` buttons, `size="sm"`, `fullWidth` for 44px phone targets), `Chip`, `DeltaIndicator` (arrow plus signed text, tone positive, negative or neutral), `LegendKey`, `EmptyState`, `Skeleton` and `cx`. `docs/design-system.md` is the style guide: semantic utilities (`bg-surface`, `text-ink-muted`, `border-line`, `rounded-card`), serif titles only, sentence-case labels, 2px lines, solid hairline grids, no y-axis forced to zero for change stories, a legend for two or more series, 44px targets on phones, real buttons, meaning never on color alone. Chart colors that must be told apart come from the fixed categorical palette `--chart-cat-1` to `--chart-cat-8` in order, never cycled.

`src/lib/analytics-model.ts` holds range helpers reused here: `ANALYTICS_RANGES`, `netWorthDaysForRange(range, today)` (the first-of-month rule), `netWorthScale(values)`, `sinceLabel(fromDate, today)`, `todayUtc()`, `monthShortLabel` and `monthAxisLabel`. `src/lib/format.ts` provides `formatCurrency` (cents), `formatWholeCurrency`, `formatSignedWholeCurrency`, `formatCompactCurrency` and `formatSignedPercent`.

The production account set, from the checked-in plans: two Chase Self-Directed taxable accounts (masks 6850 and 6940, feed history truncated at the 24-month backfill edge, net gain anchored at 2026-08-15), a Schwab Individual taxable account (mask 5111, opened 2026-04-22, lifetime-complete, $35,000 contributed) and a Schwab Roth IRA (mask 6093, lifetime-complete, $17,500.14 converted in). The owner trades stocks, ETFs and options; option positions are a quarter of the trade rows.

## Plan of Work

The work proceeds in eight milestones (0 through 7). Each ends in a state where the full test suite passes and something new is observable, and each is committed separately with files staged by explicit path.

### Visual specification (applies to every milestone)

The renders in `docs/design/investments-redesign/` are the reference; `README.md` there lists the intended deviations, which repeat the Decision Log. Everything lives inside the existing app shell (sidebar, header with the page title "Investments", Refresh, Connect Account, avatar) in the `max-w-6xl` main column with 24px gaps between sections.

The hero card is a `Card` with `padding="lg"`. Top left: a 13px secondary label ("Portfolio value", or "<institution> <account name> ····<mask>" when scoped), the value in the hero type (`text-hero`, 40px on phones) as whole dollars, then a line with a `DeltaIndicator` (`size="md"`) reading the signed whole-dollar change and signed percentage in parentheses, followed by secondary text "since Jul 1" (year added when it differs from today's) with " · earliest history" appended when the stretch starts at the first point of the window or " · account opened" when a scoped account's first snapshot is inside the window. While the chart is scrubbed, the value shows the hovered point's value, the delta measures from the stretch start to the hovered point (omitted when the hovered point is before the stretch), and the caption is the hovered date in full ("Aug 22, 2026"). Under it the chart, 232px tall (176px on phones), full card width: a 10% mint `Area` under a 2px mint `Line`, solid `--chart-grid` horizontal gridlines at `netWorthScale` ticks with compact-currency labels in 11px mono, first-of-month x ticks (every third month when more than twelve, weekly "Sep 8" ticks when the window is 45 days or shorter), a 4px end dot ringed in the surface color with the compact end value to its right, a `--chart-muted-line` cursor line, and a tooltip whose content is only a small date pill (11px mono on `bg-surface-active`, 6px radius) under the crosshair. Under the chart, left, the range `SegmentedControl` (`ariaLabel="Time range"`, options 1M 3M 6M YTD 1Y All, `fullWidth` on phones so the buttons are 44px tall) and, right, a `<details>` whose summary reads "About this chart" in accent underline and whose body is: "Balances are what each brokerage reported at the last refresh of the day. Deposits and withdrawals move the line; the tiles below separate them from market gain. Before <first trusted date> the set of accounts covered is unknown, so change figures are measured across trusted history only." followed by one line per coverage boundary in the window ("Aug 13 · account set changed").

The account tiles are a `role="group"` labeled "Account filter": a five-column grid at `lg` (16px gaps), a two-column grid below it, and on phones a horizontally scrolling row of 196px tiles. Each tile is a `<button aria-pressed>` with a 14px radius, `border-line` (mint when selected, `--chart-muted-line` on hover), 18px by 20px padding, at least 124px tall: line one is the 13px secondary title ("All accounts", or "Chase Self-Directed") with the mask in 11px mono muted; line two the value in 24px semibold; line three a `DeltaIndicator` with the signed change and percentage over the stretch; line four an 11px muted sentence: for All "4 accounts · 2 with lifetime history", for a lifetime account "+$12,515 lifetime on $35,000 in", for an anchored account "+$4,691 since Aug 15 · earlier history not visible", and for `none` "net gain not measurable yet".

The four summary tiles form a four-column grid at `lg` and two columns below, each a 14px-radius bordered surface, 18px by 20px padding, at least 124px tall, with a 13px secondary label, a 28px semibold figure (24px on phones) in ink, and a 12px muted line. Market gain: the signed whole-dollar market gain; line: `DeltaIndicator` with the signed modified-Dietz percentage and " return", then "money-weighted, this range" (or, when the return is null, "needs two days of history"). Net contributions: signed whole dollars; line "1 deposit · 1 withdrawal" with correct plurals. Dividends & interest: the window total with cents; line "$1,840 trailing 12 months". Unrealized gain: signed whole dollars over scoped positions with a basis; line: `DeltaIndicator` with the signed percentage and " vs cost", plus " · $16,330 without cost basis excluded" when `excludedValue` is positive.

The Holdings card is a `Card` with `padding="none"` and a `CardHeader` inside a 20px by 24px header ("Holdings"; subtitle "7 positions and cash across 4 accounts · sorted by value", or "3 positions and cash in Schwab ····5111 · sorted by value"), with actions: a `SegmentedControl` `size="sm"` labeled "Security type" (All, Stocks, ETFs, Options, Cash) and a `<input type="search" aria-label="Search holdings" placeholder="Search holdings">` 32px tall on a raised surface (on phones the control is `fullWidth` under the header and the search sits under it). The column header row is 11px secondary text on `border-line-subtle` rules: Security, Account (All scope only), Shares, Price, "<range label> change" ("All-time change" for All), Value with a small down-arrow marking the sort, Weight, Unrealized gain. Grid columns at `sm` and up: `minmax(0,1fr) 132px 96px 96px 104px 120px 72px 120px` (drop the 132px column when scoped). Each row (13px vertical padding, hover `bg-surface-raised`) shows the ticker or label in 13px mono semibold over the name in 12px secondary (truncated), the account or "2 accounts", shares right-aligned in mono ("5 contracts" for options), the price, the range change as a `DeltaIndicator` in mono, the value in 14px mono, the weight, and the unrealized gain as a signed mono figure over its percentage in the delta colors; the cash row reads "Cash" over "Money market sweep" with "—" in the share, price, change and gain cells. A footer row reads "Total", the total value, "100%", and "+$34,373 unrealized" over "+15.3% vs cost". On phones each row is two columns: left the ticker, name and an 11px muted line "420 sh · ▲ +4.6% 3M"; right the value over the unrealized gain.

Allocation and Activity share a `440px minmax(0,1fr)` grid at `lg`, stacked below. Allocation: a `Card` with a `CardHeader` ("Allocation", subtitle "By security type · $391,405 total"), a 12px-tall stacked bar (2px gaps, 6px radius) whose segments are the slices in the fixed palette order (ETFs `--chart-cat-1`, Single stocks `--chart-cat-2`, Options `--chart-cat-3`, Mutual funds `--chart-cat-4`, Bonds `--chart-cat-5`, Other `--chart-cat-6`, Cash `--chart-cat-other`), and a legend of rows: an 8px square swatch, the label, "×3" in muted text, the whole-dollar value in mono secondary and the percentage right-aligned in a 48px column. Activity: a `Card` with `padding="none"`, a header ("Activity", subtitle "Past 3 months · 16 events across all accounts" or "… in this account"), then rows on a `56px 84px minmax(0,1fr) 110px` grid: the date in 12px mono muted, a 22px-tall kind chip (11px medium secondary on `bg-surface-raised`, 6px radius: Buy, Sell, Dividend, Interest, Deposit, Withdrawal, Reinvestment, Split, Other), the row's name over an 11px muted detail line ("20 shares at $178.20 · Schwab ····5111"; the account only in the All scope), and the signed amount with cents in mono; then a footer "Showing 8 of 41 · newest first" with a ghost `Button` "Show all 41" that expands the list in place (the footer then reads "Showing all 41 · newest first" and the button reads "Show fewer").

States. First load: a `Skeleton` card the height of the hero plus a row of five tile skeletons. Refetch (range change): the previous render at 60% opacity with `aria-busy="true"`. Error: one `EmptyState` reading "Investments couldn't load. Try Refresh." No investment accounts: one `EmptyState` reading "Connect an investment account to see performance." Household mode: the existing placeholder.

### Milestone 0: check in the approved mock

Done on 2026-09-29. `docs/design/investments-redesign/boards/` holds the three canvas boards (`desktop.dc.html`, `account.dc.html`, `phone.dc.html`), `render.mjs` expands them, and `desktop.html`, `account.html`, `phone.html` are the renders. The README lists the intended deviations. Re-render with `node docs/design/investments-redesign/render.mjs` if a board changes.

### Milestone 1: pure model, test-first

Goal: every number the page shows comes from a small pure module, so the route and the components stay thin and the math is testable without a browser.

Create `src/lib/investments-model.ts` (no React or server imports; signatures under Interfaces and Dependencies). First, ranges: `INVESTMENT_RANGES` lists `1M`, `3M`, `6M`, `YTD`, `1Y`, `ALL` with their pill labels and long labels ("Past month", "Past 3 months", "Past 6 months", "Year to date", "Past year", "All history"); `investmentDaysForRange(range, today)` returns whole days from the first day of the range's first month to today for the month ranges (the same arithmetic as `netWorthDaysForRange`: 1M from the first of this month, 3M from the first of the month two months back, and so on), from January 1 for YTD, and 3650 for All. Second, feed classification: `classifyFeedRow({ type, subtype, amount })` returns an `ActivityKind` by lower-cased `subtype` alone: `buy` for `buy`; `sell` for `sell`; `dividend` for `dividend`, `qualified dividend` and `non-qualified dividend`; `reinvestment` for `dividend reinvestment`; `interest` for `interest`; `split` for `split`; `deposit` for the external-flow subtypes (`transfer`, `deposit`, `withdrawal`, `contribution`, `distribution`) when the amount is negative and `withdrawal` when positive (a zero-amount external row is `other`); `other` for anything else, including a null subtype. `ACTIVITY_LABELS` maps kinds to the chip texts. Third, series: `SeriesPoint` is `{ date, value: number, segment }`; `scopedSeries(response, scope)` returns the parsed aggregate points for "all" or the chosen account's points with segment 0; `latestStretch(points)` finds the run of trailing points sharing the last point's segment and, when it has at least two points, returns `{ fromDate, toDate, startValue, endValue, amount, pct, spansWholeRange, days }` (`pct` null when `startValue` is 0, `days` the calendar days between the two dates), else null. Fourth, the summary: `summarizeStretch(stretch, flows)` keeps flows with `fromDate < date <= toDate` (the start point already contains that day's money, the convention `computeAttribution` and `computeAccountNetGains` use), sums deposits and withdrawals as positive magnitudes, computes `netContributions`, `marketGain = amount − netContributions`, and the modified-Dietz percentage with `wᵢ = daysBetween(flow.date, toDate) / stretch.days`, returning null for the percentage when the denominator is not positive or `stretch.days` is 0. Fifth, holdings: `groupPositions(positions, scope)` filters to the scope, groups by `securityId` (cash positions, those with `isCashEquivalent` true or `securityType` "cash", all fold into one group keyed `cash`), sums quantity, value and cost (cost becomes null if any member lacks a basis), collects `accountIds`, takes `startPrice` from any member that has one, derives `changePct` as `(price / startPrice − 1) × 100` or null, marks `contracts` true for `securityType` "derivative" and then divides the displayed quantity by 100, and sorts by value descending with the cash group last. `filterGroups(groups, filter, query)` applies the type pill (`all`, `equity`, `etf`, `derivative`, `cash`; other types show only under All) and a case-insensitive substring match of the query against the ticker and the name. `parseOccSymbol(symbol)` returns `{ underlying, expiry: "YYYY-MM-DD", kind, strike }` for a string matching `^([A-Z.]{1,6})(\d{6})([CP])(\d{8})$` and null otherwise; `formatSecurityLabel(ticker, name, securityType)` returns `{ label, detail }`: for a parseable derivative, label "AAPL $260 call" and detail "Expires Dec 18, 2026"; for any other position, the ticker (or the name when there is no ticker) and the name. Sixth, x-axis ticks: lift `monthTicks(min, max)` and `monthKeyOf(ts)` out of `src/components/dashboard/NetWorthChart.tsx` into `src/lib/analytics-model.ts` as exports (NetWorthChart imports them; no behavior change, the existing chart tests prove it), and add `investmentAxisTicks(minTs, maxTs)` in the new module: weekly ticks labeled "Sep 8" when the span is 45 days or shorter, otherwise the month ticks with `monthShortLabel` (or `monthAxisLabel` when dense). Seventh, allocation labels: `ALLOCATION_TYPES`, the ordered list of `{ type, label, color }` from the Visual specification, and `allocationRows(slices)` which maps `computeAllocation`'s slices onto labels and colors (unknown types fold into "Other").

Write `src/__tests__/investments-model.test.ts` first and watch it fail, then implement. Assert literally: `investmentDaysForRange` on 2026-09-29 gives 28 for 1M (from Sep 1), 90 for 3M (from Jul 1), 181 for 6M, 271 for YTD, 363 for 1Y and 3650 for All; `classifyFeedRow` for the eight production shapes and for `fee|dividend` (dividend), `dividend reinvestment` (reinvestment), an external row with a positive amount (withdrawal), a null subtype (other); `latestStretch` over points with segments 0,0,1,1,1 returns the last three with `spansWholeRange` false, over a single-point last segment returns null, and over one segment returns the whole list with `spansWholeRange` true; the worked summary in Artifacts and Notes (market gain 3,000.00, deposits 5,000.00, withdrawals 2,000.00, return 2.9%); a flow dated on `fromDate` is excluded and one dated on `toDate` included; `groupPositions` merging AAPL held in two accounts (quantity 180, cost summed, `accountIds` of length 2), folding two cash positions into one last row, turning a derivative's 500 into 5 contracts, and yielding a null `changePct` without a `startPrice`; `filterGroups` by type and by a lower-case query; `parseOccSymbol("AAPL261218C00260000")` giving underlying AAPL, expiry 2026-12-18, call, strike 260, and null for "AAPL"; `formatSecurityLabel` for that option and for a plain ETF; `investmentAxisTicks` giving five weekly ticks for Sep 1 to Sep 29 and three month ticks for Jul 1 to Sep 29.

Result: the new test file passes (about 20 tests), the rest of the suite is unchanged, and `npx tsc --noEmit` is clean.

### Milestone 2: the route, rewritten, and the old panel retired

Goal: `GET /api/analytics/investments?days=N` returns everything the page needs for one window, in the shape under Interfaces and Dependencies, and nothing in the app still depends on the old shape.

Rewrite `src/app/api/analytics/investments/route.ts`. Parse `days` as an integer, default 90, clamped to 1..3650, and compute `since` as today (UTC) minus `days` and `today` as the UTC date, both `YYYY-MM-DD`. Inside one `withUser`, run these queries in this order (the order is what the route test's queue mirrors): aggregate rows (`user_net_worth_snapshots` date, `investmentTotal`, `coverageFingerprint` where `date >= since`); investment account info (`accounts` joined to `plaid_items` where the item belongs to the user and `accounts.type = 'investment'`: `accountId`, `name`, `mask`, `subtype`, `currentBalance`, `institutionName`, `itemCreatedAt`); every `investment_transactions` row for the user (`id`, `accountId`, `securityId`, `date`, `name`, `amount`, `type`, `subtype`, `quantity`, `price`), full history because lifetime net gain and the trailing-twelve-month income need it; current holdings joined to accounts (`accountId`, `accountName`, `securityId`, `tickerSymbol`, `name`, `quantity`, `price`, `value`, `costBasis`, `securityType`, `isCashEquivalent`); holding snapshots with `date >= since` (`accountId`, `securityId`, `date`, `price`) ordered by date; every investment `account_balance_snapshots` row for the user (`accountId`, `name`, `date`, `balance`); all Plaid account ids for the user; all manual account ids for the user. Then, in TypeScript with the pure functions: `buildPortfolioSeries(aggregateRows, [], [])` gives the aggregate points and boundary dates (pass empty arrays for the per-account and event inputs; the per-account series are built from the full snapshot list instead, and boundary steps are not displayed); if the last aggregate point's date is before `today` and `computeUserCoverageFingerprint(plaidIds, manualIds)` equals the last aggregate row's fingerprint, append `{ date: today, value: <sum of investment currentBalance>, segment: last.segment, quality: "known" }` and set `liveAppended` true. For each investment account, filter its balance snapshots to `date >= since`, append today's live balance when the last snapshot is older than today, and take its net gain from `computeAccountNetGains(feedRows, accountInfo, holdingRows, allSnapshotRows, today)` (map to `mode`, `startDate`, `netContributions`, `gain`, `gainPct`). Classify every feed row with `classifyFeedRow`; `flows` are the deposit and withdrawal rows dated on or after `since`, amounts as positive magnitudes; `income` are the dividend and interest rows on or after `since` with the sign flipped; `incomeTrailingTwelveMonths` sums dividend and interest rows per account over the twelve calendar months up to today (the same month window `computeDividends` used); `activity` is every classified row on or after `since`, newest first (date descending, then id descending), amounts flipped so a buy is negative and a sale, dividend or deposit positive, capped at 200 rows with `activityTotal` the uncapped count. `positions` are the holdings rows plus `startPrice` and `startDate` from the earliest snapshot in the window for the same `accountId` and `securityId` (null when none). Serialize money with two decimals from cents.

Delete `src/components/dashboard/InvestmentPerformancePanel.tsx` and `src/__tests__/investment-performance-panel.test.tsx`, and in `src/app/page.tsx` remove the import and the `<InvestmentPerformancePanel refreshKey={refreshKey} />` line so the Investments destination renders only `HoldingsPanel` until Milestone 3. In `src/lib/investment-performance.ts`, delete `computeAttribution`, `computeXirr`, `extractInvestmentFlows`, `computeDividends`, the `Attribution`, `InvestmentFlow`, `InvestmentFlowRow`, `DividendRowInput` and `Dividends` types, the constants only they used, and the now-unused `classifyTransaction` import; delete the four matching describe blocks in `src/__tests__/investment-performance.test.ts`. In `src/__tests__/category-rules.test.ts`, replace the two `extractInvestmentFlows` assertions: the brokerage-credit case asserts `applyCategoryRules(crBkrg).categoryDetailed` equals `"TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS"` and `classifyTransaction(applyCategoryRules(crBkrg))` equals `"savings"`; the River case asserts the corrected row's `categoryDetailed` is not one of the two investment-fund categories. `selectClassifiedTransactionRows` stays for the cash-flow routes.

Rewrite `src/__tests__/investments-route.test.ts` with the same mocking pattern (`vi.hoisted` queue, `withUser` mock whose `select` chain resolves the next queued result on `where`, and the `orderBy` step added to the chain so ordered queries resolve too) and fixtures shaped like production: aggregate rows with a null-fingerprint July row and two fingerprints in August; four accounts (two Chase anchored, Schwab Individual lifetime with deposits summing to 35,000.00, a Roth); feed rows covering all eight production shapes including a `fee|dividend`; holdings including an AAPL position in two accounts and a derivative with quantity 500; a holding snapshot inside the window and one before it; balance snapshots. Fix the clock with `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime(new Date("2026-09-29T12:00:00Z"))`. Assert: 401 when unauthenticated; `days=99999` and `days=0` clamp (the `since` passed through the aggregate query's `gte` is visible through the mocked `where` argument, or assert on the response's `since`); the aggregate series segments at the fingerprint changes and gains a `today` point when the fingerprint fixture matches, and does not when a different fingerprint is queued; each account carries `institutionName`, `mask`, `balance`, a `points` array ending today and a `netGain` whose mode is `lifetime` for the Individual and `anchored` for a Chase account; `flows` contains the Individual's deposits as positive amounts with kind `deposit` and a positive-amount transfer as a `withdrawal`; `income` includes the `fee|dividend` row; `positions` carry `startPrice` only for the position with an in-window snapshot; `activity` is newest first with a `split` and a `buy`, and `activityTotal` equals the number of in-window rows.

Result: the suite passes with the old panel test gone and the route test rewritten; `grep -rn "InvestmentPerformancePanel\|computeXirr" src` prints nothing; in the harness the Investments destination shows only the holdings list.

### Milestone 3: the view, the hero, the chart and the ranges

Goal: the top of the page is the hero card, driven by a range control, with a scrubbable chart.

Create `src/components/dashboard/InvestmentsView.tsx` (`"use client"`, props `refreshKey?`). State: `range` (default `"3M"`), `scope` (default `"all"`), `hovered` (a `SeriesPoint` or null), `holdingsFilter` (`"all"`), `holdingsQuery` (`""`), `activityExpanded` (false), and the load state (`loading` | `ready` | `error` with the last response kept). Fetch `/api/analytics/investments?days=<investmentDaysForRange(range, todayUtc())>` on mount and whenever `range` or `refreshKey` changes, with an `AbortController` aborted in the effect cleanup so a superseded request can never paint. Changing the range clears `hovered` and `activityExpanded` and keeps the scope. When the response has no accounts, render the empty `EmptyState`; on error with no earlier data, the error `EmptyState`; on error with earlier data, keep the render and add the one-line note the net-worth overview uses. Derive, with `useMemo`, the scoped series, its stretch and summary, the scoped flows and income, the grouped positions, `computeUnrealized` and `computeAllocation` over the scoped position rows (map positions to `HoldingRowInput`), and the scoped activity. This milestone renders only the hero; Milestones 4 and 5 add the rest below it.

Create `src/components/dashboard/InvestmentHero.tsx` (props under Interfaces and Dependencies): the label, value, delta and caption logic from the Visual specification, including the hovered state; the chart; the range control; the "About this chart" details.

Create `src/components/dashboard/InvestmentChart.tsx`, presentational, props `points`, `today` and `onActivePoint`. Build the chart data as `{ timestamp, value, date }`, compute `netWorthScale` for the y-axis, `investmentAxisTicks` for the x-axis, and render a Recharts `ComposedChart` (`margin` top 8, right 52, bottom 0, left 0; `title` "Investments over time"; `desc` "Use the left and right arrow keys to read values by date.") with `CartesianGrid` (solid, vertical off), `XAxis` (type number, scale time, the computed ticks, 11px mono muted), `YAxis` (domain and ticks from the scale, compact currency, width 52), a `Tooltip` with the muted cursor and a `content` that renders only the date pill, an `Area` (linear, no stroke, mint at 10%, `baseValue` the domain minimum, `tooltipType="none"`), a `Line` (linear, mint, 2px, round caps, `activeDot` radius 4 ringed in the surface color, `isAnimationActive={false}`), a `ReferenceDot` at the last point with the compact value label, and a child `<ActivePointReporter onChange={onActivePoint} />`. `ActivePointReporter` is a component in the same file that calls `useActiveTooltipDataPoints()` from `recharts`, and in a `useEffect` reports the first data point's `{ date, value, segment }` or null whenever the hook's value changes; because it lives inside the chart it sees both mouse hover and keyboard navigation. Keep `ResponsiveContainer` with `initialDimension={{ width: 640, height: 232 }}` so tests render without layout.

Wire it: in `src/app/page.tsx`, the personal Investments branch renders `<InvestmentsView refreshKey={refreshKey} />` above `<HoldingsPanel refreshKey={refreshKey} />` (the holdings panel goes in Milestone 5).

Create `src/__tests__/investments-view.test.tsx`. Mock `recharts` as `src/__tests__/net-worth-chart.test.tsx` does, adding `ReferenceDot`, `Area`, and `useActiveTooltipDataPoints: () => mockActivePoints.value` backed by a `vi.hoisted` holder so a test can simulate a hovered point by setting it and re-rendering. Stub `fetch` with a router keyed on the URL prefix that returns the fixture under Artifacts and Notes. Fix the clock at 2026-09-29T12:00:00Z (Date only). Cover in this milestone: the first request is `days=90`; the hero shows the live value (the sum of the four balances) and "since Jul 23" when the fixture's last comparable stretch starts there; clicking 1M requests `days=28` exactly once and the earlier render is `aria-busy` until the new response lands; a hovered point makes the hero read that point's value and full date; the "About this chart" text names the first trusted date; an empty accounts list shows the connect prompt; a failed fetch shows the error line.

Result: the suite passes; in the harness the page shows the hero over the old holdings list, the pills change the window, and hovering the line moves the hero figure.

### Milestone 4: account tiles and summary tiles

Goal: the reader can scope the page to one account and see what moved it.

Create `src/components/dashboard/AccountTiles.tsx` (props `tiles`, `scope`, `onScope`) rendering the group of `aria-pressed` tile buttons from the Visual specification; the parent builds `tiles` with `latestStretch(scopedSeries(response, id))` per account and per "all", `sinceLabel` for the anchored line's date, and the lifetime or anchored sentence from `netGain`. Create `src/components/dashboard/InvestmentSummaryTiles.tsx` (props `tiles`, four entries of `{ label, value, delta?, note }` where `delta` is `{ direction, tone, text }`) rendering the four tiles. In `InvestmentsView`, build the four entries from the scoped summary (market gain and Dietz return; contributions with counts; income window total and trailing-twelve-month sum over the scoped accounts; `computeUnrealized` totals) and render the two rows under the hero. Clicking a tile sets `scope` and clears `hovered`; the hero label, figures, chart, tiles and everything below re-derive from the same response with no request.

Extend `src/__tests__/investments-view.test.tsx`: five tiles render with "All accounts" pressed; the Schwab Individual tile's fourth line reads "+$12,515 lifetime on $35,000 in" and a Chase tile's reads "since Aug 15"; clicking the Roth tile makes the hero label "Schwab Roth IRA ····6093", the hero value the Roth's balance, and issues no request; the summary tiles read the fixture's hand-computed market gain, "1 deposit · 1 withdrawal", the income total and the unrealized figure, and after scoping to the Roth they change to that account's figures; a scope whose stretch has one point shows the Market gain note "needs two days of history".

Result: the suite passes; in the harness the tiles scope the page instantly.

### Milestone 5: holdings, allocation, activity, old panels gone

Goal: the whole page, and nothing of the old one.

Create `src/components/dashboard/HoldingsTable.tsx` (props `groups`, `showAccount`, `changeHeader`, `filter`, `onFilter`, `query`, `onQuery`, `totals`, `accountLabel` a function from account id to "Chase ····6850") rendering the card from the Visual specification with `formatSecurityLabel` for each row, `formatSignedPercent` and `DeltaIndicator` for changes and gains, mono figures, and the footer totals; the search input is a controlled `<input type="search">` with `aria-label`. Create `src/components/dashboard/AllocationCard.tsx` (props `rows` from `allocationRows`, `total`) with the stacked bar (each segment a `<span>` sized by `flex-basis` percent) and the legend. Create `src/components/dashboard/ActivityCard.tsx` (props `events`, `total`, `subtitle`, `showAccount`, `accountLabel`, `expanded`, `onToggle`) rendering the rows, chips, footer and the "Show all N" / "Show fewer" ghost button. In `InvestmentsView`, render the Holdings card, then the Allocation and Activity grid.

Delete `src/components/dashboard/HoldingsPanel.tsx` and `src/app/api/holdings/route.ts` (nothing else imports either; `grep -rn "HoldingsPanel\|api/holdings" src` must print nothing afterwards), and remove the `HoldingsPanel` import and element from `src/app/page.tsx`.

Extend `src/__tests__/investments-view.test.tsx`: the holdings rows are sorted by value with the cash row last, AAPL shows "2 accounts", the derivative shows "5 contracts" and its parsed label, the change column header reads "3M change" and switches to "1M change"; the Options pill leaves one row; typing "aapl" in the search leaves one row and clearing it restores them; scoping to an account hides the Account column; the footer total equals the fixture's sum; the allocation legend lists ETFs, Single stocks, Options and Cash with percentages summing to 100 within rounding; the activity card shows eight rows newest first, the footer reads "Showing 8 of 16 · newest first", "Show all 16" expands to sixteen rows, a buy amount is negative and a dividend positive, and scoping to the Roth leaves only its rows without the account suffix.

Result: `grep -rn "HoldingsPanel\|InvestmentPerformancePanel\|api/holdings" src` prints nothing; the suite passes; the harness shows the complete page.

### Milestone 6: phone layout, accessibility and fidelity

Goal: the page matches the renders at 1440 and 390 wide and meets the accessibility rules. Write `docs/design/investments-redesign/harness/mock-fixtures.js` by copying the pattern of `docs/design/analytics-redesign/harness/prod-fixtures.js` (add the session cookie, intercept `**/api/**`, answer by path): `/api/auth/me`, `/api/groups` (none), `/api/accounts` (the four investment accounts plus one checking account, with `institutionName`), `/api/manual-accounts` (none), `/api/net-worth` and `/api/analytics/cashflow` (empty, so the Dashboard still renders), and `/api/analytics/investments` built from the same constants as the mock boards (copy the `ACCOUNTS`, `ACTIVITY`, `TICKERS` and `POSITIONS` tables and the deterministic generators from `boards/desktop.dc.html`, and shape the output as `InvestmentsResponse` for the requested `days`). Start the dev server, run the harness in a Playwright browser, and compare full-page screenshots at 1440 by 1000 and 390 by 844 (wait five seconds for Recharts) against `desktop.html`, `account.html` (after clicking the Schwab Individual tile and hovering the chart near Aug 22) and `phone.html`: section order, spacing, type sizes, colors, chart shape and label placement. Fix every unintended difference; the README's intended deviations are the only allowed ones. Check that nothing scrolls horizontally at 390px except the tile row, that every pill, tile, filter and the activity button is reachable with Tab in visual order and toggles with Enter or Space with the mint focus ring, that the chart responds to the arrow keys, that the tiles and holdings rows do not clip at 390px, and that the search input has a visible label for assistive technology. Run the palette check from the data-visualization guidance for any color you had to change. Record screenshots and fixes in Surprises & Discoveries; never commit screenshots. Commit the harness file.

Result: the fidelity pass is recorded, the harness is committed, and the full gate under Concrete Steps passes including `npm run build`.

### Milestone 7: merge, deploy and verify in production

Goal: the owner sees the page on real data. Do not start this milestone until the owner authorizes it in the session; record the date here when they do. From a checkout of `main` (not this worktree) fast-forward `main` to `worktree-investments-redesign` (the repository merges branches straight to `main` with the owner's personal GitHub identity and never opens pull requests), push, run `scripts/deploy.sh` and confirm its health probe. No migration runs. Then verify with the owner's data: the hero value equals the sum of the investment balances on the Accounts page; the Schwab Individual tile's lifetime line and the Roth's match the figures `computeAccountNetGains` produced before this plan (last verified 2026-08-16 as +12,514.67 on 35,000.00 and −5,050.74 on 17,500.14, adjusted for later activity); both Chase tiles read "since Aug 15"; on 3M the caption names the first fingerprinted aggregate date on or after Jul 1 (or the latest boundary after it); option rows show contracts and parsed labels; the newest activity row equals the newest feed row. Where a check needs the owner's signed-in session, run the owner's production rows (read-only, `ssh otterholt` and psql as `docs/DEPLOYMENT.md` describes) through the same pure functions and the harness, keeping those rows in the scratch directory and never in the repository. Record the figures and dates in Outcomes & Retrospective and commit that update to the plan.

## Concrete Steps

All commands run from `/Users/justin/code/personal/OtterMint/.claude/worktrees/investments-redesign`.

Once, after creating or entering the worktree:

    npm ci --no-audit --no-fund
    git status -sb
      ## worktree-investments-redesign

The baseline before any code change (recorded 2026-09-29 after `npm ci`):

    npx vitest run --dir src
      Test Files  50 passed | 1 skipped (51)
      Tests  490 passed | 41 skipped (531)
    npx tsc --noEmit
      (no output)
    npm run lint
      src/lib/sync-holdings.ts
        3:10  warning  'eq' is defined but never used  @typescript-eslint/no-unused-vars
      ✖ 1 problem (0 errors, 1 warning)

The 41 skipped tests need a real Postgres and stay skipped. The single lint warning predates this work; any new warning or error must be fixed. Always pass `--dir src` to vitest: without it, stale copies of the repository under `.claude/worktrees/` can be collected. Expect the test count to fall by 15 (the old panel test) plus the four retired describe blocks in Milestone 2 and to rise with every new test file; `Test Files` must never show a failure.

After every edit batch, and at the end of every milestone:

    npx vitest run --dir src
    npx tsc --noEmit
    npm run lint

Run a production build at the end of Milestones 5 and 6 (it needs network access for Google Fonts, and dummy `PLAID_ENV`, `PLAID_CLIENT_ID`, `PLAID_SECRET` and `ENCRYPTION_KEY` values because the real ones live only in the NAS deploy environment):

    PLAID_ENV=sandbox PLAID_CLIENT_ID=x PLAID_SECRET=x ENCRYPTION_KEY=$(printf 'a%.0s' $(seq 1 64)) npm run build

Commit at least once per milestone, staging by explicit path so stray files never ride along, and update the Progress section in the same commit. Example for Milestone 1:

    git add src/lib/investments-model.ts src/__tests__/investments-model.test.ts src/lib/analytics-model.ts src/components/dashboard/NetWorthChart.tsx docs/plans/investments-redesign.md
    git commit -m "feat(investments): pure model for ranges, stretches, feed kinds and holdings groups"

End commit messages with the attribution line the working session specifies (`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` at the time of writing).

To re-render the mock after editing a board:

    node docs/design/investments-redesign/render.mjs
      wrote .../desktop.html ... leftover holes: 0

To run the harness (Milestones 2 through 6), start the dev server in one terminal:

    npm run dev -- --port 3000
      ▲ Next.js 16.2.7 (Turbopack)
      - Local:  http://localhost:3000

Then, in a Playwright browser, run `docs/design/investments-redesign/harness/mock-fixtures.js` as a page function (with the Playwright MCP tool pass its filename; the tool reads files inside the repository), open `http://localhost:3000/`, click Investments in the sidebar, wait five seconds, and screenshot at 1440 by 1000 and at 390 by 844. Stop the server with Ctrl-C or `lsof -ti tcp:3000 | xargs kill`. Until Milestone 6 writes the fixture file, adapt `docs/design/analytics-redesign/harness/mock-fixtures.js` by adding an `/api/analytics/investments` answer shaped like the fixture under Artifacts and Notes.

Milestone 7, only when authorized, from a checkout of `main`:

    git merge --ff-only worktree-investments-redesign
    git push origin main
    scripts/deploy.sh
      ==> [1/2] Fast-forward repo + rebuild app on otterholt
      ==> [2/2] Health check
      {"status":"ok","db":"ok"}

`scripts/deploy.sh` refuses to run unless local HEAD equals `origin/main`, which is why the push comes first.

## Validation and Acceptance

Unit and route tests. `npx vitest run --dir src` passes. `src/__tests__/investments-model.test.ts`, the rewritten `src/__tests__/investments-route.test.ts` and `src/__tests__/investments-view.test.tsx` exist and failed before their implementation. The worked summary (market gain 3,000.00, return 2.9%) and the day counts (28, 90, 181, 271, 363, 3650 on 2026-09-29) are asserted literally.

Harness behavior at 1440px with the mock fixture. Investments opens on 3M with the hero reading the sum of the four balances and a change line "since Jul 1"; the x-axis shows Jul, Aug, Sep; the range control shows 3M pressed. Clicking 1M issues exactly one request, `/api/analytics/investments?days=28` on 2026-09-29, the axis shows weekly ticks, and every tile re-scopes. Hovering the chart shows a date pill under the crosshair and the hero value and caption follow; moving the mouse away restores the live value. Clicking the Schwab Individual tile changes the hero label to "Schwab Individual ····5111", drops the Account column from the holdings table, leaves three positions and cash, and issues no request; clicking All accounts restores the page. The four summary tiles read Market gain, Net contributions, Dividends & interest and Unrealized gain, each with its note. The holdings table sorts by value with cash last, merges AAPL across two accounts, shows the option as contracts, and the Options pill and the search narrow it. The allocation bar's legend percentages sum to 100 within rounding. The activity card shows eight rows, "Show all N" expands them, and buys are negative. At 390px the range control and the type filter span the width with 44px buttons, the tiles scroll horizontally, the summary tiles form a 2 by 2 grid, holdings rows are two columns, nothing else scrolls horizontally, and Tab reaches every control in visual order.

Production, after deploy, as the owner: the checks listed under Milestone 7, recorded in Outcomes & Retrospective with figures and dates.

## Idempotence and Recovery

Every code step is an ordinary file edit that can be repeated or reverted with git. The deletions (the old panel and its test in Milestone 2; the holdings panel and route in Milestone 5; the four retired functions and their describe blocks in Milestone 2) happen only after their replacements pass tests, and `git revert` restores them. There is no migration, no data change and no new dependency. The harness only intercepts requests inside the browser and never reaches a server or database, so it can run any number of times. If the dev server port is busy, stop the old process or use another port and change `BASE` in the harness. If `npm ci` is interrupted, run it again.

If a deploy misbehaves, production keeps running the previous image when the build fails, because `up --build` builds before swapping containers. If the new image is live but wrong, revert the merge on `main`, push, and run `scripts/deploy.sh` again; nothing in the database changed, so rollback is always safe.

If implementation stops midway, the Progress section must say which milestone is partly done and what remains, and the branch must still pass the suite at its last commit.

## Artifacts and Notes

Worked summary, asserted in `investments-model.test.ts`. A stretch from 2026-07-01 (start 100,000.00) to 2026-09-29 (end 106,000.00) is 90 days. Flows: a deposit of 5,000.00 on 2026-08-15 (45 days before the end, w = 0.5) and a withdrawal of 2,000.00 on 2026-09-14 (15 days before the end, w = 0.1667). Net contributions 3,000.00; market gain 106,000 − 100,000 − 3,000 = 3,000.00; denominator 100,000 + 5,000 × 0.5 − 2,000 × 0.1667 = 102,166.67; return 3,000 / 102,166.67 = 2.9364%, shown "+2.9%". A deposit dated 2026-07-01 is excluded (the start point already holds it); one dated 2026-09-29 is included.

View fixture shape (the `fetch` stub in `investments-view.test.tsx` and the Milestone 6 harness answer the same shape). Four accounts as in production: `acc_6850` Chase Self-Directed 6850 anchored, `acc_6940` Chase Self-Directed 6940 anchored, `acc_5111` Schwab Individual 5111 lifetime with `netContributions` "35000.00" and `gain` "12514.67", `acc_6093` Schwab Roth IRA 6093 lifetime with `netContributions` "17500.14" and `gain` "-5050.74". Aggregate points from 2026-07-05 with a null-fingerprint (legacy, segment 0) July stretch, segment 1 from 2026-07-23, segment 2 from 2026-08-13, ending on today with `liveAppended` true. Account points from 2026-08-15 ending today. Flows: one deposit of 5,000.00 into `acc_6940` on 2026-09-15 and one withdrawal of 2,000.00 from `acc_6850` on 2026-08-03. Income: three interest rows and two dividend rows in the window. Positions: VTI, QQQ, AAPL (100) and cash in 6850; SCHD and cash in 6940; AAPL (80), NVDA (110), an `AAPL261218C00260000` derivative with quantity "500.00000000" and price "12.4000", and cash in 5111; NVDA (40), CRWD (10) and cash in 6093; every non-cash position has `startPrice` except CRWD. Activity: sixteen rows covering buy, sell, dividend, interest, deposit, withdrawal and split, newest first, `activityTotal` 16.

Example response excerpt (money as strings):

    {
      "today": "2026-09-29",
      "since": "2026-07-01",
      "portfolio": {
        "points": [
          { "date": "2026-07-23", "value": "452791.71", "segment": 1, "quality": "known" },
          { "date": "2026-09-29", "value": "391404.58", "segment": 2, "quality": "known" }
        ],
        "boundaries": [{ "date": "2026-07-23" }, { "date": "2026-08-13" }],
        "liveAppended": true
      },
      "accounts": [
        {
          "accountId": "acc_5111", "name": "Individual", "mask": "5111", "institutionName": "Charles Schwab",
          "subtype": "brokerage", "balance": "47514.67",
          "points": [{ "date": "2026-08-15", "value": "44120.10" }, { "date": "2026-09-29", "value": "47514.67" }],
          "netGain": { "mode": "lifetime", "startDate": "2026-04-22", "netContributions": "35000.00", "gain": "12514.67", "gainPct": "35.8" }
        }
      ],
      "flows": [{ "date": "2026-09-15", "accountId": "acc_6940", "kind": "deposit", "amount": "5000.00" }],
      "income": [{ "date": "2026-09-19", "accountId": "acc_6940", "kind": "dividend", "amount": "104.80" }],
      "incomeTrailingTwelveMonths": [{ "accountId": "acc_6940", "amount": "203.00" }],
      "positions": [
        { "accountId": "acc_5111", "accountName": "Individual", "securityId": "sec_aapl_c", "tickerSymbol": "AAPL261218C00260000",
          "name": "AAPL Dec 18 2026 260 Call", "securityType": "derivative", "isCashEquivalent": false,
          "quantity": "500.00000000", "price": "12.4000", "value": "6200.00", "costBasis": "7050.00",
          "startPrice": "14.1000", "startDate": "2026-08-27" }
      ],
      "activity": [
        { "id": 9412, "date": "2026-09-26", "accountId": "acc_5111", "kind": "buy", "name": "Bought NVDA",
          "amount": "-3564.00", "quantity": "20.00000000", "price": "178.2000", "securityId": "sec_nvda" }
      ],
      "activityTotal": 16
    }

Harness fixture pattern: copy the cookie and `page.route('**/api/**', …)` scaffolding from `docs/design/analytics-redesign/harness/prod-fixtures.js`, keep its `parse` helper for query strings, and answer `/api/analytics/investments` by slicing the deterministic series from the board's generator to the requested `days`.

## Interfaces and Dependencies

No new packages. Use React 19, Next.js 16, Tailwind CSS v4, Recharts 3.7 (`ComposedChart`, `Area`, `Line`, `ReferenceDot`, `Tooltip`, `CartesianGrid`, `XAxis`, `YAxis`, `ResponsiveContainer` and the hook `useActiveTooltipDataPoints`), `lucide-react` for the search icon, and the primitives in `src/components/ui`.

In `src/lib/investments-model.ts`, define:

    export type InvestmentRange = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";
    export const INVESTMENT_RANGES: ReadonlyArray<{ id: InvestmentRange; label: string; longLabel: string; months: number | null }>;
    export function investmentDaysForRange(range: InvestmentRange, today: string): number;
    export type Scope = "all" | string;
    export type ActivityKind = "buy" | "sell" | "dividend" | "interest" | "deposit" | "withdrawal" | "reinvestment" | "split" | "other";
    export const ACTIVITY_LABELS: Record<ActivityKind, string>;
    export function classifyFeedRow(row: { type: string; subtype: string | null; amount: string }): ActivityKind;
    export interface SeriesPoint { date: string; value: number; segment: number }
    export function scopedSeries(response: InvestmentsResponse, scope: Scope): SeriesPoint[];
    export interface Stretch { fromDate: string; toDate: string; startValue: number; endValue: number; amount: number; pct: number | null; spansWholeRange: boolean; days: number }
    export function latestStretch(points: SeriesPoint[]): Stretch | null;
    export interface FlowEvent { date: string; accountId: string; kind: "deposit" | "withdrawal"; amount: number }
    export interface StretchSummary { contributions: number; withdrawals: number; netContributions: number; marketGain: number; dietzReturnPct: number | null; depositCount: number; withdrawalCount: number }
    export function summarizeStretch(stretch: Stretch, flows: FlowEvent[]): StretchSummary;
    export interface HoldingGroup { key: string; securityIds: string[]; ticker: string | null; name: string; securityType: string | null; isCash: boolean;
      quantity: number; contracts: boolean; price: number; value: number; cost: number | null; accountIds: string[]; startPrice: number | null; changePct: number | null }
    export function groupPositions(positions: InvestmentsResponse["positions"], scope: Scope): HoldingGroup[];
    export type HoldingsFilter = "all" | "equity" | "etf" | "derivative" | "cash";
    export const HOLDINGS_FILTERS: ReadonlyArray<{ id: HoldingsFilter; label: string }>;
    export function filterGroups(groups: HoldingGroup[], filter: HoldingsFilter, query: string): HoldingGroup[];
    export function parseOccSymbol(symbol: string): { underlying: string; expiry: string; kind: "call" | "put"; strike: number } | null;
    export function formatSecurityLabel(ticker: string | null, name: string, securityType: string | null): { label: string; detail: string };
    export function investmentAxisTicks(minTs: number, maxTs: number): { ticks: number[]; label: (ts: number) => string; start: number };
    export const ALLOCATION_TYPES: ReadonlyArray<{ type: string; label: string; color: string }>;
    export function allocationRows(slices: AllocationSlice[]): Array<{ type: string; label: string; color: string; value: number; share: number; count: number }>;

In `src/lib/analytics-model.ts`, add the lifted helpers (moved verbatim from `NetWorthChart.tsx`):

    export function monthTicks(min: number, max: number): { ticks: number[]; dense: boolean; start: number } | null;
    export function monthKeyOf(timestamp: number): string;

In `src/app/api/analytics/investments/route.ts`, export:

    export type InvestmentsResponse = {
      today: string;
      since: string;
      portfolio: { points: PortfolioSeriesPoint[]; boundaries: Array<{ date: string }>; liveAppended: boolean };
      accounts: Array<{
        accountId: string; name: string; mask: string | null; institutionName: string; subtype: string | null; balance: string;
        points: Array<{ date: string; value: string }>;
        netGain: { mode: "lifetime" | "anchored" | "none"; startDate: string | null; netContributions: string; gain: string | null; gainPct: string | null };
      }>;
      flows: Array<{ date: string; accountId: string; kind: "deposit" | "withdrawal"; amount: string }>;
      income: Array<{ date: string; accountId: string; kind: "dividend" | "interest"; amount: string }>;
      incomeTrailingTwelveMonths: Array<{ accountId: string; amount: string }>;
      positions: Array<{
        accountId: string; accountName: string; securityId: string; tickerSymbol: string | null; name: string;
        securityType: string | null; isCashEquivalent: boolean | null;
        quantity: string; price: string; value: string; costBasis: string | null;
        startPrice: string | null; startDate: string | null;
      }>;
      activity: Array<{ id: number; date: string; accountId: string; kind: ActivityKind; name: string; amount: string; quantity: string | null; price: string | null; securityId: string | null }>;
      activityTotal: number;
    };
    export async function GET(request: NextRequest): Promise<NextResponse>;

`src/lib/investment-performance.ts` keeps, unchanged: `buildPortfolioSeries`, `computeUnrealized`, `computeAllocation`, `computeAccountNetGains` and their types (`PortfolioSeriesPoint`, `AggregateRow`, `AccountSnapshotRow`, `CoverageEventRow`, `HoldingRowInput`, `Unrealized`, `UnrealizedPosition`, `AllocationSlice`, `AccountFeedRow`, `AccountInfoRow`, `AccountNetGain`).

Components (all `"use client"`, in `src/components/dashboard/`):

    InvestmentsView({ refreshKey?: number })
    InvestmentHero({ label: string; value: number; stretch: Stretch | null; caption: string; hovered: SeriesPoint | null;
      points: SeriesPoint[]; today: string; range: InvestmentRange; onRangeChange: (r: InvestmentRange) => void;
      onActivePoint: (p: SeriesPoint | null) => void; firstTrustedDate: string | null; boundaries: string[] })
    InvestmentChart({ points: SeriesPoint[]; today: string; onActivePoint: (p: SeriesPoint | null) => void })
    AccountTiles({ tiles: Array<{ id: Scope; title: string; mask: string | null; value: number; change: Stretch | null; note: string }>;
      scope: Scope; onScope: (s: Scope) => void })
    InvestmentSummaryTiles({ tiles: Array<{ label: string; value: string; delta?: { direction: "up" | "down" | "flat"; tone: "positive" | "negative" | "neutral"; text: string }; note: string }> })
    HoldingsTable({ groups: HoldingGroup[]; showAccount: boolean; changeHeader: string; filter: HoldingsFilter; onFilter: (f: HoldingsFilter) => void;
      query: string; onQuery: (q: string) => void; totals: { value: number; gain: number; gainPct: number | null }; accountLabel: (id: string) => string })
    AllocationCard({ rows: ReturnType<typeof allocationRows>; total: number })
    ActivityCard({ events: InvestmentsResponse["activity"]; total: number; subtitle: string; showAccount: boolean; accountLabel: (id: string) => string;
      expanded: boolean; onToggle: () => void })

`src/app/page.tsx` renders `<InvestmentsView refreshKey={refreshKey} />` for the personal Investments destination and keeps the household placeholder.

Revision note (2026-09-29): Initial version, written after researching the current panel, route and math, the design system and the analytics redesign's conventions, and the production facts recorded in the two prior investment plans. Milestone 0 (the checked-in mock) was completed as part of writing the plan so the plan is self-contained. No implementation yet.
