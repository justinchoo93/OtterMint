# Replace the fixed range buttons with a period picker on Dashboard, Analytics and Investments

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. It is maintained in accordance with `docs/PLANS.md` at the repository root.

## Purpose / Big Picture

OtterMint's Dashboard and Analytics pages each have one time control with four buttons: 3M, 6M, 1Y and All. The Investments page has a similar one with six (1M, 3M, 6M, YTD, 1Y, All). Every option is a window that ends today, so the owner cannot look at one calendar month, one calendar year, this month so far, this year so far, or an arbitrary stretch such as March to August 2025. On 2026-10-03 the owner asked for "more robust time filters so that we can easily switch between each month, each year, YTD, 1 year, month to date".

After this change all three pages have the same period bar with three parts. (On 2026-10-03 the owner also asked for Investments to get the same control.) Six quick ranges (MTD, 3M, 6M, YTD, 1Y, All) sit in the existing segmented control. Beside them a button always shows the dates the page is covering ("May–Oct 2026", "September 2026", "2025"), flanked by two arrows that step to the previous or next month, or the previous or next year. Pressing the button opens a picker: four shortcuts (This month, Last month, This year, Last year), a year stepper with an "All of 2025" button, and a grid of twelve months. A click on a month selects it and closes the picker. Pressing on one month and dragging to another selects the range between them. Everything on the page that is scoped by time (the net worth card, the four tiles, the cash flow chart, the category list, the savings rate, the category trends, and on Investments the value chart, the range summary tiles and the activity list) follows the chosen period.

To see it working after implementation: sign in, open the Dashboard, press the button that reads "May–Oct 2026", click "Sep" in the grid, and watch the button change to "September 2026", the tiles change to September's figures with "vs Aug" beside each change, and the cash flow chart show April to September with the September column highlighted. Press the left arrow and everything moves to August. Open the picker again, press on "Mar", drag to "Jun" and release: the button reads "Mar–Jun 2026".

The design is the private canvas at https://claude.ai/artifact/EyaPtP3r23ijd6mpPeE9Nc. Its three boards are committed as `docs/design/period-picker/boards/Dashboard.dc.html`, `Analytics.dc.html` and `Phone.dc.html`, so a reader of this repository can see the target and read the reference logic without the canvas.

## Progress

- [x] (2026-10-03) Design reviewed by the owner on the canvas; boards copied to `docs/design/period-picker/boards/` with a README.
- [x] (2026-10-03) Plan written in the worktree `.claude/worktrees/period-picker` on branch `worktree-period-picker`. Nothing is committed yet.
- [x] (2026-10-04) Load-bearing assumptions validated by code inspection, a scratch vitest run and a Chromium touch test; findings are in `Surprises & Discoveries` and the plan was revised (see the revision note at the bottom).
- [x] (2026-10-04) Milestone 0: `npm ci` in the worktree; the suite ran green before any change.
- [x] (2026-10-04) Milestone 1: `render.mjs` and the static renders `desktop.html`, `analytics.html`, `phone.html` (zero leftover holes; the Analytics render shows the picker open); README lists the intended deviations.
- [x] (2026-10-04) Milestone 2: the period model (`normalizePeriod`, `describePeriod`, `resolvePeriod`, `stepPeriod`, `periodFromSpan`, `monthGridCells`, `netWorthWindow`, `trimHistory`, `betweenLabel`) with unit tests; cash flow history raised to 60 months.
- [x] (2026-10-04) Milestone 3: `PeriodBar` with popover, phone sheet, drag, Shift extension and keyboard paths; 20 tests in `period-bar.test.tsx`.
- [x] (2026-10-04) Milestone 4: Dashboard wired; `CashflowChart` highlights the period; `NetWorthOverview` shows a past period's closing figures.
- [x] (2026-10-04) Milestone 5: Analytics wired; `SavingsRateCard` summarizes the period and draws the window.
- [x] (2026-10-04) Milestone 6: Investments wired; the route takes `end` and returns `firstDate` and `end`.
- [x] (2026-10-04) Milestone 7: browser check at 1440 × 1000 and 390 × 844 on all three pages, with a mouse drag, a touch drag (Chromium), keyboard selection and the sparse net worth cases; findings and screenshots are under `docs/design/period-picker/evidence/` and in `Artifacts and Notes`. One bug found and fixed (the phone sheet; see `Surprises & Discoveries`).
- [x] (2026-10-04) Milestone 8, production check: snapshots and investment events per month counted read-only with the owner's go-ahead; findings in `Surprises & Discoveries`.
- [x] (2026-10-04) Milestone 8, merge and deploy: on the owner's instruction, `worktree-period-picker` fast-forwarded to `origin/main` at `e6f8a50` and deployed with `scripts/deploy.sh`; health check `{"status":"ok","db":"ok"}`; the server's checkout is at `e6f8a50`; the new `end` parameter answers 401 without a session, as every authenticated route does.
- [ ] Milestone 8, remaining: the owner drags across months in the picker once on their iPhone. If the drag does not extend on iOS Safari, add a tap-first-month, tap-last-month mode for touch.

## Surprises & Discoveries

- Observation: the net worth routes cannot return a window that ends in the past; they take only `days` counted back from today.
  Evidence: `src/app/api/net-worth/route.ts` computes `sinceDate` from `days` and passes one `startDate` to `buildUserNetWorthHistory`. The plan trims in the browser instead of changing the routes (see the Decision Log).

- Observation: the cash flow route caps history at 24 months, which stops whole past years from being selectable within months of shipping.
  Evidence: `src/app/api/analytics/cashflow/route.ts` has `Math.min(parsed, 24)`. Production transactions start on 2025-01-01, so in January 2027 a 24-month window starts in February 2025 and 2025 is no longer a whole year.

- Observation: net worth history is sparse, so a single past month often has one point or none. January to June 2026 hold exactly one reconstructed month-end point each, nothing exists before 2026-01-31, and later points are written only when the owner refreshes or edits accounts (there is no scheduled capture).
  Evidence: `docs/plans/statement-net-worth-backfill.md` ("six January–June estimates were then inserted"), `docs/design/analytics-redesign/harness/prod-fixtures.js` lines 24–35 (month-end points to June, weekly from July), `comparableChange` returns null under two points, and `NetWorthChart.tsx` prints "Not enough history in this range". The plan now fetches a week before the period start so the previous close can serve as a baseline, and defines the one-point and no-point states.

- Observation (production, 2026-10-04, read-only over ssh): net worth history now starts on 2025-01-31, not 2026-01-31 as the checked-in docs said; a later backfill added 2025. January 2025 to June 2026 have exactly one month-end point each; July 2026 onward have 13 to 17 points a month. So every month from January 2025 has a value, every month from February 2025 has a change from the previous close, and the year 2025 draws twelve points. No snapshot has negative liabilities. Investment balance history also starts on 2025-01-31, which is the Investments picker's lower bound.
  Evidence: `2025-01 | 1 | 2025-01-31` through `2026-06 | 1 | 2026-06-30`, then `2026-07 | 13`, `2026-08 | 13`, `2026-09 | 17`; `negative_liabilities 0`; `first_balance 2025-01-31`.

- Observation (production, 2026-10-04): no single month exceeds the 200-event activity cap (the busiest is June 2026 with 148), but longer periods do: June to July 2026 is 276, the year 2025 is 229, and today's 6M is 435. The list then shows the period's newest 200 and its footer gives the true total; contributions and income are computed from uncapped lists, so only the visible list is shortened. The 6M, YTD, 1Y and All ranges were already over the cap before this work.
  Evidence: events per month `2026-03 | 60`, `2026-05 | 61`, `2026-06 | 148`, `2026-07 | 128`, `2026-08 | 58`, `2026-09 | 35`; 2025 months sum to 229.

- Observation: trimming net worth snapshots alone leaves three things reading "through today": `coverageEvents` (which drive the "About this chart" notes), each point's adjusted values and `flat_normalized` quality (they include account changes after the period end), and `sinceLabel`, which has no end date.
  Evidence: `src/lib/net-worth-history.ts` lines 267–293 and `NetWorthOverview.tsx` lines 67–75 and 104. For past periods the plan trims `coverageEvents`, uses reported values only, and uses a label with both ends.

- Observation: browser-side trimming does not work for Investments. The route keeps only the newest 200 events between the window start and today, so events after a past period's end crowd out the period's own; `activityTotal` counts the whole window; the twelve-month income figure is anchored to today; the response holds no date earlier than the window start, so the picker's lower bound cannot be read from it; and the holdings "change" column and the account tiles' change are both measured over the fetched window.
  Evidence: `src/app/api/analytics/investments/route.ts` line 36 (`ACTIVITY_CAP = 200`), 174 (`row.date >= since`), 194 (`trailingTwelveMonths(today)`), 216 and 252–253 (newest-first sort, slice, total), 280 (`gte(userNetWorthSnapshots.date, since)`); `src/lib/investments-model.ts` line 373; `InvestmentsView.tsx` lines 153, 172 and 342. Only `InvestmentsView.tsx` line 241 calls the route, so the route changes instead (Milestone 6).

- Observation: the Investments "1M" range is already month to date, not a rolling month.
  Evidence: `investmentDaysForRange` in `src/lib/investments-model.ts` line 130 starts at `Date.UTC(year, monthIndex - (months - 1), 1)`, which for one month is the first of the current month. So the shared MTD preset replaces 1M with no change in behavior, only in label.

- Observation: on touch screens, releasing pointer capture on the button does nothing when the finger lands on a child of the button, and then no other cell ever receives `pointerenter`. `pointermove` on the grid with `document.elementFromPoint` finds the right cell whether or not capture is held.
  Evidence (2026-10-04, Chromium 154 with a touch context, touch events sent through the browser's debugging protocol): release on `currentTarget` gave `capBtn=false capTarget=true` and no `pointerenter` on siblings; `pointermove` plus `elementFromPoint` gave cells 0→1→2 in every mode. The drag in Milestone 3 uses `pointermove` only. iOS Safari was not tested; that is the manual check in Milestone 8.

- Observation: a click made with Enter or Space has `detail` 0, and with Shift held has `shiftKey` true, in Chrome; neither is specified, and Firefox and Safari were not tested. The plan adds an explicit key handler for Shift+Enter and Shift+Space instead of relying on it.
  Evidence: the same Chromium run: Enter and Space gave `detail=0 shift=false`, Shift+Enter gave `detail=0 shift=true`, a mouse click gave `detail=1`.

- Observation: the component tests can be written as planned. In this repository's jsdom 28 with React 19.2.3 and Testing Library 16.3.2, `fireEvent.pointerDown` carries `shiftKey` and `pointerId`, `fireEvent.pointerUp` on a child reaches the parent's handler, and `fireEvent.click` has `detail` 0. jsdom has no pointer capture methods and no layout, so `document.elementFromPoint` must be stubbed in tests.
  Evidence: a scratch test run with the repository's vitest 4.1.8, five of five passing; log lines `{"shift":true,"pid":7,...}`, `["up target=p current=p","up target=c current=p"]`, `[0,1,0]`.

- Observation: the browser harness fixtures are pinned to September 2026 and do not pin the browser clock, so against the real date their month list no longer ends in the current month. `docs/design/analytics-redesign/harness/mock-fixtures.js` also stops at 48 months of data.
  Evidence: `prod-fixtures.js` line 19 `TODAY = Date.UTC(2026, 8, 26)`; `docs/design/investments-redesign/harness/mock-fixtures.js` line 20 `TODAY = Date.UTC(2026, 8, 29)`. Milestone 7 pins the clock in each harness file.

- Observation: the worktree has no `node_modules`, so no test can run until dependencies are installed there.
  Evidence: `ls` of the worktree; `package-lock.json` is identical to the main checkout's.

- Observation: the phone bottom sheet rendered at the bottom of the page instead of the bottom of the screen. Each page's root has the `animate-fade-in` class, whose animation ended on `transform: translateY(0)` and kept it (`animation-fill-mode: both`); an element with a transform becomes the reference box for `position: fixed` descendants, so the sheet was fixed to the page container.
  Evidence (2026-10-04, harness at 390 × 844): the dialog measured 16 px in from each side with the page scrolled to its end. After changing the fill mode to `backwards` in `src/app/globals.css` (the end state is the element's natural state, so nothing needs holding) it measured `left: 0`, `width: 384` (the viewport less the scrollbar), `bottomGap: 0`. Setting the last keyframe to `transform: none` alone did not fix it.

- Observation: the picker's cells animate their colors, so a screenshot taken the instant a drag reaches a cell shows the tint mid-transition. The checks wait half a second before capturing.
  Evidence: class names read during a drag from May to August: `May:solid Jun:tint Jul:tint Aug:solid`, identical at both widths.

## Decision Log

- Decision: keep rolling ranges as segments and add calendar periods through a picker, instead of one long row of buttons or a date-range calendar.
  Rationale: rolling ranges are few and switched constantly, so buttons suit them; calendar months and years are many and need a grid and arrows. The cash flow data is monthly, so day-level picking would offer precision the charts cannot show.
  Date/Author: 2026-10-03, owner and Claude (design review).

- Decision: a click on a month selects that month and closes the picker; a custom range is made by pressing on one month and dragging to another. Shift-click (and Shift+Enter from the keyboard) extends from the current period's first month to the clicked month.
  Rationale: the owner asked for this on 2026-10-03 after trying a two-click range ("single click on a month should just be a month selection"). Drag cannot cross years because the grid shows one year, and it has no keyboard equivalent, so Shift covers both. On a phone a cross-year range is not reachable; the owner uses the app mostly on desktop and this was accepted in review.
  Date/Author: 2026-10-03, owner.

- Decision: the arrows step by month when the period is one month or month to date, by year when it is one year or year to date, and are disabled for 3M, 6M, 1Y, All and custom ranges.
  Rationale: a rolling window or an arbitrary range has no obvious unit to step by. Disabled arrows keep the bar's width stable, which hiding them would not.
  Date/Author: 2026-10-03, Claude; shown to the owner in review.

- Decision: selecting the current month is the same as MTD, selecting the current year is the same as YTD, and a range whose two ends are the same month is that month. The model normalizes these so each period has exactly one representation.
  Rationale: otherwise the MTD segment would be unlit while the page shows month to date, and tests would need to cover duplicate states.
  Date/Author: 2026-10-03, Claude.

- Decision: when the period is shorter than three months, the cash flow chart draws the six months ending at the period's last month and highlights the period's columns. Clicking a column selects that month. The dismissible month chip is removed.
  Rationale: a column chart with one column says nothing. The Dashboard already highlights a clicked month inside its range; this makes that the same mechanism as the picker instead of a second one.
  Date/Author: 2026-10-03, Claude; shown to the owner in review.

- Decision: for a period that ended before today, the net worth card shows the value at the end of that period, labelled "Net worth at the end of Sep 2026", and its assets and liabilities come from the last history point in the period.
  Rationale: showing today's net worth above a chart of last year reads as a mismatch.
  Date/Author: 2026-10-03, Claude; shown to the owner in review.

- Decision: net worth history is fetched from seven days before the period's first day to today with the existing `days` parameter. The last point before the period's first day is kept as the baseline and earlier points are dropped. For a period that ended before today the card also drops points and coverage events after the period end, uses reported values only, and labels the change with both ends ("Sep 1–30"). The routes do not change.
  Rationale: the routes are shared with the household view and share links and are covered by row-level-security tests. History is sparse (one month-end point per month before July 2026), so without the previous close a single month would have no change to show. The seven days also absorb the one-day slips validation found around daylight-saving changes and UTC midnight.
  Date/Author: 2026-10-03, Claude; revised 2026-10-04 after validation.

- Decision: when a past period has one net worth point, show its value with no change line and the chart's existing "Not enough history in this range" message; when it has none, show "No net worth history for this period." The picker's lower bound on Dashboard stays the first month with transactions, so 2025 is selectable for cash flow even though net worth starts on 2026-01-31.
  Rationale: cash flow and net worth have different history starts; disabling months that have real transactions would hide data.
  Date/Author: 2026-10-04, Claude.

- Decision: the Investments page shares `PeriodBar` and the period model. Its presets are the same six; MTD replaces the button labelled 1M, which already meant month to date. The bar moves from inside the hero card to the top of the page, as on the other two pages. Its default stays 3M.
  Rationale: the owner asked whether Investments could share the component (2026-10-03). Validation showed 1M and MTD are the same window, so no per-page preset list is needed.
  Date/Author: 2026-10-04, owner and Claude.

- Decision: for Investments, the route `GET /api/analytics/investments` gains an optional `end` date and a `firstDate` field, instead of trimming in the browser.
  Rationale: validation falsified browser trimming on four counts (the 200-event cap, the whole-window total, the today-anchored income figure, and no way to learn the first history date). Only the Investments page calls this route, so changing it is contained.
  Date/Author: 2026-10-04, Claude.

- Decision: on Investments, for a period that ended before today, the value chart, the hero value and change, the range summary tiles, the account tiles' change and the activity list follow the period. The holdings table, the allocation card, the "Unrealized gain" tile and the account tiles' balances stay as of today and say so, and the holdings table's range-change column is hidden.
  Rationale: positions as of a past date would need historical holdings and prices per position, a larger change than the owner asked for. A change column measured from the period start to today would be wrong under a past period's heading, and hiding it is simpler than adding an end price to every position.
  Date/Author: 2026-10-04, Claude.

- Decision: `PeriodBar` does not take a `ResolvedPeriod`. A pure `describePeriod(period, today)` gives the button label, the dates and the step unit from the period and today alone, and `resolvePeriod` builds on it.
  Rationale: Investments and the household view have no cash flow month list, and the first draft contradicted itself by resolving against an empty list while also falling back to 6M for periods outside the list.
  Date/Author: 2026-10-04, Claude.

- Decision: a drag is tracked with `pointermove` on the month grid plus `document.elementFromPoint`, not with `pointerenter` after releasing pointer capture. Keyboard range extension uses an explicit key handler for Shift+Enter and Shift+Space.
  Rationale: the release approach fails on touch when the press lands on a child of the button, and modifier state on keyboard-made clicks is unspecified outside Chrome (see `Surprises & Discoveries`).
  Date/Author: 2026-10-04, Claude.

- Decision: accept two residual risks without further checking now. First, the 60-month cash flow request cannot be timed meaningfully until 2027, because production data starts in January 2025 and the 60-month and 24-month requests return the same rows today. Second, snapshot dates are UTC dates while the server runs in Pacific time, so a refresh after 5 pm Pacific on the last day of a month is dated the first of the next month.
  Rationale: neither changes the design; both are recorded so the next reader does not rediscover them. If the cash flow request grows slow, split the line items out of the months payload.
  Date/Author: 2026-10-04, Claude.

- Decision: raise the cash flow history from 24 to 60 months (the route's cap and `CASHFLOW_FETCH_MONTHS`).
  Rationale: browsing whole years is the point of the feature and 24 months stops covering 2025 in January 2027. Sixty months is about 3,000 more aggregated rows at the owner's volume. If the response is slow in the production check (Milestone 7), fall back to 36 and record it here.
  Date/Author: 2026-10-03, Claude.

- Decision: whenever the period ends in the current, incomplete month, the Dashboard compares like for like (the last month of the comparison is counted through the same day of the month), as the Analytics page already does.
  Rationale: month to date against a whole previous month would always look like a collapse. This changes the Dashboard's existing 3M, 6M and 1Y deltas slightly, in the direction of being correct.
  Date/Author: 2026-10-03, Claude.

- Decision: the three pages keep separate period state with their current defaults (Dashboard 6M, Analytics 1Y, Investments 3M), and the period is not remembered across visits. The Year to date card and the Recurring charges card on Analytics stay unscoped.
  Rationale: the owner asked for richer filters, not shared or persistent state. Each of these can be added later without changing the model.
  Date/Author: 2026-10-03, Claude.

## Outcomes & Retrospective

Milestones 0 to 7 are complete on branch `worktree-period-picker` (2026-10-04); nothing is merged or deployed. All three pages use one `PeriodBar`, and every scenario in `Validation and Acceptance` was observed in the browser harness at desktop and phone widths. `npx vitest run --dir src` reports 605 passed and 41 skipped across 58 files; `npx tsc --noEmit -p .` reports no errors under `src/`; `npm run lint` reports no errors (one warning in `src/lib/sync-holdings.ts` that predates this work).

What remains is Milestone 8: the read-only production check, the merge, the deploy, and a drag on a real iPhone. The touch drag is proven in Chromium only.

Lessons. Validating assumptions before writing code changed the design in six places and each change held up in implementation. The one bug the browser found (the phone sheet) was not on the assumption list, because it came from an unrelated animation on the page root; a check in the real browser at phone width caught what 605 unit tests could not.

## Context and Orientation

OtterMint is a personal-finance web app: Next.js 16 (App Router), React 19, Tailwind CSS 4, with tests in Vitest and Testing Library. The whole signed-in app is one page, `src/app/page.tsx`. Its sidebar switches a `activeDestination` value; "dashboard" renders `AnalyticsView` and "analytics" renders `TrendsView`. The names are historical: the component called `AnalyticsView` is the Dashboard page and `TrendsView` is the Analytics page. This plan calls them by their page names and gives the file each time.

The Dashboard page is `src/components/dashboard/AnalyticsView.tsx`. It holds `range` (one of "3M", "6M", "1Y", "ALL"; default "6M") and `selectedMonth` (a "YYYY-MM" string or null). It fetches `/api/analytics/cashflow?months=24` once and slices everything from that list. It renders, top to bottom: a `SegmentedControl` for the range with a dismissible `Chip` for the selected month and a caption; `NetWorthOverview`; four `StatTile`s (Income, Spending, Saved, Net cash flow); `CashflowChart` beside `CategoryList`; and `AnalyticsDetails`, a panel that opens when a tile or category is pressed.

The Analytics page is `src/components/dashboard/TrendsView.tsx`. It holds its own `range` (default "1Y"), fetches the same cash flow list, and renders the same `SegmentedControl`, then `SavingsRateCard`, `CategoryTrendsCard` beside `YearToDateCard`, then `RecurringChargesCard`. Only the first two follow the range.

All period arithmetic lives in one pure file, `src/lib/analytics-model.ts` (no React, no server imports), tested by `src/__tests__/analytics-model.test.ts`. The parts this plan changes are these. `AnalyticsRange` and `ANALYTICS_RANGES` define the four ranges and their month counts. `CASHFLOW_FETCH_MONTHS` is 24. `resolvePeriod(months, { range, month })` returns a `ResolvedPeriod`: `windowMonths` (the months the chart draws), `periodMonths` (the months the tiles and categories sum, which is the window or the one selected month), `priorMonths` (the equal-length months immediately before, or null when data does not cover them), and the labels `periodLabel`, `comparisonLabel` ("Compared with the previous 6 months"), `comparisonShortLabel` ("vs prior 6 mo") and `historyStartsLabel` ("History starts Jan 2025"). `netWorthDaysForRange(range, today)` gives the number of days of net worth history to request. `likeForLikePrior(period)` returns the prior months with the last one counted only through today's day of the month when the period ends in the current month; `asToDate(month)` does that conversion for one month. `spanLabel(months)` formats "Apr–Sep 2026", "Oct 2025–Sep 2026" or "August 2026". `firstDataMonthIndex(months)` is the index of the first month with any money in it.

A `CashflowMonth` (defined in `src/lib/cashflow.ts`) is one calendar month of totals: `month` ("YYYY-MM"), `partial` (true only for the current month), `income`, `spending`, `savings`, `netCashFlow` as decimal strings, `spendingByCategory`, and an optional `toDate` holding the same figures counted only through today's day of the month. The list the route returns is oldest first and always ends with the current month.

The cash flow route is `src/app/api/analytics/cashflow/route.ts`. It reads `months` from the query string, defaults to 6, and caps at 24. `src/__tests__/cashflow-route.test.ts` asserts the cap ("defaults to six months and clamps the months parameter").

The net worth card is `src/components/dashboard/NetWorthOverview.tsx`. It takes `days`, fetches `/api/net-worth?days=N` (or `/api/groups/<id>/net-worth?days=N` for the household view), and shows today's net worth from the account balances passed in as props, the change over the comparable stretch of history via `comparableChange(history.snapshots, mode)`, the line chart `NetWorthChart`, and an assets and liabilities block. Each history point (`NetWorthSnapshotRow` in `src/lib/net-worth-history.ts`) has `date` ("YYYY-MM-DD"), `netWorth`, `totalAssets` and `totalLiabilities` as strings. Both routes accept only `days`, counted back from today, capped at 3650.

The cash flow chart is `src/components/dashboard/CashflowChart.tsx`. It takes `months`, `windowLabel`, `selectedMonth` and `onSelectMonth`. Each month is a button with `aria-pressed` and `data-month`; pressing a selected month passes null to deselect.

The reusable controls are in `src/components/ui/`: `SegmentedControl.tsx` (a group of `aria-pressed` buttons, 44 px tall on phones and 30 px from the `sm` breakpoint), `Chip.tsx`, `Card.tsx`, `Button.tsx`, and the class joiner `cx.ts`. Design tokens are Tailwind utilities defined in `src/app/globals.css`: surfaces `bg-surface`, `bg-surface-raised`, `bg-surface-hover`, `bg-surface-active`; borders `border-line`; text `text-ink`, `text-ink-secondary`, `text-ink-muted`; the mint accent `bg-accent`, `border-accent`, `bg-accent-dim`, `text-on-accent`; radii `rounded-control` (10 px) and `rounded-tile` (14 px); and `shadow-popover`. Icons come from `lucide-react`. `docs/design-system.md` is the guide; new code uses the utilities, not `var(--...)`.

The Investments page is `src/components/dashboard/InvestmentsView.tsx`, rendered for the "investments" destination. It holds `range` (an `InvestmentRange`: "1M", "3M", "6M", "YTD", "1Y" or "ALL"; default "3M"), turns it into a day count with `investmentDaysForRange` from `src/lib/investments-model.ts`, and fetches `/api/analytics/investments?days=N`. It renders `InvestmentHero` (the value, the change, the line chart, and the range `SegmentedControl` beneath the chart), `AccountTiles` (one tile per account, which also filter the page to that account), `InvestmentSummaryTiles` (figures for the range), `HoldingsTable`, `AllocationCard` and `ActivityCard`. The route is `src/app/api/analytics/investments/route.ts`, tested by `src/__tests__/investments-route.test.ts`; the page is tested by `src/__tests__/investments-view.test.tsx` and the model by `src/__tests__/investments-model.test.ts`. The route computes `since` as today minus `days` and returns, among other things: `portfolio.points` and each account's `points` (dated values on or after `since`, with a live point for today appended), `flows` and `income` (dated, on or after `since`), `activity` (the newest 200 events on or after `since`) with `activityTotal`, `incomeTrailingTwelveMonths` (the twelve months ending today), `positions` (current holdings, each with a `startPrice` taken from the first holding snapshot on or after `since`), and `today`. The page derives the change figures in the browser with `latestStretch` and `summarizeStretch` from the model.

The household view (a `groupId` prop on the Dashboard and Analytics pages) shows net worth only and does not fetch cash flow. The Investments page has no household view.

Three facts about the environment. The development machine cannot reach any database, so the real page is exercised locally through a browser harness: the auth middleware only checks that a UUID-shaped `session_id` cookie exists, and `docs/design/analytics-redesign/harness/prod-fixtures.js` answers every `/api/*` request inside a Playwright browser with production-like data (its `cashflow(months)` function builds the months list). Second, bare `vitest` and `tsc` pick up stale copies of the source under `.claude/worktrees/`, so run tests as `npx vitest run --dir src`. Third, this repository does not use pull requests: work is merged straight to `main` under the `github-personal` identity, and deployment runs on a home server through `scripts/deploy.sh`.

Terms used below. A "period" is what the page is showing: a quick range, one month, one year, or a custom range of months. A "rolling range" is a period that always ends today (3M, 6M, 1Y, All). "MTD" (month to date) is the current month so far. "YTD" (year to date) is January of this year through today. "Like for like" means comparing a partial period with the same number of days of an earlier one. A "popover" is a small panel that floats over the page below the control that opened it; a "bottom sheet" is the same panel attached to the bottom edge of a phone screen.

## Plan of Work

### Milestone 0: make the worktree runnable

The worktree has no installed dependencies. From the worktree root run `npm ci`, which installs exactly what `package-lock.json` lists into the worktree's own `node_modules` and touches nothing else. No `.env` file is needed for the tests; if `npm run dev` later refuses to start without one, copy `.env.example` to `.env` in the worktree (the harness answers every `/api/*` request in the browser, so no real secrets or database are used). Acceptance: `npx vitest run --dir src` runs and passes with the code unchanged.

### Milestone 1: the design reference

The three boards are already in `docs/design/period-picker/boards/`. Make them viewable without the canvas. Copy `docs/design/investments-redesign/render.mjs` to `docs/design/period-picker/render.mjs` and change only its list of boards so it renders `Dashboard.dc.html` to `desktop.html`, `Analytics.dc.html` to `analytics.html` and `Phone.dc.html` to `phone.html` in `docs/design/period-picker/`. The script evaluates each board's `Component.renderVals()` and expands the `{{ }}` holes, `<sc-for>` and `<sc-if>` into static HTML. The boards declare their state as a class field (`state = INITIAL`), while the script's stand-in base class sets `this.state = {}` in its constructor; a class field on the subclass is assigned after the base constructor returns, so the board's state wins and no change is needed, but confirm it by checking that `analytics.html` shows the picker open. Extend `docs/design/period-picker/README.md` with how to re-render and a section "Intended deviations in the implementation" listing these: the app keeps its real header, sidebar and cards (the boards simplify them); the cash flow chart keeps its diverging income-above, spending-below form with the Saved series; the net worth card keeps its assets and liabilities block and "since <date>" wording; the Analytics page keeps its real Year to date and Recurring charges cards where the board shows a note card; all figures on the boards are generated samples.

Acceptance: opening the three HTML files in a browser shows the bar, the open picker with March to August 2025 tinted and its two end months solid, and the phone sheet; searching the rendered files for `{{` finds nothing.

### Milestone 2: the period model

All edits are in `src/lib/analytics-model.ts` and `src/__tests__/analytics-model.test.ts`, plus the 60-month change. Write the tests first; each paragraph below names what to assert.

Replace `AnalyticsRange` and `ANALYTICS_RANGES` with the types in the Interfaces section: `PeriodPresetId`, `Period`, and `PERIOD_PRESETS` (the six segments in order MTD, 3M, 6M, YTD, 1Y, All, with `months` of 3, 6 and 12 for the rolling ones and null for the others). Set `CASHFLOW_FETCH_MONTHS` to 60.

Add `describePeriod(period, today)`, which needs no month list. It normalizes the period (next paragraph) and returns `buttonLabel`, `startDate`, `endDate`, `endsToday`, `stepUnit`, and `firstMonth` and `lastMonth` (the period's first and last "YYYY-MM"). For All it returns `startDate` ten years back (`ALL_RANGE_DAYS`) and the label "All time"; `resolvePeriod` replaces both with the real first data month when it has a month list. `PeriodBar`, the household view and the Investments page use `describePeriod` directly.

Add `normalizePeriod(period, today)`. A month equal to today's month becomes the MTD preset; a year equal to today's year becomes the YTD preset; a range whose `from` and `to` are equal becomes that month (and then MTD if it is the current month); a range given backwards is swapped. Everything else is returned unchanged. Test each rule.

Change `resolvePeriod` to `resolvePeriod(months, period, today)`. It first normalizes. It then finds the period's months as indexes into `months`, clipped to the first data month (as today) and to the list. For 3M, 6M and 1Y: the last N months, as now. For All: from the first data month to the end. For MTD: the last month only. For YTD: January of today's year to the end. For a month: that month. For a year: January to December of that year. For a range: `from` to `to`. If the list is not empty and a month, year or range lies wholly outside it, treat the period as 6M so a stale selection can never produce an empty page (the Dashboard already ignores a selected month that has left the window; this keeps that safety). `resolvePeriod` is never called with an empty list for anything but the loading state, where it returns empty month arrays and `describePeriod`'s labels. `periodMonths` is those months. `windowMonths` is the same months when there are three or more, and otherwise the six months ending at the period's last month, clipped to the first data month; set the new field `highlightPeriod` to true in that second case.

`priorMonths` follows the kind of period. Rolling ranges and custom ranges: the equal-length months immediately before, when data covers all of them. One month and MTD: the month before. YTD: the same calendar months of the previous year. One year: the twelve months of the previous year, only when data covers all twelve. In every case return null when the first data month is later than the first prior month. Remove the existing rule that a lone partial month has no comparison; the like-for-like conversion below makes it comparable. Do not apply `asToDate` inside `resolvePeriod`; callers keep using `likeForLikePrior(period)`, which already converts the last prior month when the period's last month is partial.

Labels. `periodLabel` stays as it is for multi-month periods (`spanLabel`) and becomes the long month name for one month, with " · month to date" appended for the partial month as now. `buttonLabel` comes from `describePeriod`, except that for rolling ranges and All it is `spanLabel(periodMonths)` so it reflects clipping to the first data month: `spanLabel(periodMonths)` for rolling ranges, All and custom ranges ("May–Oct 2026"); "Oct 1–3, 2026" for MTD, and "Oct 1, 2026" on the first of the month; "Jan 1–Oct 3, 2026" for YTD; the long month name for one month ("September 2026"); the year for one year ("2025"). `comparisonLabel` and `comparisonShortLabel`: for one month "Compared with August 2026" and "vs Aug" (unchanged); for MTD "Compared with September 1–3" and "vs Sep 1–3"; for YTD "Compared with Jan–Oct 2025" and "vs 2025 to date"; for one year "Compared with 2024" and "vs 2024"; otherwise "Compared with the previous N months" and "vs prior N mo" (unchanged). `historyStartsLabel` keeps its current rule.

Four fields come straight from `describePeriod` and are used by the net worth card and the arrows: `startDate` (first day of the first period month, "YYYY-MM-DD"), `endDate` (today when the period's last month is the current month, otherwise the last day of that month), `endsToday` (boolean), and `stepUnit` ("month" for one month and MTD, "year" for one year and YTD, null otherwise).

Add `stepPeriod(period, direction, bounds, today)` where direction is -1 or 1 and bounds are the first data month and today's month. For a month unit it returns the neighbouring month; for a year unit the neighbouring year; it returns null when there is no unit or the neighbour falls outside the bounds (for a year, when the neighbouring year has no month inside the bounds). The result is normalized, so stepping forward from September 2026 on 2026-10-03 gives MTD and stepping back from YTD gives the year 2025.

Add `monthGridCells(year, selection, bounds, today)` for the picker. `selection` is `{ from, to, solidEnds }` in "YYYY-MM" keys: the period's first and last month, or the months under an active drag. It returns twelve cells, January first, each with `month` ("YYYY-MM"), `label` ("Jan"), `disabled` (outside the bounds), `inRange`, `solid` (true when the cell is in range and either the selection is one month or `solidEnds` is set and the cell is an end), and `current` (today's month). Test a year fully in range, a year that straddles the first data month, a single-month selection, and a range that spans two years viewed from each year.

Add `periodFromSpan(a, b, today)`: the normalized period for a drag or Shift-click between two month keys given in either order.

Replace `netWorthDaysForRange` with `netWorthWindow(dates, today)` returning `{ days, startDate, endDate }`, where `dates` is anything with `startDate`, `endDate` and `endsToday` (a `ResolvedPeriod` or a `describePeriod` result). `days` is the whole days from `startDate` to today plus 7, at least 1 and at most `ALL_RANGE_DAYS`; the extra week lets the card find the previous close (history before July 2026 is one month-end point per month). `startDate` is passed through. `endDate` is null when `endsToday` and the period's `endDate` otherwise. Add `trimHistory(snapshots, startDate, endDate)`: keep snapshots dated on or before `endDate` (all of them when it is null), and of those dated before `startDate` keep only the last one, as the baseline. Test it with month-end-only data: for March 2026 with points on Jan 31, Feb 28, Mar 31 and Apr 30 it returns Feb 28 and Mar 31.

Update the existing `resolvePeriod` and `netWorthDaysForRange` tests in `src/__tests__/analytics-model.test.ts` to the new signatures; their expected values for 3M, 6M and 1Y must not change, which proves the rolling ranges behave as before.

Then the 60-month change: in `src/app/api/analytics/cashflow/route.ts` change `Math.min(parsed, 24)` to `Math.min(parsed, 60)`, and in `src/__tests__/cashflow-route.test.ts` change the clamp assertion from 24 to 60.

Acceptance: `npx vitest run --dir src src/__tests__/analytics-model.test.ts src/__tests__/cashflow-route.test.ts` passes, with new tests for `normalizePeriod`, each period kind in `resolvePeriod`, `stepPeriod`, `describePeriod`, `monthGridCells`, `periodFromSpan`, `netWorthWindow` and `trimHistory`. The two page components will not compile yet; that is expected until Milestones 4 and 5, so do not run `tsc` as a gate here.

### Milestone 3: the PeriodBar component

Create `src/components/dashboard/PeriodBar.tsx` and `src/__tests__/period-bar.test.tsx`. The component is a controlled control: it receives the period and reports changes; it owns only whether the picker is open, which year the grid shows, and an in-progress drag. It derives its labels and arrow state from `describePeriod(period, today)` and `stepPeriod`, so it works on pages with no cash flow list. Its props are in the Interfaces section.

Layout, left to right, wrapping on narrow screens (`flex flex-wrap items-center gap-3`): the existing `SegmentedControl` with the six presets (`fullWidth` with `sm:inline-flex sm:w-auto`, as both pages use today), its `value` being the preset id when the period is a preset and an empty string otherwise so that no segment is lit; then a group holding a previous arrow, the period button and a next arrow; then the caption text the page passes in. The arrows are square buttons with `ChevronLeft` and `ChevronRight` from `lucide-react`, 44 px on phones and 34 px from `sm`, with `aria-label` "Previous month", "Next month", "Previous year" or "Next year" according to `stepUnit`, and `disabled` when `stepPeriod` returns null. The period button shows a `Calendar` icon, the label and a `ChevronDown`; the label is the `label` prop when the page passes one (the Dashboard and Analytics pass `resolved.buttonLabel`, which reflects clipping to the first data month) and `describePeriod`'s `buttonLabel` otherwise; it has `aria-haspopup="dialog"` and `aria-expanded`; its border is `border-line` for a preset and `border-accent` for a month, year or range. Use the same surface classes as `SegmentedControl` and `Chip` (`rounded-control border bg-surface-raised text-caption font-medium`).

The picker is a `div` with `role="dialog"` and `aria-label="Choose a period"`. From the `sm` breakpoint it is a popover: absolutely positioned under the period button, 328 px wide, `rounded-tile border border-line bg-surface-raised p-3.5 shadow-popover`. Below `sm` it is a bottom sheet: fixed to the bottom of the viewport, full width, with rounded top corners, a title "Choose a period", a "Done" button, and a dimmed backdrop. In both forms a full-viewport transparent or dimmed `button` with `aria-label="Close period picker"` sits behind it and closes it. Escape closes it. Closing returns focus to the period button. Opening sets the shown year to the year of the period's last month.

Inside the picker, top to bottom: a two-by-two grid of shortcut buttons, "This month" (MTD), "Last month" (the month before today's), "This year" (YTD) and "Last year" (the year before today's), each `aria-pressed` when it is the current period and disabled when it falls before the first data month; a hairline; a row with "Earlier year" and "Later year" arrow buttons around the shown year, disabled at the bounds, and on the right a button "All of 2025" that selects that year (disabled when the year has no month inside the bounds); the month grid, four columns by three rows, from `monthGridCells`; and a one-line hint. The hint reads "Select a month, or drag across months for a range. Shift-click reaches across years." and, while a drag covers more than one month, "Release to select Mar–Aug 2025.".

Month cell styling: in range and solid is `bg-accent text-on-accent`; in range and not solid is `bg-accent-dim text-ink`; otherwise `text-ink` on transparent; disabled is `text-ink-muted opacity-40`; the current month has a `border-ink-muted` outline. Cells are 44 px tall on phones and 38 px from `sm`. Each cell is a `button` with `aria-label` "March 2025" and `aria-pressed` equal to `inRange`.

Selection behavior, which is the heart of this milestone. Pointer events are the browser's unified mouse, touch and pen events (`onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel` in React). Give every month cell a `data-month="YYYY-MM"` attribute. On `pointerdown` on an enabled cell without Shift: store the drag `{ from: month, to: month }`. On `pointermove` on the grid container while a drag is active: find the cell under the pointer with `document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-month]")`, and if it is an enabled cell whose month differs from the drag's `to`, set `to`. This hit-testing is used instead of `pointerenter` on the cells because a finger press captures later pointer events to the element first touched, so the other cells never see the finger arrive; `pointermove` on the container works whether or not that capture is held (verified in Chromium with a touch context; see `Surprises & Discoveries`). On `pointerup` anywhere in the dialog while a drag is active: call `onChange(periodFromSpan(from, to, today))`, clear the drag and close. On `pointerleave` of the dialog or `pointercancel` while a drag is active: clear the drag and change nothing. On `pointerdown` with Shift held: call `onChange(periodFromSpan(first month of the current period, this month, today))` and close. Give the grid `touch-action: none` and `user-select: none` (Tailwind `touch-none select-none`) so a finger drag does not scroll the page or select text. While a drag is active the grid is drawn from the drag (`solidEnds` true) instead of from the period.

Keyboard users have no pointer events. Each cell has `onKeyDown`: Shift+Enter or Shift+Space extends from the current period's first month to this month, calls `preventDefault()` so no click follows, and closes. Each cell also has `onClick`: when `event.detail === 0` (browsers set `detail` to 0 for a click produced by Enter or Space, and to 1 or more for a mouse or touch click) select that month and close; otherwise do nothing, because the pointer handlers already handled it. Closing the picker inside `pointerup` unmounts the dialog before the browser sends the trailing click; confirm in Milestone 7 that this click does not land on the cash flow columns beneath the popover, and if it does, close on the click instead.

The shortcuts, the "All of" button, the segments and the arrows all call `onChange` with a normalized period; the shortcuts and "All of" also close the picker.

Tests in `src/__tests__/period-bar.test.tsx`, using Testing Library's `render`, `screen` and `fireEvent` as `src/__tests__/ui-primitives.test.tsx` does. Fix `today` at "2026-10-03" and the first data month at "2025-01". Assert: the six segments render and the active preset is pressed; a month period lights no segment and the button reads "September 2026"; the previous arrow from MTD calls `onChange` with the month 2026-09; both arrows are disabled for 6M; opening the picker shows the year of the period; `fireEvent.click` on "March 2026" (Testing Library clicks have `detail` 0, the keyboard path) calls `onChange` with that month and closes the picker; with `document.elementFromPoint` stubbed (`document.elementFromPoint = vi.fn(() => juneCell)`), `fireEvent.pointerDown` on "March 2026", `fireEvent.pointerMove` on the grid, then `fireEvent.pointerUp` on the dialog calls `onChange` with the range 2026-03 to 2026-06; the same press with `pointerLeave` on the dialog instead calls nothing; `pointerDown` with `shiftKey: true` on "February 2026" while the period is the month 2025-11 gives the range 2025-11 to 2026-02, and so does `fireEvent.keyDown` with `{ key: "Enter", shiftKey: true }`; months before January 2025 and after October 2026 are disabled; "All of 2025" gives the year 2025 and "All of 2026" gives YTD; Escape closes and focus returns to the period button. jsdom, the browser stand-in the tests run in, has no layout, which is why `document.elementFromPoint` is stubbed; restore it after each test.

Acceptance: `npx vitest run --dir src src/__tests__/period-bar.test.tsx` passes.

### Milestone 4: wire the Dashboard

In `src/components/dashboard/AnalyticsView.tsx`, replace the `range` and `selectedMonth` state with one `period` state of type `Period`, initially `{ kind: "preset", id: "6M" }`. Compute `today = todayUtc()` once per render and `period` resolution as `resolvePeriod(months, period, today)`. Remove `RANGE_OPTIONS`, the `Chip`, `activeMonth`, `clearMonth` and `changeRange`; render `PeriodBar` in place of the `SegmentedControl` block, passing the caption that is computed today (`period.comparisonLabel ?? period.historyStartsLabel`, or null for the household view) and, as bounds, the first data month (`months[firstData].month` when `firstData` is not null) and today's month. A period change also closes the details panel, as a range change does now (`setDetail(null)`). For the household view there is no cash flow list: use `describePeriod(period, today)` for the dates, pass no `label`, and use a first month sixty months before today as the lower bound.

Use like-for-like comparisons: compute `const prior = likeForLikePrior(resolved)` and pass it wherever `period.priorMonths` is passed today (the tiles' deltas, `rankCategories`, and `AnalyticsDetails`).

`CashflowChart` (`src/components/dashboard/CashflowChart.tsx`): replace the `selectedMonth` prop with `highlighted`, a list of "YYYY-MM" keys, and make `onSelectMonth` take a month key (never null). A column is drawn with the selected background (`bg-surface-hover`) and `aria-pressed="true"` when its month is in `highlighted`. The Dashboard passes the period's month keys when `resolved.highlightPeriod` is true and an empty list otherwise, and `onSelectMonth={(month) => setPeriod(normalizePeriod({ kind: "month", month }, today))}`. The value labels that the chart shows for "a selected month" on dense charts follow the single highlighted month when there is exactly one. Keep `data-month` on the columns.

`NetWorthOverview` (`src/components/dashboard/NetWorthOverview.tsx`): add three optional props, `startDate` and `endDate` ("YYYY-MM-DD") and `endLabel` ("Sep 2026"). The Dashboard passes `days`, `startDate` and `endDate` from `netWorthWindow(resolved, today)` and, when `endDate` is not null, `endLabel` as the short month and year of the period's last month. After the fetch, run the snapshots through `trimHistory(snapshots, startDate, endDate)` before anything else uses them (the chart, `comparableChange`, the normalization checks), so the previous close is the baseline of every period.

When `endDate` is set (the period ended before today) the card differs in six ways. The heading reads "Net worth at the end of Sep 2026" (household: "Household net worth at the end of Sep 2026"). The hero value, assets and liabilities come from the last remaining snapshot's `netWorth`, `totalAssets` and `totalLiabilities` (take the absolute value of the liabilities, as `computeNetWorthTotals` does per account) instead of from the live balances. `coverageEvents` passed to the chart are limited to those with `effectiveDate` on or before `endDate`. The change is computed in reported mode only, because the adjusted values include account changes that happened after the period ended. The change's caption is the period's own span from the first to the last remaining snapshot ("Sep 1–30", or with the year when it differs from today's) instead of `sinceLabel`. And the sparse cases are explicit: with one snapshot remaining, show its value, no change line, and let the chart show its existing "Not enough history in this range" message; with none, show "No net worth history for this period." in place of the value and the chart. When `endDate` is not set the card behaves as today apart from the baseline point.

Update `src/__tests__/analytics-view.test.tsx` and `src/__tests__/net-worth-overview.test.tsx`. Existing assertions that press "3M" and "6M" keep working because the segments have the same names. Replace the tests that select a month through the chip with tests that click a chart column and expect the period button to read that month and the left arrow to move one month back. Add: MTD shows "vs Sep 1–3" style captions from a fixture with `toDate` on the prior month; a past month passes `endDate` so the net worth heading reads "Net worth at the end of …" and the value comes from the snapshot; a past month with one snapshot shows the value and no change; a past month with no snapshot shows "No net worth history for this period."; a year period fetches no additional cash flow (one fetch total).

Acceptance: `npx vitest run --dir src` passes for these files, and the scenario in Purpose works in the harness (Milestone 6 records it).

### Milestone 5: wire Analytics

In `src/components/dashboard/TrendsView.tsx`, replace `range` with `period`, initially `{ kind: "preset", id: "1Y" }`, resolve it with `resolvePeriod(months, period, today)`, and render `PeriodBar` with the existing caption plus the sentence "Sets the window for savings rate and category trends". Keep `likeForLikePrior`.

`SavingsRateCard` (`src/components/dashboard/SavingsRateCard.tsx`) takes `window` (the months its line draws) and `prior`. Add a `period` prop: the months its headline rate, change, and best and lowest months summarize. Pass `resolved.windowMonths` as `window` and `resolved.periodMonths` as `period`, and compute the summary with `savingsRateSummary(period, prior)`. For periods of three months or more the two lists are identical and the card is unchanged. Hide the best and lowest months when `period` has fewer than two months.

`CategoryTrendsCard` receives rows from `categoryTrends(window, prior)`. Pass `resolved.periodMonths` instead of `windowMonths`, so totals and deltas are the period's; for a one-month period each row's small bars show one bar and the average equals the total, which is accepted. Its `windowLabel` becomes `resolved.buttonLabel`.

`YearToDateCard` and `RecurringChargesCard` are untouched.

Update `src/__tests__/trends-view.test.tsx`: the test that presses "6M" keeps working; add one that selects the year 2025 through the picker ("All of 2025") and expects the savings rate heading figure for 2025 from the fixture and no comparison caption when 2024 has no data.

Acceptance: `npx vitest run --dir src` passes in full, `npx tsc --noEmit -p .` reports no errors under `src/`, and `npm run lint` is clean.

### Milestone 6: wire Investments

This milestone changes one route and one page. Validation showed the page cannot show a past period by trimming in the browser (see `Surprises & Discoveries`), so the route learns an end date.

The route, `src/app/api/analytics/investments/route.ts`. Read an optional `end` query parameter; accept it only when it matches "YYYY-MM-DD" and is not after today, and answer 400 with `{ error: "end must be YYYY-MM-DD and not in the future" }` otherwise. When `end` is absent or equals today the response is byte-for-byte what it is now. When `end` is before today, five things respect it. The in-window filter for feed rows becomes `since <= date <= end`, which fixes `activity`, `activityTotal`, `flows` and `income` together, so the 200-event cap applies to the period's own events. The portfolio points and each account's points keep only dates on or before `end`, and the live point for today is not appended. The trailing-twelve-month income is anchored to `end` instead of today. The response gains `end` (the effective end date) beside `today`. Everything else stays as of today: account balances, `netGain`, and positions with their quantity, value and cost. Always add `firstDate`: the earliest date on which the user has investment history (the minimum over the user's net worth snapshots that carry an investment total and the investment balance snapshots), or null when there is none; compute it with one extra `min(date)` query per source inside the existing `withUser` block, not bounded by `since`. Add the two fields to `InvestmentsResponse` in `src/lib/investments-model.ts`.

Route tests in `src/__tests__/investments-route.test.ts`: an invalid or future `end` gives 400; with `end` set, events, flows and points after it are absent, no point is dated today, `activityTotal` counts only the period, and with more than 200 events after `end` the period's events still appear; the twelve-month income excludes income after `end`; `firstDate` is the earliest history date regardless of `days`; with no `end` the existing expectations hold unchanged.

The model, `src/lib/investments-model.ts`. Remove `InvestmentRange`, `INVESTMENT_RANGES` and `investmentDaysForRange`. The page gets its dates from `describePeriod(period, today)` in `src/lib/analytics-model.ts`: `days` is the whole days from `startDate` to today (at least 1; the route already caps at ten years), and `end` is sent only when `endsToday` is false. Update `src/__tests__/investments-model.test.ts` accordingly; the day counts for 3M, 6M, YTD and 1Y must equal what `investmentDaysForRange` returned, and MTD must equal the old 1M.

The page, `src/components/dashboard/InvestmentsView.tsx`. Replace `range` with `period`, initially `{ kind: "preset", id: "3M" }`. Render `PeriodBar` as the first element of the page, above `InvestmentHero`, with bounds from the month of `data.firstDate` (before the first response, or when it is null, the current month) to today's month, and no `label` prop. Remove the `SegmentedControl` and the `range` and `onRangeChange` props from `src/components/dashboard/InvestmentHero.tsx`; its "About this chart" disclosure stays where it is. A period change resets the hovered point and collapses the activity list, as a range change does now. Keep showing the previous data dimmed while a new period loads, as the page already does.

Wherever the page used the range's labels, use the period's. The holdings table's change-column header becomes "<label> change" where the label is the preset's ("3M change"), "All-time change" for All, and "Period change" for a month, year or range. The activity card's subtitle uses `describePeriod`'s `buttonLabel` ("September 2026 · 12 events") in place of the range's long label.

For a period that ended before today (`data.end < data.today`): the hero's value is the last point of the scoped series instead of the live balance, its label gains "at the end of Sep 2026", and its caption shows the stretch's two ends instead of `sinceLabel`; the range summary tiles are computed from the returned points and flows exactly as now, which is correct because the route already trimmed them; the account tiles' change follows the period for the same reason, and their balance gets the caption "today"; the "Unrealized gain" tile's note, the holdings card's subtitle and the allocation card's subtitle each say "as of today"; and the holdings table's change column is not rendered. An account that exists today but has no points in the period shows a dash for its change.

Page tests in `src/__tests__/investments-view.test.tsx`: the bar renders with 3M pressed and there is no range control inside the hero; pressing MTD requests the same `days` the old 1M did; choosing a past month through the picker requests `days` from that month's first day and `end` as its last day; with a past-period response the hero label reads "at the end of …", the holdings change column is absent and the "as of today" notes are present; months before `firstDate` are disabled in the picker.

Acceptance: `npx vitest run --dir src`, `npx tsc --noEmit -p .` and `npm run lint` are clean, and in the harness the scenario "Investments, open the picker, click a past month" shows that month's chart, change and activity with holdings marked as of today.

### Milestone 7: check it in the browser

Serve the real page with fixture data and compare with the boards. The fixtures were written for a fixed date and the app reads the real clock, so first pin the browser's clock at the top of each harness function: in `docs/design/analytics-redesign/harness/prod-fixtures.js` add `await page.clock.setFixedTime(new Date("2026-09-26T12:00:00Z"));` (its `TODAY`), and in `docs/design/investments-redesign/harness/mock-fixtures.js` the same with `2026-09-29T12:00:00Z`. `page.clock` is Playwright's clock control; `setFixedTime` makes `Date.now()` and `new Date()` in the page return that instant. In `prod-fixtures.js` the `cashflow(months)` function already builds any number of months and returns zero rows before January 2025, so the 60-month request needs no change. Do not use `docs/design/analytics-redesign/harness/mock-fixtures.js` for this check; it stops at 48 months of data. Extend the investments fixture to honour `end` (drop points, flows and activity after it and the live point) and to return `firstDate` and `end`. Start the app with `npm run dev -- --port 3000`, run the harness file as a page function in a Playwright browser (the README in `docs/design/analytics-redesign/` describes this), and open `http://localhost:3000/`.

At 1440 × 1000 and again at 390 × 844, on Dashboard, Analytics and Investments, check and record in `Artifacts and Notes`: the bar matches the board (segments, arrows, button, caption on one row at 1440; segments full width with the button row beneath at 390); the picker opens as a popover at 1440 and as a bottom sheet at 390; no horizontal scroll at 390; every control is at least 44 px tall at 390; a real mouse drag from March to June selects the range and a single click selects one month; dragging out of the picker and releasing changes nothing; the click that follows a selection does not activate anything beneath the popover; Tab reaches the segments, both arrows, the button, and inside the picker every shortcut, the year arrows and the enabled months, each with the 2 px mint focus ring; Enter on a month selects it and Shift+Enter extends; Escape closes the picker and focus returns to the button; the net worth card for August 2026 reads "Net worth at the end of Aug 2026"; the net worth card for March 2026 shows a value and a change measured from the February close; the year 2025 shows "No net worth history for this period." with cash flow figures present.

Touch drag needs real touch events. Playwright's `page.touchscreen` only taps, so in a browser context created with `hasTouch: true` send `Input.dispatchTouchEvent` through a Chromium debugging session (`const cdp = await page.context().newCDPSession(page)`; then `touchStart` at the centre of one month cell, two or three `touchMove` steps to another cell, and `touchEnd`), and confirm the range is selected in the bottom sheet. This proves Chromium only; iOS Safari is checked by hand in Milestone 8.

Fix what differs unless it is on the deviations list in `docs/design/period-picker/README.md`; add any new intended deviation to that list with its reason.

### Milestone 8: production check, merge and deploy

This milestone touches things outside the working tree, so each step waits for the owner. The owner's standing practice is to verify analytics against production by exporting rows read-only over ssh and running them through the pure functions. Do that for the period model: export the owner's cash flow months (or classified rows through `aggregateCashflow` with `months: 60`), run `resolvePeriod` for MTD, YTD, the year 2025, one past month and one custom range, and record the totals and labels in `Surprises & Discoveries`. In the same read-only session count net worth snapshots per month and investment events per month, and record them; they confirm or correct the sparse-history handling and show how close any period comes to the 200-event cap. Then, with the owner's go-ahead, merge `worktree-period-picker` to `main` (no pull request; the `github-personal` identity) and deploy with `scripts/deploy.sh`. There is no database migration. After the deploy, ask the owner to drag across months in the picker once on their phone; if the drag does not extend on iOS Safari, record it and add a tap-first-month, tap-last-month mode for touch as a follow-up. Write `Outcomes & Retrospective`.

## Concrete Steps

All commands run from the worktree root, `/Users/justin/code/personal/OtterMint/.claude/worktrees/period-picker`.

Install dependencies once (Milestone 0):

    npm ci

Render the boards (Milestone 1):

    node docs/design/period-picker/render.mjs
    grep -c "{{" docs/design/period-picker/desktop.html docs/design/period-picker/analytics.html docs/design/period-picker/phone.html

Expect each count to be 0.

Run the model and route tests (Milestone 2), then the component tests (Milestone 3):

    npx vitest run --dir src src/__tests__/analytics-model.test.ts src/__tests__/cashflow-route.test.ts
    npx vitest run --dir src src/__tests__/period-bar.test.tsx

Run everything before each commit from Milestone 5 on:

    npx vitest run --dir src
    npx tsc --noEmit -p .
    npm run lint

Expect vitest to end with a "Test Files … passed" line that counts one more file than before this plan (the new `period-bar.test.tsx`) and no failures. `tsc` may list errors under `.claude/worktrees/` from other stale copies; only errors under `src/` count.

Start the app for the harness (Milestone 7):

    npm run dev -- --port 3000

Commit at the end of each milestone with a message in the repository's style, for example `feat(analytics): period model with month, year, MTD, YTD and custom ranges`.

## Validation and Acceptance

The change is accepted when all of the following can be observed on the Dashboard at `http://localhost:3000/` under the harness, with the harness clock pinned to 2026-09-26.

Pressing MTD lights the MTD segment, the button reads "Sep 1–26, 2026", the tiles compare with "vs Aug 1–26", and the cash flow chart shows April to September with September highlighted. Pressing YTD shows "Jan 1–Sep 26, 2026" and "vs 2025 to date". Pressing the left arrow from YTD shows "2025", lights no segment, gives the button a mint border, and the net worth card reads "No net worth history for this period." while the tiles show 2025's cash flow. Opening the picker and clicking "Aug" closes it and shows "August 2026" with the card reading "Net worth at the end of Aug 2026"; the right arrow then returns to month to date and relights MTD. Pressing on "Mar" and dragging to "Jun" shows "Mar–Jun 2026" with "vs prior 4 mo". Clicking a column in the cash flow chart selects that month. Pressing 3M, 6M and 1Y gives the same figures as before the change except that deltas for periods ending in the current month are like for like.

On Analytics, the same bar drives the savings rate and category trends, and the Year to date and Recurring charges cards do not move.

On Investments (harness clock 2026-09-29), the bar sits above the hero with 3M lit and the hero no longer has its own range buttons. Pressing MTD shows the same chart the old 1M did. Clicking "Jul" in the picker shows July's chart, a hero labelled "at the end of Jul 2026", July's activity only, no change column in the holdings table, and "as of today" on the holdings, allocation and unrealized gain. Months before the first investment history are disabled.

The automated proof is `npx vitest run --dir src` passing, including `src/__tests__/period-bar.test.tsx` and the new cases in `analytics-model.test.ts`, `analytics-view.test.tsx`, `net-worth-overview.test.tsx`, `trends-view.test.tsx`, `investments-route.test.ts`, `investments-model.test.ts` and `investments-view.test.tsx`. Each new test fails before its milestone's code exists and passes after.

## Idempotence and Recovery

Every step is an edit to source files or a read-only check and can be repeated. `render.mjs` overwrites its three outputs. There is no schema change, no data migration and no new dependency. `npm ci` only writes the worktree's `node_modules`. The investments route change is additive: without `end` its response is unchanged apart from the new `firstDate` and `end` fields. Between Milestone 2 and Milestone 6 the two page components do not compile against the new model; if work stops there, the branch is still safe because nothing is merged, and `git stash` must not be used (the stash is shared across worktrees): make a work-in-progress commit instead. To abandon the work, remove the worktree; `main` is untouched until Milestone 8. If the 60-month fetch proves slow in production, changing the two numbers back to a smaller value is a complete rollback of that part.

## Artifacts and Notes

The reference logic is in the script block at the end of `docs/design/period-picker/boards/Dashboard.dc.html`. The parts that carry over nearly line for line are `resolve` (period to months and labels), the `prevFn` and `nextFn` stepping rules, the `cells` mapping (month grid states), and the drag handlers `down`, `enter`, `keyPick`, `dragEnd` and `dragCancel` (the boards track the drag with `pointerenter`; the implementation uses `pointermove` hit-testing instead, for the reason in the Decision Log). The board uses month indexes into a generated list; the implementation uses "YYYY-MM" keys.

Test summary (2026-10-04, from the worktree root):

    Test Files  57 passed | 1 skipped (58)
         Tests  605 passed | 41 skipped (646)

Browser check (2026-10-04). The three scripts in `docs/design/period-picker/harness/` walk each page and return what they observed; run a fixtures file first, then the check, each as a page function. They write screenshots to `docs/design/period-picker/evidence/` (names start `desktop-` or `phone-`). Observed at both 1440 × 1000 and 390 × 844 unless noted:

    Dashboard (clock 2026-09-26)
      opens on 6M        button "Apr–Sep 2026", six columns
      MTD                "Sep 1–26, 2026", four tiles read "vs Aug 1–26", September highlighted in Apr–Sep
      YTD                "Jan 1–Sep 26, 2026", four tiles read "vs 2025 to date"
      previous year      "2025", no segment lit, mint border, 12 columns, "No net worth history for this period."
      click Aug in grid  "August 2026", picker closed, "Net worth at the end of Aug 2026", "vs Jul", Mar–Aug with Aug highlighted
      next month         "Sep 1–26, 2026", MTD lit, next arrow disabled
      drag Mar to Jun    hint "Release to select Mar–Jun 2026.", then "Mar–Jun 2026", "vs prior 4 mo", four columns
      drag out, release  period unchanged, picker still open; Escape closes it and focus returns to the button
      keyboard           Enter on May selects "May 2026"; Shift+Enter on July gives "May–Jul 2026"; focus ring 2px solid rgb(52, 211, 153)
      column click       "July 2026" with Feb–Jul drawn and July highlighted
      March 2026         "Net worth at the end of Mar 2026", change labelled "Feb 28–Mar 31, includes estimates"
      rolling ranges     3M 3 columns, 6M 6, 1Y 12, All 21 ("Jan 2025–Sep 2026")
      layout             no horizontal scroll; controls 30/38 px at 1440 and all 44 px at 390; picker absolute and 328 px wide at 1440, fixed with no gap at the bottom at 390

    Analytics (clock 2026-09-26)
      opens on 1Y        "Oct 2025–Sep 2026", "of income kept · Oct 2025–Sep 2026"
      Last year          "2025", "of income kept · Jan–Dec 2025", "no earlier months to compare", 12 bars per category
      click Aug          "August 2026", "Compared with July 2026", 1 bar per category
      touch drag Feb–May pointer type "touch", hint shown, "Feb–May 2026", page did not scroll (Chromium, debugging protocol)
      unscoped cards     Year to date and Recurring charges text identical before and after

    Investments (clock 2026-09-29)
      opens on 3M        bar above the hero, no range buttons in the hero, request `?days=90`
      MTD                request `?days=28` (the old 1M)
      picker bounds      March 2026 disabled, April enabled, "Earlier year" disabled (history starts 2026-04-01)
      click Jul          request `?days=90&end=2026-07-31`, "Portfolio value at the end of Jul 2026", $387,878 against $391,405 live, no change column, "as of today" three times, "today" on five tiles, activity all in July
      next month twice   `?days=59&end=2026-08-31`, then `?days=28` with MTD lit
      drag May to Jun    `?days=151&end=2026-06-30`, "Portfolio value at the end of Jun 2026"

## Interfaces and Dependencies

No new libraries. Icons from `lucide-react` (already a dependency): `Calendar`, `ChevronDown`, `ChevronLeft`, `ChevronRight`.

In `src/lib/analytics-model.ts`, at the end of Milestone 2, these exist and `AnalyticsRange`, `ANALYTICS_RANGES` and `netWorthDaysForRange` do not. The Investments model imports `Period` and `describePeriod` from here; `analytics-model.ts` must not import from `investments-model.ts`.

    export type PeriodPresetId = "MTD" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

    export type Period =
      | { kind: "preset"; id: PeriodPresetId }
      | { kind: "month"; month: string }            // "YYYY-MM"
      | { kind: "year"; year: number }
      | { kind: "range"; from: string; to: string }; // "YYYY-MM", inclusive

    export const PERIOD_PRESETS: ReadonlyArray<{ id: PeriodPresetId; label: string; months: number | null }>;

    export const CASHFLOW_FETCH_MONTHS = 60;

    export function normalizePeriod(period: Period, today: string): Period;

    export interface ResolvedPeriod {
      windowMonths: CashflowMonth[];
      periodMonths: CashflowMonth[];
      priorMonths: CashflowMonth[] | null;
      /** True when windowMonths is wider than periodMonths and the chart should highlight the period. */
      highlightPeriod: boolean;
      periodLabel: string;
      /** Text of the period button: "May–Oct 2026", "Oct 1–3, 2026", "September 2026", "2025". */
      buttonLabel: string;
      comparisonLabel: string | null;
      comparisonShortLabel: string | null;
      historyStartsLabel: string | null;
      startDate: string;   // "YYYY-MM-DD"
      endDate: string;     // "YYYY-MM-DD"
      endsToday: boolean;
      stepUnit: "month" | "year" | null;
    }

    export function resolvePeriod(months: CashflowMonth[], period: Period, today: string): ResolvedPeriod;

    export interface PeriodBounds { firstMonth: string; lastMonth: string } // "YYYY-MM"

    export function stepPeriod(period: Period, direction: -1 | 1, bounds: PeriodBounds, today: string): Period | null;

    export function periodFromSpan(a: string, b: string, today: string): Period;

    export interface MonthCell {
      month: string; label: string;
      disabled: boolean; inRange: boolean; solid: boolean; current: boolean;
    }

    export function monthGridCells(
      year: number,
      selection: { from: string; to: string; solidEnds: boolean },
      bounds: PeriodBounds,
      today: string
    ): MonthCell[];

    export interface PeriodDescription {
      period: Period;       // normalized
      buttonLabel: string;
      startDate: string;    // "YYYY-MM-DD"
      endDate: string;      // "YYYY-MM-DD"
      endsToday: boolean;
      stepUnit: "month" | "year" | null;
      firstMonth: string;   // "YYYY-MM"
      lastMonth: string;    // "YYYY-MM"
    }

    export function describePeriod(period: Period, today: string): PeriodDescription;

    export function netWorthWindow(
      dates: Pick<PeriodDescription, "startDate" | "endDate" | "endsToday">,
      today: string
    ): { days: number; startDate: string; endDate: string | null };

    export function trimHistory<T extends { date: string }>(
      snapshots: T[], startDate: string, endDate: string | null
    ): T[];

In `src/components/dashboard/PeriodBar.tsx`, at the end of Milestone 3:

    export interface PeriodBarProps {
      period: Period;
      onChange: (period: Period) => void;
      /** Overrides describePeriod's label, e.g. a span clipped to the first data month. */
      label?: string;
      bounds: PeriodBounds;
      today: string;               // "YYYY-MM-DD"
      caption?: ReactNode;
    }

    export function PeriodBar(props: PeriodBarProps): JSX.Element;

In `src/components/dashboard/CashflowChart.tsx`, at the end of Milestone 4, `selectedMonth` is replaced:

    interface CashflowChartProps {
      months: CashflowMonth[];
      windowLabel: string;
      highlighted: string[];                    // "YYYY-MM" keys
      onSelectMonth: (month: string) => void;
    }

In `src/components/dashboard/NetWorthOverview.tsx`, at the end of Milestone 4, three props are added to the existing ones: `startDate?: string`, `endDate?: string | null` and `endLabel?: string`.

In `src/components/dashboard/SavingsRateCard.tsx`, at the end of Milestone 5, one prop is added: `period: CashflowMonth[]`.

At the end of Milestone 6, `GET /api/analytics/investments` accepts `days` (as now) and an optional `end=YYYY-MM-DD`, and `InvestmentsResponse` in `src/lib/investments-model.ts` has two more fields:

    /** Earliest date with investment history, or null. Not bounded by the requested window. */
    firstDate: string | null;
    /** The window's last day: the `end` parameter, or today. */
    end: string;

`InvestmentRange`, `INVESTMENT_RANGES` and `investmentDaysForRange` no longer exist, and `InvestmentHero` no longer takes `range` or `onRangeChange`.

---

Revision note, 2026-10-03: initial version, written after the owner reviewed the canvas design and chose drag for custom ranges.

Revision note, 2026-10-04 (implementation): Milestones 0 to 7 implemented and verified; `Progress`, `Surprises & Discoveries`, `Outcomes & Retrospective` and `Artifacts and Notes` updated with what was observed. Two small departures from the plan's text, both recorded here: a column click on the Dashboard keeps an open details panel (as selecting a month always has), while a change made through the period bar closes it; and the `SavingsRateCard` takes an optional `comparison` label so calendar periods read "vs Jul" or "vs 2024" instead of "vs the previous 1 months".

Revision note, 2026-10-04: the owner asked for the Investments page to share the picker, and for the plan's assumptions to be validated first. Validation (code inspection, a scratch vitest run, a Chromium touch test) changed the plan in six ways, each recorded in `Surprises & Discoveries` and the `Decision Log`: Investments is added as Milestone 6 with an `end` parameter and `firstDate` on its route, because browser trimming was shown not to work there; net worth fetches a week early to use the previous close as a baseline and defines its one-point and no-point states, because history is one point per month before July 2026 and absent before 2026-01-31; past-period net worth also trims coverage events and uses reported values; the drag uses `pointermove` hit-testing and the keyboard an explicit Shift handler; `PeriodBar` is decoupled from the cash flow list through `describePeriod`; and the harness clock is pinned, with `npm ci` added as Milestone 0. The acceptance scenario was corrected (it had expected a net worth figure for December 2025, which has no history).
