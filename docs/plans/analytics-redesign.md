# Redesign the Analytics view: one time range, a net-worth hero, a diverging cash-flow chart, ranked categories, and drilldowns

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `docs/PLANS.md` at the repository root.


## Purpose / Big Picture

OtterMint is a personal-finance dashboard (Next.js, React, Postgres, Plaid). Its Analytics destination currently stacks three cards that do not agree with each other: a net-worth card that duplicates the Dashboard, a net-worth line chart with its own 90-day / 1-year toggle, and a cash-flow card with its own month dropdown, a three-bars-per-month grouped chart and a nine-slice pie. Nothing leads, the controls describe different periods, the red and green bars are hard to tell apart for colorblind readers, and pie colors change when the month changes because they are assigned by rank.

After this change, a signed-in user who opens Analytics sees one time-range control (3M, 6M, 1Y, All) that scopes everything below it. A net-worth hero shows the current total, an honest change figure labeled with the date it is measured from, and the assets/liabilities split, beside a single-line history chart. Four stat tiles (Income, Spending, Saved, Net cash flow) compare against the previous equal period whenever real history covers that period, with a 12-month sparkline. A cash-flow chart draws income rising above a baseline and spending plus saving hanging below it; each month column is a button that scopes the tiles and categories to that month. A ranked "Where it went" list shows spending by category with change versus the prior period. A details panel lists the transactions behind any stat tile or category. The whole app adopts a quieter green-tinted dark theme with a mint accent and a serif display face for titles, which also fixes muted text that currently fails the WCAG 4.5:1 contrast minimum. Underneath it sits a baseline design system: semantic Tailwind tokens for color, type, radius and elevation; a small set of shared UI primitives in `src/components/ui/`; a written guide in `docs/design-system.md`; a development-only gallery page at `/design-system`; and a test that fails if a text or chart token drops below its contrast minimum.

To see it working without a database, run the dev server and the fixture harness described in Milestone 7 and open Analytics at 1440px and 390px widths. After deployment, sign in at https://ottermint.otterholt.net and open Analytics.

The approved visual design is a private design canvas at https://claude.ai/artifact/EFWAHG6UGx94B5rS5bSLoE (a desktop board and a phone board). It is provenance only. Every measurement, color and behavior needed to build the design is restated in this file, and where the real data forces a deviation from the canvas, the Decision Log says so.


## Progress

- [x] (2026-09-27 15:05Z) Design approved by the user on the design canvas.
- [x] (2026-09-27 15:20Z) Researched the current page, components, API routes, pure analytics modules, tests and deploy path.
- [x] (2026-09-27 15:25Z) Proved the database-free visual harness against the current page; captured a before screenshot (not committed).
- [x] (2026-09-27 15:28Z) Counted production history for the owner's account, read-only and counts only (see Surprises).
- [x] (2026-09-27 15:30Z) Recorded the baseline: 44 test files passed and 1 skipped; 365 tests passed and 41 skipped; `tsc` clean; lint shows one pre-existing warning.
- [x] (2026-09-27 15:45Z) Wrote this ExecPlan.
- [x] (2026-09-27 16:10Z) User approved the app-wide theme, added a baseline design system to scope, asked for all pending work to be committed first, and authorized running the plan end to end including deploy.
- [x] (2026-09-27 16:20Z) Created branch `feat/analytics-redesign` from `origin/main` (42e6e91) and committed the pending work: the River category rule (4c59049), this plan with the records-backfill checklist (26f62bb), and an ignore rule for `.playwright-mcp/` (328125a). Working tree clean.
- [x] (2026-09-27 21:55Z) Milestone 1: design-system foundation and shell adoption. Tokens and fonts (a99df32), primitives, gallery and guide (bb948c6), shell adoption (26f5365). 407 tests pass; `tsc` clean; lint unchanged; `npm run build` passes and serves `/design-system` as a 404 in production. Gallery and Dashboard verified in the browser harness.
- [x] (2026-09-27 22:00Z) Milestone 2: pure analytics model and formatting helpers, test-first (a065295). Tests failed first; 30 model tests plus formatter and totals tests pass.
- [x] (2026-09-27 22:05Z) Milestone 3: items route with validation, shared `toLineItem`, `selectCashflowItems`, and the 3650-day cap (cf1fe86).
- [x] (2026-09-27 22:25Z) Milestone 4: net-worth hero and restyled chart (5882403). The approved mock is committed as static renders under `docs/design/analytics-redesign/` (b201dd1, 1dda08d), and it is being compared in the browser as each part lands.
- [x] (2026-09-27 22:50Z) Milestone 5: range control, stat tiles, diverging cash-flow chart, ranked categories; `CashflowPanel` removed (19200ed). `npm run build` passes.
- [x] (2026-09-27 23:05Z) Milestone 6: details panel for every tile and category (73755b7). 471 tests pass.
- [x] (2026-09-27 23:40Z) Milestone 7: compared with the mock at 1440px and 390px in both fixture modes. Numbers match the mock exactly in mock mode, and remaining differences are the intended ones in `docs/design/analytics-redesign/README.md`. Fixes landed in 8af9416: 44px phone targets, an accessible chart name, grouped estimate notes, and dense-chart labels. Checked keyboard order and Enter toggling, the mint focus ring, hover readouts, household mode and the All range. Harness files committed under `docs/design/analytics-redesign/harness/`. 471 tests, `tsc`, lint (one pre-existing warning) and `npm run build` all pass.
- [x] (2026-09-28 00:30Z) Pre-deploy verification against production data. Owner rows were exported read-only to scratch, built into API payloads by the same pure functions (in a temporary test, deleted), and rendered through a third harness mode. Hero $697,766 matches the Dashboard's $697,765.83. Category rows sum to the Spending tile ($40,727.35). The Restaurant items total equals its category total ($3,465.03, 41 transactions). This check exposed the Sep 5 normalization contradiction, fixed for the headline and default mode in the commit after 567b3a1.
- [x] (2026-09-28 01:20Z) Independent pre-deploy review of the branch diff. It found no serious bugs in the math or the new route, and seven issues that are now fixed and tested: a stale net-worth card when switching My Finances/Household, a stale details list after refresh, a folded category claiming no transactions, a stale month chip after month rollover, a bar label missing withdrawals, focus lost on close/clear, and a future URL-length cap on Other (now an `exclude=` form). 488 tests pass.
- [ ] Milestone 8: merge to main, deploy, verify the live site.


## Surprises & Discoveries

- Observation: the owner's transaction history starts on 2026-01-01, so most longer ranges reach before the data. A 1Y or All window would show three or fifteen empty leading months, and the 6M range's prior period (Oct 2025 to Mar 2026) is not covered by data until early 2027. This drove the clipping and comparison rules in the Decision Log.
  Evidence (production, 2026-09-27, counts only):

      what            | from       | to         | n
      txn_span        | 2026-01-01 | 2026-09-25 | 882
      snapshots       | 2026-01-31 | 2026-09-26 | 48 (6 reconstructed)
      coverage_events | 2026-08-13 | 2026-09-05 | 2

- Observation: each month carries 22 to 41 distinct spending category keys and 68 to 138 posted transactions. A top-8 list folds a large "Other" tail, and spending line items for 24 months (roughly 2,400 rows) are too heavy to ship inside the monthly payload.
  Evidence: per-month counts from the same query, for example `2026-04 | 138 posted | 41 keys` and `2026-02 | 85 posted | 22 keys`.

- Observation: `periodChange.normalized` from the net-worth API is null whenever any reconstructed point is in range, and a reconstructed-to-observed boundary starts a new comparison segment and emits a "Coverage changed" annotation. With six reconstructed month-end points from January to June, every range longer than about three months has no normalized period change, so the hero cannot simply display `periodChange`.
  Evidence: `src/lib/net-worth-history.ts`, the `reconstructionBoundary` and `periodChange` blocks inside `normalizeNetWorthHistory`.

- Observation: the auth middleware only checks that a UUID-shaped `session_id` cookie exists; real validation happens inside API handlers. With a fake cookie and every `/api/*` request answered in the browser, the real page renders with no database.
  Evidence: `src/middleware.ts`, comment "Lightweight middleware that checks for session cookie presence", and the harness run that printed the Analytics page text with fixture values ($396,510.00 net worth and so on).

- Observation: Recharts plays an entrance animation, so a screenshot taken 2.5 seconds after load showed empty bar and pie areas even though the marks existed.
  Evidence: after a further 3 seconds the DOM held 18 `.recharts-bar-rectangle` and 9 `.recharts-pie-sector` elements. Wait at least 5 seconds before screenshots, or count elements.

- Observation: the current `--text-muted` (#6b7280) is 3.75:1 on the card surface and 3.49:1 on the raised surface, below the 4.5:1 WCAG minimum for body text. The retuned muted gray is 4.90:1 on cards and 4.85:1 on hover fills.

- Observation: the Playwright browser tool used during research runs harness code in a sandbox without the `URL` global and only loads script files from inside the repository. Pass harness code inline, or save it under the untracked `.playwright-mcp/` directory, and parse request URLs with a regular expression.

- Observation: a selected segment needs its own fill. Hover (#1c2320) on a raised track (#171d1a) differs by only 1.07:1, so the selected state was invisible. A new `--bg-active` (#242c28, `bg-surface-active`) reads clearly. Primary and secondary text clear 4.5:1 on it, but muted text measures only 4.33:1, so muted text is not allowed on that fill.
  Evidence: contrast check during Milestone 1; the token test asserts primary and secondary on `--bg-active`.

- Observation: in Tailwind v4, unlayered CSS outranks utilities, so the global focus ring and cursor rule go inside `@layer base` where components can still override them.

- Observation: `next build` and `next dev` can run at the same time; the dev server writes to `.next/dev`.

- Observation: primitives append `className` without a class-merging utility, so an override such as `px-0` on a `Button` whose size sets `px-3` loses or wins depending on the order Tailwind emits them, not the class order. It squeezed the close icon to 6px wide. The fix is props that own those properties: `Button iconOnly`, `EmptyState compact`, `Skeleton radius`. The guide now states the rule.
  Evidence: the rendered close button measured `svg: [6, 16]` before the fix and `[16, 16]` after.

- Observation: a stretch of `flat_normalized` points is drawn dashed and without the area wash, because an estimated series gets no area. That leaves a visible notch in the wash before an account-connection date. This is the established honesty rule, not a layout bug.

- Observation: Tailwind v4's `transition-colors` also animates `outline-color`, so a focus ring read or screenshotted right after focusing looks near-white. It settles to mint after 150ms.
  Evidence: `outlineColor` read `rgb(235, 241, 238)` immediately after focus, then `rgb(52, 211, 153)` after 500ms.

- Observation: the headed browser the Playwright tool drives can be changed from outside a check. One check found the page on Dashboard with the 1Y range selected and an Investments request logged. Every browser check now starts by reloading and navigating, and runs start to finish in a single call.

- Observation: production normalization is contradicted by the balances on Sep 5, 2026. The owner re-created a manual 401K asset at 152,000 (manual assets went from 151,000 to 152,000). The app recorded the new account as a +152,000 captured addition but has no removal event for the deleted predecessor. Raw net worth moved only about +8,500, yet every earlier adjusted point was lifted by 152,000, so the Normalized chart drew a false cliff of about $143k. The first hero draft read "-$89,934 (-11.4%) since Jul 23". The same pattern appears, smaller, at the Aug 13 liability addition.
  Evidence: snapshots on 2026-09-02 and 2026-09-05 (`manualAssetsTotal` 151000.00 then 152000.00; `netWorth` 650609.56 then 659079.88); coverage event 2026-09-05 manual_account +152000.00; manual account id 2 created 2026-09-05.

- Observation: the local `main` branch is stale at 513a880, while `origin/main` equals the current branch tip 42e6e91. Start work from `origin/main`, not local `main`.


## Decision Log

- Decision: Retune the global color tokens in `src/app/globals.css` instead of theming only the Analytics view.
  Rationale: the sidebar and header are shared by every destination, and an analytics-only ground would visibly change color when navigating. Every component reads the same token names, so the retune is a value change, not a refactor. It also fixes the failing muted-text contrast app-wide. Semantic accents (`--accent-green`, `--accent-red`, `--accent-blue`, `--accent-amber`, `--accent-purple`) keep their values so other pages keep their meaning.
  Date/Author: 2026-09-27, Claude.

- Decision: Limit shell changes to the serif wordmark and page title, the neutral-plus-mint active navigation state, and the two indigo primary buttons becoming mint. Do not build the canvas's bottom tab bar on phones, do not restructure the header, and do not add the canvas's "Settings" and "Personal plan" sidebar rows.
  Rationale: those canvas elements were placeholders or shell redesigns beyond the Analytics request. The existing mobile top navigation and the avatar menu already provide the same destinations.
  Date/Author: 2026-09-27, Claude.

- Decision: Fetch cash flow once as 24 months (`/api/analytics/cashflow?months=24`, the route's existing maximum) and derive every range, month selection and prior period on the client.
  Rationale: switching ranges becomes instant with no loading flash, prior periods and sparklines need months outside the visible range anyway, and the route already supports 24 months.
  Date/Author: 2026-09-27, Claude.

- Decision: Clip every range to the first month that has any income, spending or savings, and show "History starts Jan 2026" in the filter row when clipping happened or when the prior period is not covered. Show a comparison only when every month of the equal-length prior period is at or after that first data month. Never compare a period that is only the current partial month.
  Rationale: zero-filled months before an account was linked are not real zeros, so comparing against them would print meaningless percentages. A month-to-date total against a full prior month is a flattering error. Multi-month ranges that include the partial month are still compared, because the bias is diluted and the filter row names the partial month.
  Date/Author: 2026-09-27, Claude.

- Decision: Sparklines plot the 12 most recent complete months at or after the first data month, and are hidden with fewer than two points.
  Rationale: a half-finished current month at the end of a sparkline reads as a crash.
  Date/Author: 2026-09-27, Claude.

- Decision: Build the cash-flow chart as HTML buttons with CSS-positioned bars, not Recharts.
  Rationale: each month must be a keyboard-focusable toggle, the diverging stack with a sign-aware saved segment is simple geometry that a pure function can compute and a unit test can check, and the component tests no longer need a Recharts mock for this chart.
  Date/Author: 2026-09-27, Claude.

- Decision: When a month's savings are negative (a net withdrawal from savings or investments), draw the saved segment above the baseline on top of income, in the saved color.
  Rationale: below the line means money leaving everyday accounts. A withdrawal is money arriving, so it belongs above the line, and the legend, tooltip and aria-label still call it Saved with its negative value.
  Date/Author: 2026-09-27, Claude.

- Decision: Keep Recharts for the net-worth chart, plot only the net-worth series, never force the y-axis to include zero, draw coverage events as muted solid hairlines with a small baseline dot instead of full-height amber dashed lines, and move every existing explanatory note into one collapsed "About this chart" disclosure with its wording preserved.
  Rationale: the existing segmenting, dashing, mode toggle and tooltip logic is correct and tested. The assets and liabilities lines move to the hero as current values, the tooltip still lists them per date, and a zero-based axis flattens a $400k line into a straight stroke.
  Date/Author: 2026-09-27, Claude.

- Decision: The hero's change figure is the comparable change within the most recent comparison segment, labeled "since <date>", computed by a new pure function. It uses adjusted values in Normalized mode and raw values in Reported mode, and adds "includes estimates" when that stretch contains reconstructed points.
  Rationale: `periodChange.normalized` is almost always null for real ranges, and the raw reported change across an unknown coverage boundary counts newly linked balances as growth. Measuring within the last comparable stretch is always honest, and naming its start date tells the reader exactly what was measured.
  Date/Author: 2026-09-27, Claude.

- Decision: Category bars use one color, the spending series color, instead of the canvas's per-category colors.
  Rationale: detailed categories are open-ended (up to 41 keys a month), so no fixed eight-color mapping exists, and rank-based colors were the existing chart's flaw. The row name already identifies each bar, and the shared orange ties the list to the spending segments in the cash-flow chart. This is a visible deviation from the canvas that the user should know about.
  Date/Author: 2026-09-27, Claude.

- Decision: Add one route, `GET /api/analytics/cashflow/items`, for spending line items only in practice (it accepts income and savings too), and keep using the monthly payload's existing `incomeItems` and `savingsItems` for the Income and Saved drilldowns.
  Rationale: income and savings items are already loaded and tested. Spending items are the bulk of all transactions and are only needed when a reader opens a category or the Spending tile.
  Date/Author: 2026-09-27, Claude.

- Decision: Raise the `days` cap on both net-worth routes from 365 to 3650, and have the All range request 3650 days.
  Rationale: All must mean all history. Today's history fits in 365 days, but it will not by February 2027.
  Date/Author: 2026-09-27, Claude.

- Decision: Delete `src/components/dashboard/CashflowPanel.tsx` and its test once the new view covers the same behaviors, as the cash-flow plan previously did for `SpendingChart.tsx`.
  Rationale: two cash-flow UIs would drift. The panel's tested behaviors (income and saved drilldowns, negative withdrawals, toggling closed, month-to-date labeling, error handling) are re-covered by the new component tests.
  Date/Author: 2026-09-27, Claude.

- Decision: Show whole dollars in the hero, tiles and category rows, and exact cents in the details table.
  Rationale: headline figures are for scanning; the table is for reconciling against a bank statement.
  Date/Author: 2026-09-27, Claude.

- Decision: Show a compact error card when a fetch fails instead of rendering nothing.
  Rationale: the current panel silently disappears on failure, which reads as "no data".
  Date/Author: 2026-09-27, Claude.

- Decision: Verify visuals with the database-free harness (fake session cookie plus in-browser API fixtures) and verify numbers against production after deploy.
  Rationale: the dev machine has no populated database, and seeding Plaid-shaped data into a disposable Postgres is far more work than intercepting nine JSON endpoints.
  Date/Author: 2026-09-27, Claude.

- Decision (superseded the same day, see below): Work on a new branch from `origin/main` and keep the owner's uncommitted category-rules edits and untracked files out of this work's commits.
  Rationale: at planning time those edits were unrelated work in progress.
  Date/Author: 2026-09-27, Claude.

- Decision: At the user's request, commit all pending work before starting, on `feat/analytics-redesign`: the River recurring-buy category rule and its tests, the records-backfill checklist, and this plan. Ignore `.playwright-mcp/` in `.gitignore` instead of committing it.
  Rationale: the user asked to start from a clean tree with everything committed. `.playwright-mcp/` holds only browser-automation screenshots and console logs, which are tool artifacts rather than work. The River rule ships to production with this work; its tests pass.
  Date/Author: 2026-09-27, Claude.

- Decision: The app-wide theme is confirmed by the user, and the work now also establishes a baseline design system. It has four parts. First, a semantic token layer in the `@theme inline` block of `src/app/globals.css` gives Tailwind utilities such as `bg-surface`, `text-ink-muted`, `border-line`, `bg-accent`, `text-positive`, `rounded-card`, `text-hero` and `shadow-popover`, on top of the existing raw custom properties, which keep their names. Second, primitives live in `src/components/ui/`: `Button`, `Card` with `CardHeader`, `SegmentedControl`, `Chip`, `DeltaIndicator`, `LegendKey`, `EmptyState` and `Skeleton`. Third, `docs/design-system.md` is the written guide. Fourth, a development-only gallery renders at `/design-system`, and `src/__tests__/design-tokens.test.ts` guards contrast. Adoption in this plan covers the shell controls (the nav active state, `DashboardTabs`, `RefreshButton`, `PlaidLinkButton`, the `ManualAccountForm` submit button) and every new Analytics component. Other panels inherit the new token values but keep their markup; the guide records how to migrate them later.
  Rationale: a baseline needs shared vocabulary, reusable parts, a place to see them and a guardrail, but rewriting every existing panel would multiply risk without changing what users see, since the token values already restyle them. Keeping the raw property names avoids touching more than 600 existing `var(--...)` usages.
  Date/Author: 2026-09-27, Claude.

- Decision: Render the approved mock boards as static HTML snapshots committed under `docs/design/analytics-redesign/`, and compare them with the implementation at the same viewport sizes in Milestone 7.
  Rationale: the user asked for visual fidelity to be validated against the mock with a real browser. The canvas that hosts the mock is private and needs its own runtime, so a committed static render is the only durable, repeatable reference. The harness gains a fixture mode that reproduces the mock's sample data, so the two screenshots show comparable numbers.
  Date/Author: 2026-09-27, Claude.

- Decision: The user authorized running the plan end to end, including merging to `main` and deploying ("run it end to end ... do not consider yourself done until all acceptance criteria have been met").
  Rationale: Milestone 8 previously waited for a go-ahead; this instruction is that go-ahead. Production checks that need the owner's signed-in session are done by running production rows (read-only, via the documented `ssh otterholt` psql path) through the same pure functions and rendering them in the local harness, plus a health and asset check of the live site. No credentials are requested or stored.
  Date/Author: 2026-09-27, Claude.


- Decision: The hero's change stops at any account-change edge where the balances contradict the recorded adjustment (the adjusted series jumps by more than half the adjustment and more than 1% of net worth). The chart opens in Reported mode when any contradiction exists, with the reason given in "About this chart". The underlying data and normalization are not changed.
  Rationale: the owner's real data showed the headline could report a false double-digit loss. Correcting the recorded coverage event would change production data, and recording manual-account removals would change the coverage model; both are outside this redesign and need their own decision. The safeguard keeps the new headline honest meanwhile. Follow-up: record a removal event when a manual account is deleted, and correct the Sep 5 event with the owner's approval.
  Date/Author: 2026-09-28, Claude.

## Outcomes & Retrospective

Implementation (Milestones 1–7) is complete on `feat/analytics-redesign` as of 2026-09-28. The Analytics destination now leads with a net-worth hero whose change is always measured over a comparable stretch and labeled with its start date. One range control scopes everything, and cash flow is fetched once and sliced client-side. Stat tiles show comparisons only when real history covers the prior period. The diverging cash-flow chart doubles as a month filter, categories are ranked with an Other fold, and a details panel explains every figure. A baseline design system underpins it: semantic tokens with a contrast-guard test, eight primitives, a development gallery, and a written guide. The whole app shares the new theme.

Verification: 476 unit and component tests pass, `tsc` is clean, lint shows only the pre-existing warning, and `npm run build` passes. The UI was compared in a real browser against committed static renders of the approved mock at 1440px and 390px; in mock-data mode the numbers match exactly. The owner's production data, exported read-only, was rendered locally and reconciled to the cent: category rows equal spending, category items equal category totals, and the hero equals the Dashboard.

What changed from the plan: the design system grew props to avoid class-override conflicts (`iconOnly`, `compact`, `radius`), every control is 44px tall on phones, and the net-worth headline and default chart mode gained a safeguard against normalization the balances contradict. Production data showed that case on 2026-09-05.

Lessons: rendering the real data before deploying caught a headline that would have reported a false 11% loss. Unit tests could not have caught it, because the flaw was in the data, not the code. In a design system without class merging, overrides must be props.

Remaining: deploy and live verification (Milestone 8). Follow-up outside this plan: record a coverage removal event when a manual account is deleted, and correct the 2026-09-05 event with the owner's approval.


## Context and Orientation

All paths below are relative to the repository root, `/Users/justin/code/personal/OtterMint`.

The whole signed-in app is one client page, `src/app/page.tsx`. It renders a collapsible left sidebar (wordmark "ottermint" and five navigation buttons), a header bar (page title, an optional "My Finances / Household" switch from `src/components/dashboard/DashboardTabs.tsx`, `RefreshButton`, `PlaidLinkButton`, `AvatarMenu`), and a `main` area whose content depends on the `activeDestination` state. Destination is plain React state, not a URL. The Analytics branch is the final `return` inside `renderContent()`. For "My Finances" it renders `NetWorthCard`, `NetWorthChart` and `CashflowPanel`. For "Household" (only shown when the user's group has more than one member) it renders the household `NetWorthCard`, a `NetWorthChart` given the group id, and a dashed placeholder card reading "Household spending analytics are not available yet." The page fetches accounts from `/api/accounts` and `/api/manual-accounts` and, in household mode, `/api/groups/<id>/accounts`, and passes them down as `visibleAccounts` and `visibleManualAccounts`. A `refreshKey` counter increments after a refresh and children refetch when it changes.

Styling is Tailwind CSS v4 with design tokens. A design token is a named CSS custom property, such as `--bg-secondary`, declared once in `src/app/globals.css` under `:root` and used in class names like `bg-[var(--bg-secondary)]`. The same file holds categorical chart colors `--chart-cat-1` through `--chart-cat-8` and `--chart-cat-other`, validated for colorblind separation. `src/app/layout.tsx` loads DM Sans (exposed as `--font-geist-sans`, mapped to Tailwind's `font-sans` in the `@theme inline` block) and JetBrains Mono (`--font-geist-mono`, mapped to `font-mono`) through `next/font/google`. The only hardcoded non-token colors that matter here are `bg-indigo-600` primary buttons in `src/components/plaid/PlaidLinkButton.tsx` and `src/components/manual/ManualAccountForm.tsx`. A literal `#6b7280` in `src/app/oauth/page.tsx` is out of scope and stays.

Net worth. `src/components/dashboard/NetWorthCard.tsx` computes current assets, liabilities and net worth from the account lists. Depository and investment balances count as assets. Credit and loan balances count as liabilities (absolute value). Manual accounts count by their `type` of `asset` or `liability`. `src/components/dashboard/NetWorthChart.tsx` fetches history from `/api/net-worth?days=N` or `/api/groups/<id>/net-worth?days=N` and draws it with Recharts. Both routes clamp `days` to at most 365 today. The response type `NetWorthHistoryResponse` lives in `src/lib/net-worth-history-server.ts`: `snapshots`, `coverageEvents` and `periodChange`. Each snapshot row (`NetWorthSnapshotRow` in `src/lib/net-worth-history.ts`) carries raw `netWorth`, `totalAssets` and `totalLiabilities`, adjusted counterparts `adjustedNetWorth` and friends, a `quality`, a `coverageSegment` and a `comparisonSegment`, and optional `reconstructionNotes`.

Some terms from that module, in plain language. A snapshot is one day's stored totals. Coverage means which accounts were linked when a snapshot was taken. When an account is linked, its balance would otherwise look like overnight growth, so the app records a coverage event. A captured addition is a linking event whose amount is known. Normalized mode adds those known amounts to earlier points (the adjusted values), so the line compares like with like. Reported mode shows raw totals. A coverage segment is a run of snapshots with the same account set. A comparison segment is a run where values can be compared, possibly through normalization; the line breaks between comparison segments. The `quality` field is one of `observed`, `flat_normalized` (an earlier point lifted by a later known addition), `unknown_coverage` (the first point after an unexplained change), or `reconstructed`. Reconstructed points are month-end estimates from bank statements, inserted by a one-time backfill, carrying `reconstructionNotes` that explain the method; they are always drawn dashed and always start their own comparison segment. `periodChange` is `{ reported, normalized }`, where `normalized` is null whenever the range crosses comparison segments or contains any reconstructed point. Household history is never normalized.

Cash flow. `src/lib/cashflow.ts` is a pure module (no server imports). `classifyTransaction` puts every transaction into exactly one of `income`, `spending`, `savings` or `internal` (moves between the user's own accounts, excluded from all totals). `aggregateCashflow(rows, { months, today })` returns one `CashflowMonth` per calendar month, ascending and zero-filled, with string totals `income`, `spending`, `savings` and `netCashFlow` (income minus spending), `partial: true` only for the current month, `spendingByCategory` (keyed by Plaid's detailed category such as `FOOD_AND_DRINK_RESTAURANTS`, falling back to the primary category or `UNCATEGORIZED`, sorted descending), and the line items `incomeItems` and `savingsItems` (`CashflowLineItem`: `date`, display-signed `amount`, `name`, `merchantName`, `categoryKey`, `accountName`). Pending transactions are excluded. Plaid signs amounts so that positive means money left the account; income items are flipped to positive, and savings withdrawals are negative. `labelForCategoryKey` turns keys into labels ("Restaurants", "Gas & Electricity"). `src/app/api/analytics/cashflow/route.ts` reads rows through `selectClassifiedTransactionRows` in `src/lib/db/classified-transactions.ts` and returns `{ months }` for `months` between 1 and 24.

`selectClassifiedTransactionRows(tx, userId, since)` is the only sanctioned way for analytics to read transactions. It joins transactions to accounts and Plaid items, scopes to the user, and applies category-correction rules. Every API route wraps database work in `withUser(userId, tx => ...)` from `src/lib/db/with-user.ts`, which sets the Postgres row-level-security context (RLS, the database refusing rows that belong to other users). `getUserId()` from `src/lib/auth/get-user-id.ts` throws an auth error that routes turn into HTTP 401 via `isAuthError`. Errors are logged with `logServerError` from `src/lib/logging.ts`.

`src/components/dashboard/CashflowPanel.tsx` is the current cash-flow UI: it fetches six months, shows a month `<select>`, four KPI tiles (Income and Saved toggle drilldown lists), a grouped Recharts bar chart, and a Recharts pie of the top eight categories plus "Other".

Formatting lives in `src/lib/format.ts`, which today only exports `formatCurrency` (two decimals, "-$500.10" for negatives, "$0.00" for null or unparseable input).

Tests use Vitest with jsdom and Testing Library (`vitest.config.ts`; there is no setup file, so each component test imports `@testing-library/jest-dom/vitest`). Route tests start with `// @vitest-environment node`, mock `@/lib/auth/get-user-id`, `@/lib/db/with-user` and `@/lib/logging` with `vi.mock`, and call the exported `GET` with a `NextRequest`; see `src/__tests__/cashflow-route.test.ts`. Component tests stub `fetch` with `vi.stubGlobal` and mock `recharts` with plain divs; see `src/__tests__/net-worth-chart.test.tsx`. Always run Vitest scoped to `src` (`npx vitest run --dir src`), because stale repository copies can exist under `.claude/worktrees/` and a bare run would pick up their tests.

The development machine has no populated database. Production runs on the owner's NAS (called OtterHolt) as two Docker containers built from `origin/main` by `scripts/deploy.sh`. `docs/DEPLOYMENT.md` is the runbook. This plan needs no database migration.


## Plan of Work

The work proceeds in eight milestones. Each one ends in a state where the full test suite passes and something new is observable. Commit at the end of every milestone, staging files by explicit path.

### Visual specification (applies to every milestone)

The theme tokens are retuned to a green-tinted near-black. These are the exact values for `:root` in `src/app/globals.css`; the first nine replace existing values and the rest are new.

    --bg-primary: #0a0d0c;         page ground
    --bg-secondary: #111614;       card surface
    --bg-tertiary: #171d1a;        raised surface (inputs, tooltips, segmented tracks)
    --bg-hover: #1c2320;           hover and selected fills
    --border: #242c28;
    --border-subtle: #1b221e;
    --text-primary: #edf1ef;
    --text-secondary: #a3ada8;
    --text-muted: #85908a;
    --accent-mint: #34d399;        brand accent: active nav icon, primary buttons, net-worth line, sparkline end dot
    --accent-mint-dim: rgba(52, 211, 153, 0.12);
    --delta-up: #34d399;           good change text
    --delta-down: #f0836f;         bad change text
    --chart-grid: #1e2622;         gridlines, hairline, solid
    --chart-baseline: #2e3833;     the cash-flow zero line
    --chart-muted-line: #3a453f;   sparklines and crosshair
    --series-income: var(--chart-cat-3);     #199e70 aqua
    --series-spending: var(--chart-cat-2);   #d95926 orange
    --series-saved: var(--chart-cat-1);      #3987e5 blue

The three series colors passed the palette validator against the new card surface #111614: lightness band, chroma floor, colorblind separation (worst adjacent pair 9.4, target 8 or more), normal-vision separation (26.5, floor 15) and 3:1 contrast. Orange replaces red for spending because the red and aqua pair only reached 6.5 colorblind separation. Update the comment above `--chart-cat-1` to say the palette was validated against `--bg-secondary` #111614.

Typography. Add Instrument Serif (weight 400, Google Fonts via `next/font/google`) as a display face, used only for the sidebar wordmark (24px), the header page title (26px) and section titles such as "Cash flow", "Where it went" and the details title (24px on desktop, 22px on phones). Everything else stays DM Sans. Large standalone numbers (hero 52px semibold with -0.025em letter spacing on desktop and 40px on phones; tile values 28px and 24px) use DM Sans with default proportional figures. JetBrains Mono with tabular figures is reserved for axis tick labels and the dates and amounts in the details table. Never color text with a series color; text uses the text tokens, and a colored swatch, line key or bar next to the text carries identity.

Layout of the Analytics content inside the existing `max-w-6xl` main column, top to bottom, with 24px gaps between sections. First, the filter row: a segmented range control (container `bg-tertiary` with a 1px border and 10px radius; buttons 30px tall on desktop and 44px tall, equal width and full width on phones; the selected button gets `bg-hover` and primary text), then, when a month is selected, a chip button reading for example "September 2026 · month to date" with a small close icon, then a muted caption such as "Compared with the previous 3 months" or "History starts Jan 2026". Second, the net-worth card: 16px radius, `bg-secondary`, 1px border, padding 28px by 32px on desktop and 20px on phones; at the `lg` breakpoint and wider a 300px hero column sits left of the chart, below `lg` they stack. Third, four stat tiles in a grid, four columns at `lg` and two columns below, 16px gaps, each tile a 14px-radius card at least 124px tall. Fourth, at the `xl` breakpoint the cash-flow card and the category card sit side by side in a 7fr / 5fr grid, stacked below `xl`. Fifth, the details panel at full width. Section titles are serif; small labels are 13px medium secondary text in sentence case (no more uppercase tracking labels on Analytics).

Marks. Lines are 2px with round joins. Bars are at most 24px wide (24px with six or fewer columns, 16px with twelve or fewer, 10px above that), with 4px rounded outer ends and square ends at the baseline, and a 2px gap between stacked segments. End dots have a radius of at least 4px and a 2px ring in the card color. Area fills are the series color at 10% opacity. Gridlines are 1px solid `--chart-grid`, never dashed. A value label appears only on the selected (or latest) month and at the end of the net-worth line, never on every point.

### Milestone 1: design-system foundation and shell adoption

Goal: the app wears the new theme everywhere, and a small, documented design system exists that the Analytics work then builds on. There is no behavior change.

Tokens. In `src/app/globals.css`, replace the nine token values and add the new raw tokens exactly as listed in the Visual specification. Then extend the `@theme inline` block with the semantic layer, which Tailwind v4 turns into utilities. The block keeps its existing entries, and each new entry points at a raw token:

    --color-canvas: var(--bg-primary);            bg-canvas
    --color-surface: var(--bg-secondary);         bg-surface
    --color-surface-raised: var(--bg-tertiary);   bg-surface-raised
    --color-surface-hover: var(--bg-hover);       bg-surface-hover
    --color-line: var(--border);                  border-line
    --color-line-subtle: var(--border-subtle);    border-line-subtle
    --color-ink: var(--text-primary);             text-ink
    --color-ink-secondary: var(--text-secondary); text-ink-secondary
    --color-ink-muted: var(--text-muted);         text-ink-muted
    --color-accent: var(--accent-mint);           bg-accent, text-accent
    --color-accent-dim: var(--accent-mint-dim);
    --color-on-accent: var(--bg-primary);         text-on-accent (ink on mint)
    --color-positive: var(--delta-up);            text-positive
    --color-negative: var(--delta-down);          text-negative
    --color-warning: var(--accent-amber);
    --color-series-income: var(--series-income);
    --color-series-spending: var(--series-spending);
    --color-series-saved: var(--series-saved);
    --color-chart-grid: var(--chart-grid);
    --color-chart-baseline: var(--chart-baseline);
    --color-chart-muted: var(--chart-muted-line);
    --font-serif: var(--font-instrument-serif), Georgia, serif;
    --text-hero: 3.25rem;  (--line-height 1.05, --letter-spacing -0.025em, --font-weight 600)
    --text-figure: 1.75rem; (--line-height 1.1, --letter-spacing -0.02em, --font-weight 600)
    --text-display: 1.625rem; (--line-height 1.1)   page titles, serif
    --text-title: 1.5rem;  (--line-height 1.15)     section titles, serif
    --text-caption: 0.8125rem; (--line-height 1.4)  13px labels and subtitles
    --text-micro: 0.6875rem; (--line-height 1.3)    11px axis ticks and legends
    --radius-control: 10px;  --radius-tile: 14px;  --radius-card: 16px;
    --shadow-popover: 0 8px 24px rgb(0 0 0 / 0.35);

Tailwind v4 reads the sub-properties as `--text-hero--line-height: 1.05;` and so on. Tailwind's own `font-serif` utility picks up the redefined `--font-serif`. In the base styles, add a global `:focus-visible` rule (a 2px solid `var(--accent-mint)` outline with a 2px offset), `cursor: pointer` for enabled buttons, and a `prefers-reduced-motion: reduce` rule that disables `.animate-fade-in` and `.animate-pulse-subtle`. Update the comment above `--chart-cat-1` to say the palette was validated against `--bg-secondary` #111614.

Fonts. In `src/app/layout.tsx`, import `Instrument_Serif` from `next/font/google` alongside the existing fonts, configure it with `variable: "--font-instrument-serif"`, `subsets: ["latin"]` and `weight: "400"`, and add its `.variable` class to `<body>`.

Primitives, in `src/components/ui/`, each a small client-safe component using only the semantic utilities (signatures under Interfaces and Dependencies):

- `Button`: primary (mint with dark ink), secondary (raised surface with a border) and ghost variants; `sm` (32px) and `md` (36px) sizes; an optional leading icon; `type="button"` by default. A `buttonClassName({ variant, size })` helper lets links share the look.
- `Card` with `CardHeader`: the 16px-radius surface container with `md` and `lg` padding, plus a header with a serif title, an optional secondary subtitle and an actions slot.
- `SegmentedControl`: a labeled group of `aria-pressed` buttons for a small set of mutually exclusive options. It has `sm` and `md` sizes and a `fullWidth` mode whose buttons are 44px tall on phones.
- `Chip`: a dismissible filter chip, a single button with a close icon and an explicit accessible name.
- `DeltaIndicator`: a direction triangle (a dash when flat) plus text, colored positive, negative or neutral, so meaning never rests on color alone.
- `LegendKey`: a series key drawn as a square, a solid line, a dashed line or a dot, next to a label in text color.
- `EmptyState` and `Skeleton`: the dashed empty message and the pulsing placeholder block.

Gallery. `src/app/design-system/page.tsx` is a server component that calls `notFound()` when `process.env.NODE_ENV === "production"`, and otherwise renders `src/components/ui/DesignSystemGallery.tsx`, a client component showing every token swatch with its name, the type scale, every primitive in each variant and state, and the three series colors with their legend keys. The auth middleware still requires the session cookie, so the harness cookie reaches it.

Guide. Write `docs/design-system.md`: principles (quiet surfaces, the data is the loudest thing on the page, one accent), the token tables (raw and semantic, with contrast figures), the type scale and when to use serif versus sans versus mono, radius and spacing conventions, each primitive's purpose and props, data-visualization rules (fixed series colors, a legend for two or more series, text never in series colors, solid hairline grids, selective labels, a delta always paired with an arrow), accessibility rules (4.5:1 text, 3:1 marks, 44px touch targets on phones, visible focus, real buttons), and a short migration note for panels still using raw `var(--...)` classes.

Guardrail. `src/__tests__/design-tokens.test.ts` reads `src/app/globals.css`, extracts each `--name: #hex;` from `:root`, and asserts WCAG contrast. Text tokens (`--text-primary`, `--text-secondary`, `--text-muted`, `--delta-up`, `--delta-down`) must reach at least 4.5:1 on `--bg-primary`, `--bg-secondary`, `--bg-tertiary` and `--bg-hover`. The mint accent and the three series colors (resolved through `--chart-cat-*`) must reach at least 3:1 on `--bg-secondary`. `--bg-primary` on `--accent-mint` must reach at least 4.5:1. The contrast function is the standard WCAG relative-luminance formula, written in the test. `src/__tests__/ui-primitives.test.tsx` covers the button variants, types and disabled state, `SegmentedControl` changing and reporting `aria-pressed`, `Chip` dismissal and its accessible name, and `DeltaIndicator` rendering the right arrow and tone for up, down and flat.

Shell adoption. In `src/app/page.tsx`, give both "ottermint" wordmarks (sidebar and mobile header) `font-serif text-2xl font-normal` in place of `text-lg font-semibold`, give the header page title `font-serif text-display font-normal`, and in both navigation lists replace the active `bg-[var(--accent-blue-dim)]` with `bg-surface-hover` and the active icon's `text-[var(--accent-blue)]` with `text-accent`. Rebuild `DashboardTabs` on `SegmentedControl`, keeping its labels "My Finances" and "Household" and its exported `DashboardTab` type. Render `RefreshButton`'s button as `Button` with the secondary variant and small size, keeping its text, its spinner and the "Updated … ago" label. Render `PlaidLinkButton` and the `ManualAccountForm` submit button as primary `Button`s, keeping their text and behavior (the Plaid test finds the button by role only). Dark ink on mint measures 10.15:1.

Result: every page is green-tinted, titles are serif, the active nav item is neutral with a mint icon, and `/design-system` shows the whole kit. Proof: the full test suite passes, including the two new test files; `npx tsc --noEmit` is clean; `npm run build` succeeds (it downloads Instrument Serif at build time, as it already does for DM Sans); and harness screenshots of `/design-system` and the Dashboard show the new theme. Commit the tokens and fonts, then the primitives, gallery and guide, then the shell adoption, as separate commits.

### Milestone 2: pure analytics model and formatting helpers, test-first

Goal: every number and geometry the new view shows comes from pure, unit-tested functions, so the components stay thin. Write the tests first in `src/__tests__/analytics-model.test.ts`, `src/__tests__/net-worth-totals.test.ts` and new cases in `src/__tests__/format.test.ts`, watch them fail, then implement.

In `src/lib/format.ts`, add `formatWholeCurrency` ("$396,516"; negatives "-$1,200"; null or unparseable input gives "$0"), `formatSignedWholeCurrency` ("+$27,555", "-$1,200", "$0" for zero), `formatCompactCurrency` for axes and end labels ("$950", "$5k", "$396k", "$1.24M", "-$10k"), and `formatSignedPercent(value, digits = 1)` ("+7.5%", "-8.2%", "0.0%"). Keep `formatCurrency` unchanged.

Create `src/lib/net-worth-totals.ts` with `computeNetWorthTotals(accounts, manualAccounts)`, moving the arithmetic out of `NetWorthCard` without changing it, and make `NetWorthCard` call it. The Dashboard must show identical numbers before and after.

Create `src/lib/analytics-model.ts`, importing only types and `labelForCategoryKey` from `src/lib/cashflow.ts` and types from `src/lib/net-worth-history.ts`. It holds the range definitions and the functions whose signatures appear under Interfaces and Dependencies. The behavior each must have follows.

`firstDataMonthIndex` returns the index of the first month whose income, spending or savings is non-zero, or null when every month is zero.

`resolvePeriod` takes all fetched months and the selection (range plus optional selected month) and returns the chart window, the summarized period, the equal-length prior period or null, and labels. The window is the last N months of the range (3, 6, 12 or 24), clipped to start no earlier than the first data month. The period is the window, or just the selected month when one is selected. The prior period is the same number of months immediately before the period, and is null when any of those months falls before the first data month or outside the fetched array, or when the period is only the partial current month. Labels: the period label is "Apr–Sep 2026" (en dash), "Oct 2025–Sep 2026" across years, "August 2026" for one month, or "September 2026 · month to date" for the partial month. The long comparison label is "Compared with the previous 3 months" or "Compared with July 2026", and the short one is "vs prior 3 mo" or "vs Jul". Both are null when there is no prior period. The history label is "History starts Jan 2026" when the window was clipped or the prior period is missing because of the data start, otherwise null. With no data at all, the window is the unclipped last N months and every label except the period label is null.

`sumPeriod` adds the period's income, spending and savings in integer cents (parse each string, multiply by 100, round) and returns dollars, with `netCashFlow` equal to income minus spending. `periodDelta(current, prior, upIsGood)` returns null when prior is zero, otherwise the percentage change, its direction (`flat` when the rounded percentage is 0.0) and whether it is good (up is good for Income, Saved and Net cash flow; down is good for Spending and for every category). `sparklineSeries(months, key, firstDataIndex)` returns the values of the last 12 non-partial months at or after the first data month.

`rankCategories(period, prior, top = 8)` sums `spendingByCategory` by key across the period's months, sorts descending, keeps the top eight with positive totals, and folds every other key (including net-refund negatives) into one "OTHER" row labeled "Other" whose `memberKeys` lists the folded keys; "Other" is omitted when nothing was folded and is always last. Each row's `barPct` is its total divided by the largest positive row total, times 100, clamped to between 0 and 100. Each row's delta compares to the same keys summed over the prior period, with down as good, or is null without a prior period or with a zero prior total.

`layoutCashflowColumns(months)` computes percentage geometry for the diverging chart. For each month, up equals the income clamped at zero plus the absolute savings when savings are negative, and down equals the spending clamped at zero plus the savings when positive. Take the largest up and largest down across months, multiply each by 1.08 for label headroom, and call their sum the total. The baseline sits at `upMax / total * 100` percent from the top. Each segment height is its value divided by the total, times 100. `savedAbove` is true when savings are negative. When everything is zero the baseline is at 50% and all heights are 0. Ticks use a "nice" step (1, 2, 2.5 or 5 times a power of ten) chosen so each side of the baseline gets about two ticks, and each tick carries its dollar value and its percentage position. Worked example to use as a test: months `{income 1000, spending 600, savings 200}` and `{income 500, spending 300, savings -100}` give up 1000, down 800, a baseline at 55.56%, first-month heights of 51.44% income, 30.86% spending and 10.29% saved, and a second-month saved height of 5.14% with `savedAbove` true.

`netWorthDaysForRange(range, today)` returns the whole days from the first day of the range's first month to today, so the net-worth line and the cash-flow window start on the same date, and 3650 for All. With today 2026-09-26 it returns 87 for 3M (from Jul 1), 178 for 6M (from Apr 1) and 360 for 1Y (from Oct 1, 2025).

`comparableChange(snapshots, mode)` walks backward from the last snapshot while the segment matches the last point's segment: `comparisonSegment` with non-null `adjustedNetWorth` in Normalized mode, or `coverageSegment` with raw `netWorth` in Reported mode. It needs at least two points, otherwise it returns null. It returns the amount (end value minus start value), the percentage (null when the start value is zero), `fromDate` (the start point's date), `spansWholeRange` (the start is the first snapshot) and `estimated` (any point in the stretch is reconstructed). Worked example: a reconstructed Mar 31 point at 380,000 in comparison segment 0, followed by observed points Jul 1 at 390,000, Jul 15 at 392,000 and Sep 26 at 396,000 in segment 1, gives in Normalized mode an amount of 6,000, about 1.54%, from 2026-07-01, not spanning the whole range, not estimated.

`netWorthDomain(values)` pads the minimum and maximum by 6% of the span (or 1% of the value when the span is zero), then rounds outward to a nice step, and never forces zero into the domain.

Result: `npx vitest run --dir src` shows the new files passing, and each new test failed before its implementation existed.

### Milestone 3: spending line-items API route and the longer net-worth range

Goal: the server can return the transactions behind any category or flow for any month range, and the net-worth routes accept All.

In `src/lib/cashflow.ts`, lift the `lineItem` closure inside `aggregateCashflow` to a module-level `toLineItem(row, displayCents)` used by both functions, with no behavior change; the existing cash-flow tests prove that. Then add `selectCashflowItems(rows, options)`. It skips pending rows, keeps rows whose `date.slice(0, 7)` lies between `from` and `to` inclusive and whose `classifyTransaction` result equals `flow`, and when `categoryKeys` is given, keeps only rows whose key (`categoryDetailed ?? category ?? "UNCATEGORIZED"`) is in that list. Display cents are the negated cents for income and the cents as-is for spending and savings. It sorts by date descending then name for `sort: "date"`, or by display amount descending for `sort: "amount"`. It computes `count` and `total` over every matching row before truncating to `limit`. Add tests to `src/__tests__/cashflow.test.ts` using the existing reconciliation fixture style: restaurants-only filtering, amount sorting, count and total ignoring the limit, pending rows excluded, internal rows never returned, and month bounds inclusive.

Create `src/app/api/analytics/cashflow/items/route.ts`, modeled on the existing cash-flow route (`getUserId`, `withUser`, `selectClassifiedTransactionRows(tx, userId, from + "-01")`, `logServerError`, 401 on auth errors, 500 otherwise). Query parameters: `from` and `to` as `YYYY-MM` matching `^\d{4}-(0[1-9]|1[0-2])$` with `from` not after `to`; `flow` of `income`, `spending` or `savings`; optional repeated `category` values each matching `^[A-Z0-9_]{1,80}$`, at most 100 of them; `sort` of `date` (default) or `amount`; `limit` an integer from 1 to 500 (default 200). Any invalid parameter returns 400 with `{ error: "<which parameter is invalid>" }` before touching the database. The response is `{ items, count, total }` (type `CashflowItemsResponse`, exported from the route). Cover it in `src/__tests__/cashflow-items-route.test.ts`, copying the mocking pattern of `src/__tests__/cashflow-route.test.ts`: 401 when unauthenticated, 400 for a bad month, a reversed range, an unknown flow, a lowercase category and a limit of 0, a filtered and sorted happy path with the correct count and total, and `mockWhere` not being called when validation fails.

In `src/app/api/net-worth/route.ts` and `src/app/api/groups/[id]/net-worth/route.ts`, change `Math.min(parsedDays, 365)` to `Math.min(parsedDays, 3650)`. Extend `src/__tests__/net-worth-routes.test.ts` with fake timers: with `days=3650` the `since` argument passed to the history builder is 3650 days before the fixed date, and with `days=99999` it is clamped to the same value.

Result: the new route tests pass, and the existing route tests still pass.

### Milestone 4: net-worth hero and restyled single-line chart

Goal: the top of Analytics becomes the hero card. Create `src/components/dashboard/NetWorthOverview.tsx`, a client component with props `accounts`, `manualAccounts`, `days`, optional `groupId` and optional `refreshKey`. It owns fetching (move the fetch from `NetWorthChart`), the Normalized/Reported mode state, and the hero. Fetch `/api/net-worth?days=<days>` or `/api/groups/<groupId>/net-worth?days=<days>` whenever `days`, `groupId` or `refreshKey` changes. Ignore responses from superseded requests, using an `AbortController` aborted in the effect cleanup, so rapid range clicks cannot show stale data. Show a skeleton only before the first successful load. During later refetches, keep the previous render at 60% opacity with `aria-busy="true"`. On failure, show a one-line error inside the card: "Net worth history couldn't load. Try Refresh."

The hero column shows a small label "Net worth" (or "Household net worth" when `groupId` is set), the value `formatWholeCurrency(totals.netWorth)` computed by `computeNetWorthTotals` from the props (so it always equals the Dashboard figure), and, when `comparableChange` returns a value, a line with a small up or down triangle, the signed whole-dollar amount and signed percentage in the delta color, followed in secondary text by "since Jul 1" (the year is added when it differs from the current year) and ", includes estimates" when `estimated` is true. The delta color is `--delta-up` for a gain and `--delta-down` for a loss, and the triangle keeps it from relying on color alone. Below a hairline, two rows show Assets and Liabilities with small square swatches in the income and spending series colors and whole-dollar values, then a 6px split bar (assets share in the income color, the rest in the spending color, 2px gap), then muted text "Liabilities are 24% of assets." when assets are positive.

Rewrite `src/components/dashboard/NetWorthChart.tsx` as a presentational component with props `history`, `mode`, `normalizedAvailable`, `onModeChange` and `isHousehold`. Keep `buildChartModel`, `buildLineSeries`, `groupBySegment`, `qualityLabel` and the custom tooltip, but restrict `METRICS` to Net Worth. Switch from `LineChart` to Recharts `ComposedChart`, with an `Area` under each non-estimated series (the series color at 10% opacity, no stroke) and a `Line` per series (2px, the mint accent, dashed "6 4" when estimated). Set the y-axis `domain` from `netWorthDomain`, format ticks with `formatCompactCurrency`, use `--chart-grid` for the solid horizontal grid, and draw each coverage event as a `ReferenceLine` with `stroke="var(--text-muted)"`, `strokeOpacity` 0.5 and no dash, plus a `ReferenceDot` of radius 3.5 at the bottom of the plot. Add an end label with the last value in compact form. Above the plot, place a legend row (a solid line key "Observed", a dashed key "Estimated" only when an estimated series exists, and a gray dot "Account change" only when events exist) and, on the right, the Normalized/Reported segmented toggle, only when `normalizedAvailable` (visible text "Normalized" and "Reported", `aria-pressed`). Remove the old "Change excluding coverage" line because the hero replaces it. Move the reconstruction details, the normalization note, the split note and the per-event descriptions into one `<details>` element with the summary "About this chart", keeping their sentences verbatim so the honesty wording survives. Keep `initialDimension` on `ResponsiveContainer` and `isAnimationActive={false}` on lines.

Update `src/__tests__/net-worth-chart.test.tsx` to render the component with props instead of stubbing fetch, and extend its `recharts` mock with `ComposedChart`, `Area` and `ReferenceDot`. Keep every existing assertion about segmentation, a unique chronological x-axis, dashing of reconstructed series and the note texts, with three deliberate exceptions. The "Change excluding coverage" assertion is dropped, because the hero's "since" line replaces it and the overview test covers that. The mode buttons are now found by their visible names "Normalized" and "Reported". The "1 year" button test is dropped, because the range control moves to `AnalyticsView` and Milestone 5 tests it. Create `src/__tests__/net-worth-overview.test.tsx` covering the hero value from account props, the "since" label and "includes estimates" suffix, the refetch URL when `days` changes, the household URL, and the error line on a failed fetch.

In `src/app/page.tsx`, replace the Analytics branch's `NetWorthCard` and `NetWorthChart` (in both the personal and household layouts) with `<NetWorthOverview accounts={visibleAccounts} manualAccounts={visibleManualAccounts} days={netWorthDaysForRange("6M", today)} groupId={isHousehold ? group?.id : undefined} refreshKey={refreshKey} />`, leaving `CashflowPanel` and the household placeholder where they are, and replace the `NetWorthChart` import with imports of `NetWorthOverview` and `netWorthDaysForRange`. Keep the `NetWorthCard` import, because the Dashboard destination still renders it. Here and in Milestone 5, `today` is `new Date().toISOString().slice(0, 10)`, the same UTC date the cash-flow route uses. `AnalyticsView` replaces this interim wiring in Milestone 5.

Result: component tests pass, and in the harness the Analytics page shows the hero card above the still-existing cash-flow panel.

### Milestone 5: filter row, stat tiles, cash-flow chart and category list

Goal: the rest of the design, wired into the page, with the old panel gone.

Create `src/components/dashboard/AnalyticsView.tsx`, which owns the state: `range` (default `"6M"`), `selectedMonth` (a `YYYY-MM` string or null), `detail` (null, `{ kind: "income" | "spending" | "saved" | "net" }` or `{ kind: "category", key: string }` where `key` may be `"OTHER"`), and the cash-flow fetch state (loading, error or ready, with the months array). It fetches `/api/analytics/cashflow?months=24` on mount and whenever `refreshKey` changes, unless `groupId` is set. Changing the range clears `selectedMonth` and `detail`. Clicking the selected month again, or the month chip, clears `selectedMonth`, and the detail kind stays selected and re-scopes to the new period. It renders the filter row (range control labeled as a group "Time range" with `aria-pressed` buttons, the month chip, the caption from `resolvePeriod`), then `NetWorthOverview` with `days={netWorthDaysForRange(range, today)}`. In household mode it then renders the existing placeholder text "Household spending analytics are not available yet." and nothing else. Otherwise it renders the tiles, the chart, the categories and, from Milestone 6, the details panel. When `firstDataMonthIndex` is null, the tiles, chart and categories are replaced by one card: "No transactions yet. Connect an account and refresh to sync." When the cash-flow fetch fails, they are replaced by "Cash flow couldn't load. Try Refresh."

Create `src/components/dashboard/StatTile.tsx`, a `<button>` with `aria-pressed` and a label, a value, an optional delta line and an optional sparkline. The delta line is a triangle, then `formatSignedPercent`, then the short comparison label in muted text; the Net cash flow tile appends " · 41% kept", using the same rounding as the old "of income kept" line. With no delta, the delta line is omitted. The sparkline is an inline 96 by 36 SVG path in `--chart-muted-line`, 1.5px wide, with a 3px mint end dot ringed in the card color, and it is hidden with fewer than two points. The selected tile gets a mint border. Values are primary text, never series-colored.

Create `src/components/dashboard/CashflowChart.tsx` with props `months` (the window), `selectedMonth`, `onSelectMonth`. Its header is the serif title "Cash flow", the subtitle "Income above the line, spending and saving below · <window label>", and a legend with three 10px square swatches (Income, Spending, Saved). The plot is 340px tall at the `sm` breakpoint and up and 220px below. Tick labels sit in a 44px left gutter in mono 11px muted text, with gridlines at each tick and the baseline in `--chart-baseline`. The columns are a flex row of equal-width `<button>` elements, each with `aria-pressed` and an `aria-label` such as "August 2026: income $9,400, spending $6,300, saved $1,600", holding absolutely positioned spans sized in percentages from `layoutCashflowColumns`. Income grows up from the baseline with rounded top corners. Spending hangs down from 2px below the baseline. Saved sits 2px below spending with rounded bottom corners, or 2px above income with rounded top corners when `savedAbove`. The selected column has a `bg-hover` background. Value labels ("+$9,400" above the up stack, "-$7,900" below the down stack, 11px semibold primary text) appear only on the selected column, or on the latest column when none is selected. Month labels sit under the columns in mono 11px text: every month when there are 12 or fewer columns, otherwise every third month as "Oct ’24". On hover or focus of a column, a small tooltip card (`bg-tertiary`, 1px border, 10px radius) shows the month and the four values, with the value first and the series name after it, each keyed by a short line in the series color. The tooltip mirrors the aria-label, so it never gates information.

Create `src/components/dashboard/CategoryList.tsx` with props `rows` (from `rankCategories`), `periodLabel`, `selectedKey` and `onSelect`. Its header is the serif title "Where it went" and the subtitle "Spending by category · <period label>". Each row is a `<button>` (at least 44px tall on phones, `aria-pressed`) laid out as a grid: the name with a 4px-tall share bar under it (track `--chart-grid`, fill `--series-spending`, width `barPct`%), the whole-dollar amount in mono, and the delta as a signed rounded percentage in the delta colors, or "—" when there is none. The "Other" row reads "Other · 23 categories". The footer reads "<total> total spending". With no rows it shows "No spending in this period."

In `src/app/page.tsx`, replace the Analytics branch with `<AnalyticsView accounts={visibleAccounts} manualAccounts={visibleManualAccounts} groupId={isHousehold ? group?.id : undefined} refreshKey={refreshKey} />`, and remove the now-unused imports of `NetWorthOverview`, `netWorthDaysForRange` and `CashflowPanel` (keep `NetWorthCard`, which the Dashboard still uses). Delete `src/components/dashboard/CashflowPanel.tsx` and `src/__tests__/cashflow-panel.test.tsx`. Create `src/__tests__/analytics-view.test.tsx`, which mocks `recharts` as the chart test does and stubs `fetch` with a small router keyed on URL prefixes. Cover: the default range shows six month columns and fetches `months=24` exactly once; switching to 3M changes the tile values without refetching cash flow and refetches net worth with `days=87` when the clock is fixed at 2026-09-26; clicking a month column scopes the tiles, shows the chip, and clicking the chip clears it; with fixture data starting in January, the 6M caption says "History starts Jan 2026" and the tiles show no delta, while 3M shows deltas; a month with negative savings still renders; household mode shows the placeholder and never requests cash flow; and a failed cash-flow fetch shows the error card. Fix the clock with `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime(new Date("2026-09-26T12:00:00Z"))`. Faking only `Date` matters, because faking every timer stalls Testing Library's `waitFor` and `findBy` queries.

Result: `grep -rn "CashflowPanel" src` prints nothing, the suite passes, and the harness shows the complete design except the details panel.

### Milestone 6: details panel

Goal: every tile and category can explain itself. Create `src/components/dashboard/AnalyticsDetails.tsx` with props `detail`, the resolved period (its months and label), `rows` from `rankCategories`, `comparisonLabel` and `onClose`. When `detail` is null, render a compact single-line prompt: "Select a stat or a category to see the transactions behind it." Otherwise render a header with the serif title, the period and comparison subtitle, three small stats and a close button (`aria-label="Close details"`), then a table, then a footer.

Income: the title "Income". Rows are the period months' `incomeItems`, newest first. The stats are the total, the transaction count and the largest item. Saved: the title "Saved". Rows are `savingsItems`, with withdrawals shown negative. The stats are the total, the transfer count and the share of income. Net cash flow: a month table (Month, Income, Spending, Saved, Net), newest first, whose stats are the total net, the month count and the share kept. Spending: fetch `/api/analytics/cashflow/items?from=<first>&to=<last>&flow=spending&sort=amount&limit=25`, titled "Largest purchases", with stats for the total, the transaction count from `count`, and the average. Category: fetch the same route with `sort=date&limit=200` and one `category` parameter per key (the row's `memberKeys` for "Other"), titled with the category label, with stats for the total, the count and the average. The transaction table columns are Date (mono, "Sep 26"), Merchant (`merchantName ?? name`, truncated), Category (`labelForCategoryKey`), Account and Amount (mono, exact cents via `formatCurrency`, right-aligned). Its body scrolls within 480px. When truncated, the footer reads "Showing 200 of 342". Fetches follow the same abort-on-change rule and show a one-line loading or error state inside the panel. When the panel opens, scroll it into view with `scrollIntoView({ block: "nearest", behavior: "smooth" })`, and do nothing when `prefers-reduced-motion` is set.

Wire it into `AnalyticsView`: clicking a tile sets `detail` to its kind or clears it if already selected, and clicking a category row sets or clears `{ kind: "category", key }`. When the selected category key is not present in the current ranking, the panel shows "No transactions in this period." Extend `src/__tests__/analytics-view.test.tsx`. Clicking Income lists the fixture payroll items and sets `aria-pressed`, and clicking it again closes the panel. Saved renders a withdrawal as "-$400.00". Clicking a category requests the items route with the right `from`, `to` and `category` values and renders the returned rows and "Showing 2 of 2". The Other row sends all folded keys. The Spending tile requests `sort=amount&limit=25`. Net cash flow renders one row per period month. Changing the range closes the panel.

Result: the suite passes, and in the harness each tile and category opens a populated panel.

### Milestone 7: visual, accessibility and hygiene pass

Goal: the page looks like the design at desktop and phone widths and meets the accessibility rules. First, produce the reference: render the two approved mock boards to static HTML (the design canvas files use a small template language of `{{ }}` holes plus `<sc-for>` and `<sc-if>` loops and conditions over values from the board's `renderVals()`; expand them once with a jsdom script and save the resulting self-contained markup) as `docs/design/analytics-redesign/desktop.html` (1440 by 1700) and `docs/design/analytics-redesign/phone.html` (390 by 2000), and commit them with a short README naming the source canvas and the known, intended deviations listed in the Decision Log. Then start the dev server and run the harness from Artifacts and Notes in its `mock` fixture mode at 1440 by 1000 and at 390 by 844, screenshot both the reference files (opened from disk) and the implementation full page, and compare them side by side: section order, proportions, spacing rhythm, type faces and sizes, colors, chart shapes and label placement. Fix every unintended difference and re-screenshot until the only differences are the intended ones. Then repeat in the `production` fixture mode to check clipping and the no-comparison states. Wait 5 seconds before each screenshot. Compare against the Visual specification. Check that nothing overflows horizontally at 390px, that no label is clipped by its bar, that the chart container includes its x-axis labels without an inner scrollbar, and that every tile, column, category row, range button and chip is reachable with Tab and toggles with Enter or Space with a visible 2px mint focus outline (add `focus-visible:outline` classes where missing). Run the palette validator from the data-visualization guidance, or recompute contrast, for any color you had to change. Then run the full checks listed under Concrete Steps. Record screenshots and any fixes in Surprises & Discoveries, and never commit screenshots.

### Milestone 8: merge, deploy and verify in production

Goal: the owner sees the redesign on real data. The user authorized merging and deploying on 2026-09-27 as part of running this plan end to end. Fast-forward `origin/main` to the branch as the repository's convention requires (no pull request; the remote uses the owner's personal GitHub identity), run `scripts/deploy.sh`, and confirm its health probe. No migration runs. Then verify: the live health probe, the live CSS containing the new tokens, and the production-data checks in Validation and Acceptance. Where a check needs the owner's signed-in session, which this agent does not have, run the owner's production rows (read-only, via `ssh otterholt` and psql as in `docs/DEPLOYMENT.md`) through the same pure functions the API uses and render the result in the local harness. Keep those rows in the scratch directory, never in the repository or in commits. Record the evidence (figures and dates, never merchant names) in Outcomes & Retrospective and commit that update to the plan.


## Concrete Steps

All commands run from `/Users/justin/code/personal/OtterMint` unless stated.

The branch `feat/analytics-redesign` already exists (created from `origin/main` at 42e6e91) with all earlier pending work committed. Confirm before starting:

    git switch feat/analytics-redesign
    git status --short        (prints nothing)

After every edit batch, and at the end of every milestone:

    npx vitest run --dir src
      Test Files  N passed | 1 skipped
      Tests  M passed | 41 skipped
    npx tsc --noEmit
    npm run lint
      /Users/justin/code/personal/OtterMint/src/lib/sync-holdings.ts
        3:10  warning  'eq' is defined but never used  @typescript-eslint/no-unused-vars
      ✖ 1 problem (0 errors, 1 warning)

The baseline before any change is 44 test files passed and 1 skipped, with 365 tests passed and 41 skipped. `N` and `M` must only grow, except that Milestone 5 removes `cashflow-panel.test.tsx` and its 11 tests. The 41 skipped tests need a real Postgres and stay skipped. The single lint warning predates this work; any new warning or error must be fixed.

Run a production build at the end of Milestones 1, 5 and 7 (it needs network access for Google Fonts):

    npm run build

Commit at least once per milestone, staging by explicit path so stray files never ride along. Example for the first Milestone 1 commit:

    git add src/app/globals.css src/app/layout.tsx docs/plans/analytics-redesign.md
    git commit -m "feat(design-system): green-tinted tokens, semantic theme layer, serif display face"

End commit messages with the attribution line the working session specifies. Update the Progress section in the same commit.

To run the harness (Milestones 1, 4, 5, 6 and 7), start the dev server in one terminal:

    npm run dev -- --port 3000
      ▲ Next.js 16.2.7 (Turbopack)
      - Local:         http://localhost:3000
      ✓ Ready in ...

Then run the harness function from Artifacts and Notes with a Playwright browser. Using the Playwright browser tool, pass the function body inline, or save it as `.playwright-mcp/analytics-harness.js` (inside the repository, untracked, never committed). Resize to 390 by 844 and reload for the phone check. Stop the server with Ctrl-C, or `lsof -ti tcp:3000 | xargs kill`, when finished.

Milestone 8 (authorized by the user on 2026-09-27):

    git push origin feat/analytics-redesign:main
    git fetch origin && git status -sb    # branch tip must equal origin/main
    scripts/deploy.sh
      ==> [1/2] Fast-forward repo + rebuild app on otterholt
      ==> [2/2] Health check
      ... "ok" ...

`scripts/deploy.sh` refuses to run unless local HEAD equals `origin/main`, which is why the push comes first.


## Validation and Acceptance

Unit and route tests. `npx vitest run --dir src` passes. The new files `analytics-model.test.ts`, `net-worth-totals.test.ts`, `cashflow-items-route.test.ts`, `net-worth-overview.test.tsx` and `analytics-view.test.tsx` exist and failed before their implementation. The worked examples in Milestone 2 (baseline 55.56%, days 87, 178 and 360, and the comparable change of +6,000 from 2026-07-01) are asserted literally.

Harness behavior at 1440px, with the fixture data in Artifacts and Notes (fixture months end in September 2026 whatever the machine date). Analytics opens on 6M with six columns Apr through Sep. The caption reads "History starts Jan 2026", because the fixtures start in January. The tiles show values with no delta line. The hero shows $396,510 and a "since" change line. Clicking 3M shows three columns and a caption "Compared with the previous 3 months", adds delta lines to all four tiles, and triggers exactly one new network request, `/api/net-worth?days=<N>` where N is the whole days from the first day of the 3M window to the machine's date (87 on 2026-09-26), and no cash-flow request. Clicking the August column scopes the tiles to August, shows the chip "August 2026", and changes the caption to "Compared with July 2026". Clicking the chip restores the range. Clicking "Restaurants" opens the details panel with rows from the items route. The May column's saved segment sits above its income bar, because the fixture's May savings are negative. Choosing All requests `days=3650`. At 390px, the range buttons span the width and are at least 44px tall, the tiles form a 2 by 2 grid, the cash-flow plot is 220px tall, nothing scrolls horizontally, and the Tab key reaches every interactive element in visual order.

Production, after deploy, as the owner. The Analytics hero value equals the Dashboard's net worth to the cent after rounding. On 3M, the tiles show deltas versus Apr–Jun; on 6M, the caption reads "History starts Jan 2026" and no deltas appear. Selecting August: the four tile values equal, after rounding to whole dollars, the August object from `/api/analytics/cashflow?months=24` in the browser's network panel (August spending was 8,365.34 when last verified on 2026-09-01, so it should read $8,365 unless later syncs changed it). The category rows including Other sum to the Spending tile. Opening the top category shows a count equal to the `count` field returned by the items route. All draws the reconstructed January–June stretch dashed, and the hero's change line names its start date. The Dashboard, Accounts, Transactions and Investments destinations render in the new theme without layout breakage.


## Idempotence and Recovery

Every code step is an ordinary file edit that can be repeated or reverted with git. The only deletions (`CashflowPanel.tsx` and its test) happen in Milestone 5 after their replacements pass tests, and `git revert` restores them. There is no migration, no data change and no new dependency. The harness only intercepts requests inside the browser and never reaches a server API or a database, so it can run any number of times. If the dev server port is busy, stop the old process with `lsof -ti tcp:3000 | xargs kill` or use another port and change `BASE` in the harness.

If a deploy misbehaves, production keeps running the previous image when the build fails, because `up --build` builds before swapping containers. If the new image is live but wrong, revert the merge commit on `main`, push, and run `scripts/deploy.sh` again. Because no schema changed, a rollback is always safe.

If implementation stops midway, the Progress section must say which milestone is partly done and what remains, and the branch must still pass the suite at its last commit.


## Artifacts and Notes

Contrast measurements used for the tokens (WCAG ratio, computed with the palette validator's `contrast` function):

    16.04  text primary #edf1ef on card #111614
     7.92  text secondary #a3ada8 on card
     4.90  text muted #85908a on card          (old #6b7280 on old card: 3.75)
     4.85  text muted on hover fill #1c2320
     5.18  text muted on raised #171d1a
     9.51  mint #34d399 on card
     7.12  delta-down #f0836f on card
    10.15  ink #0a0d0c on mint button
     5.37  income series #199e70 on card (mark, needs 3:1)

Palette validation of the cash-flow series on the new card surface:

    node validate_palette.js "#199e70,#d95926,#3987e5" --mode dark --surface "#111614"
      [PASS] Lightness band         all 3 inside L 0.48–0.67
      [PASS] Chroma floor           all 3 >= 0.1
      [PASS] CVD separation         worst adjacent #d95926↔#199e70 ΔE 9.4 (deutan)
      [PASS] Normal-vision floor    worst adjacent #d95926↔#199e70 ΔE 26.5 (normal)
      [PASS] Contrast vs surface    all 3 >= 3:1

The committed files `docs/design/analytics-redesign/harness/prod-fixtures.js` and `mock-fixtures.js` are the canonical, current harnesses; their README gives the steps. The version below is the original sketch, kept for context. The database-free harness is a function taking a Playwright `page`. It sets a fake session cookie (the middleware only checks its UUID shape), answers every `/api/*` request from fixtures, opens the page and clicks Analytics. It avoids the `URL` global, because the Playwright tool's sandbox lacks it. Fixture months start in January 2026 like production, the May savings are negative on purpose, and the items route returns two restaurant rows.

    async (page) => {
      const BASE = 'http://localhost:3000';
      await page.context().addCookies([{ name: 'session_id', value: '00000000-0000-4000-8000-000000000001', url: BASE }]);
      const parse = (u) => {
        const m = u.match(/^https?:\/\/[^/]+(\/[^?#]*)(?:\?([^#]*))?/);
        const q = {};
        (m && m[2] ? m[2].split('&') : []).forEach((kv) => {
          const [k, v] = kv.split('=');
          const key = decodeURIComponent(k), val = decodeURIComponent(v ?? '');
          q[key] = key in q ? [].concat(q[key], val) : val;
        });
        return { p: m ? m[1] : u, q };
      };
      const money = (n) => n.toFixed(2);
      const iso = (t) => new Date(t).toISOString().slice(0, 10);
      const TODAY = Date.UTC(2026, 8, 26);
      const history = (days) => {
        const snapshots = [];
        let v = 390000;
        for (let i = Math.min(days, 238); i >= 0; i -= 7) {
          v += 900 + Math.sin(i / 11) * 2600;
          const reconstructed = i > 88;
          snapshots.push({ date: iso(TODAY - i * 864e5), totalAssets: money(v + 125740), totalLiabilities: '125740.00',
            netWorth: money(v), depositoryTotal: null, creditTotal: null, investmentTotal: null, loanTotal: null,
            manualAssetsTotal: null, manualLiabilitiesTotal: null, coverageFingerprint: 'fp-1',
            reconstructionNotes: reconstructed ? 'Estimated from month-end statements.' : null,
            adjustedTotalAssets: money(v + 125740), adjustedTotalLiabilities: '125740.00', adjustedNetWorth: money(v),
            quality: reconstructed ? 'reconstructed' : 'observed', coverageSegment: reconstructed ? 0 : 1,
            comparisonSegment: reconstructed ? 0 : 1 });
        }
        return { snapshots, coverageEvents: [], periodChange: null };
      };
      const CATS = [['RENT_AND_UTILITIES_RENT', 'RENT_AND_UTILITIES', .30], ['FOOD_AND_DRINK_RESTAURANTS', 'FOOD_AND_DRINK', .17],
        ['FOOD_AND_DRINK_GROCERIES', 'FOOD_AND_DRINK', .15], ['GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'GENERAL_MERCHANDISE', .09],
        ['TRANSPORTATION_GAS', 'TRANSPORTATION', .07], ['RENT_AND_UTILITIES_GAS_AND_ELECTRICITY', 'RENT_AND_UTILITIES', .06],
        ['ENTERTAINMENT_TV_AND_MOVIES', 'ENTERTAINMENT', .05], ['GENERAL_SERVICES_INSURANCE', 'GENERAL_SERVICES', .05],
        ['PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS', 'PERSONAL_CARE', .03], ['TRANSFER_OUT_OTHER_TRANSFER_OUT', 'TRANSFER_OUT', .03]];
      const cashflow = (n) => {
        const months = [];
        for (let i = n - 1; i >= 0; i--) {
          const month = iso(Date.UTC(2026, 8 - i, 1)).slice(0, 7);
          const hasData = month >= '2026-01';
          const k = 1 + Math.sin(i * 1.7) * 0.12, part = i === 0 ? 0.85 : 1;
          const income = hasData ? 9400 * (i % 6 === 3 ? 1.35 : 1) * part : 0;
          const spending = hasData ? 6300 * k * part : 0;
          const savings = hasData ? (month === '2026-05' ? -800 : 1600 * k * part) : 0;
          months.push({ month, partial: i === 0, income: money(income), spending: money(spending), savings: money(savings),
            netCashFlow: money(income - spending),
            spendingByCategory: hasData ? CATS.map(([key, primary, s]) => ({ key, primary, total: money(spending * s) })) : [],
            incomeItems: hasData ? [{ date: month + '-15', amount: money(income), name: 'ACME PAYROLL', merchantName: null,
              categoryKey: 'INCOME_WAGES', accountName: 'TOTAL CHECKING' }] : [],
            savingsItems: hasData ? [{ date: month + '-16', amount: money(savings), name: 'Transfer to brokerage', merchantName: null,
              categoryKey: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', accountName: 'TOTAL CHECKING' }] : [] });
        }
        return { months };
      };
      const acct = (id, name, type, bal) => ({ id, accountId: 'acct-' + id, name, officialName: null, type, subtype: null,
        mask: String(1000 + id), currentBalance: money(bal), availableBalance: null, limitAmount: null, isoCurrencyCode: 'USD',
        lastRefreshedAt: new Date(Date.now() - 240000).toISOString(), institutionName: 'Sample Bank', errorCode: null });
      await page.route('**/api/**', async (route) => {
        const { p, q } = parse(route.request().url());
        const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        if (p === '/api/auth/me') return json({ user: { id: 'u1', email: 'sample@example.com', displayName: 'Sample User' } });
        if (p === '/api/groups') return json({ groups: [] });
        if (p === '/api/accounts') return json({ itemStatuses: [], accounts: [acct(1, 'TOTAL CHECKING', 'depository', 18450),
          acct(2, 'Brokerage', 'investment', 402300), acct(3, 'Roth IRA', 'investment', 101500),
          acct(4, 'Sapphire', 'credit', 2740), acct(5, 'Mortgage', 'loan', 123000)] });
        if (p === '/api/manual-accounts') return json({ manualAccounts: [] });
        if (p === '/api/net-worth' || /^\/api\/groups\/[^/]+\/net-worth$/.test(p)) return json(history(Number(q.days ?? 90)));
        if (p === '/api/analytics/cashflow') return json(cashflow(Number(q.months ?? 6)));
        if (p === '/api/analytics/cashflow/items') return json({ count: 2, total: '96.40', items: [
          { date: '2026-09-21', amount: '58.20', name: 'DIN TAI FUNG', merchantName: 'Din Tai Fung', categoryKey: 'FOOD_AND_DRINK_RESTAURANTS', accountName: 'Sapphire' },
          { date: '2026-09-12', amount: '38.20', name: 'TACOS EL SOL', merchantName: null, categoryKey: 'FOOD_AND_DRINK_RESTAURANTS', accountName: 'Sapphire' }] });
        if (p === '/api/transactions') return json({ transactions: [] });
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no fixture for ' + p }) });
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(BASE + '/');
      await page.getByRole('button', { name: 'Analytics' }).first().click();
      await page.waitForTimeout(5000);
      return await page.evaluate(() => document.body.innerText.slice(0, 1200));
    }

The harness's "today" for fixtures is 2026-09-26, but the page uses the machine clock. When running on a later date, expect the month labels to shift. The behaviors described in Validation and Acceptance still hold relative to the fixture months.

The before state, from the harness run on 2026-09-27 at 1440px: a "NET WORTH" card ($396,510.00 with green assets and red liabilities), a "NET WORTH OVER TIME" chart whose y-axis starts at $0 so the net-worth line is nearly flat among dashed assets and liabilities lines, and a "CASH FLOW" card with a month dropdown, four tiles with colored mono values, a grouped bar chart and a pie with a nine-row legend.


## Interfaces and Dependencies

No new packages. Use React 19, Next.js 16, Tailwind CSS v4, Recharts 3.7 (`ComposedChart`, `Area`, `Line`, `ReferenceLine`, `ReferenceDot` are all exported), `lucide-react` for the chip close icon if convenient, and `next/font/google`'s `Instrument_Serif`.

In `src/lib/format.ts`, add:

    export function formatWholeCurrency(amount: number | string | null | undefined): string;
    export function formatSignedWholeCurrency(amount: number | string | null | undefined): string;
    export function formatCompactCurrency(amount: number): string;
    export function formatSignedPercent(value: number, digits?: number): string;

In `src/lib/net-worth-totals.ts`, define:

    import type { AccountWithInstitution } from "@/app/api/accounts/route";
    import type { ManualAccountRow } from "@/app/api/manual-accounts/route";
    export interface NetWorthTotals { assets: number; liabilities: number; netWorth: number; accountCount: number }
    export function computeNetWorthTotals(
      accounts: Pick<AccountWithInstitution, "type" | "currentBalance">[],
      manualAccounts: Pick<ManualAccountRow, "type" | "balance">[]
    ): NetWorthTotals;

In `src/lib/analytics-model.ts`, define:

    export type AnalyticsRange = "3M" | "6M" | "1Y" | "ALL";
    export const ANALYTICS_RANGES: ReadonlyArray<{ id: AnalyticsRange; label: string; months: number }>;
      // [{ "3M", "3M", 3 }, { "6M", "6M", 6 }, { "1Y", "1Y", 12 }, { "ALL", "All", 24 }]
    export const CASHFLOW_FETCH_MONTHS = 24;
    export function firstDataMonthIndex(months: CashflowMonth[]): number | null;
    export interface PeriodSelection { range: AnalyticsRange; month: string | null }
    export interface ResolvedPeriod {
      windowMonths: CashflowMonth[];
      periodMonths: CashflowMonth[];
      priorMonths: CashflowMonth[] | null;
      periodLabel: string;
      comparisonLabel: string | null;       // "Compared with the previous 3 months" | "Compared with July 2026"
      comparisonShortLabel: string | null;  // "vs prior 3 mo" | "vs Jul"
      historyStartsLabel: string | null;    // "History starts Jan 2026"
    }
    export function resolvePeriod(months: CashflowMonth[], selection: PeriodSelection): ResolvedPeriod;
    export interface PeriodTotals { income: number; spending: number; savings: number; netCashFlow: number }
    export function sumPeriod(months: CashflowMonth[]): PeriodTotals;
    export interface Delta { pct: number; direction: "up" | "down" | "flat"; good: boolean }
    export function periodDelta(current: number, prior: number, upIsGood: boolean): Delta | null;
    export function sparklineSeries(months: CashflowMonth[], key: keyof PeriodTotals, firstDataIndex: number | null): number[];
    export interface CategoryRow { key: string; label: string; total: number; barPct: number; delta: Delta | null; memberKeys: string[] }
      // key is the category key, or "OTHER" for the folded row; memberKeys is [key] for ordinary rows
    export function rankCategories(period: CashflowMonth[], prior: CashflowMonth[] | null, top?: number): CategoryRow[];
    export interface CashflowColumnLayout {
      baselinePct: number;
      ticks: Array<{ value: number; pct: number }>;
      columns: Array<{ month: string; incomePct: number; spendingPct: number; savedPct: number; savedAbove: boolean }>;
    }
    export function layoutCashflowColumns(months: CashflowMonth[]): CashflowColumnLayout;
    export function netWorthDaysForRange(range: AnalyticsRange, today: string): number;
    export interface ComparableChange { amount: number; pct: number | null; fromDate: string; spansWholeRange: boolean; estimated: boolean }
    export function comparableChange(snapshots: NetWorthSnapshotRow[], mode: "normalized" | "reported"): ComparableChange | null;
    export function netWorthDomain(values: number[]): [number, number];

In `src/lib/cashflow.ts`, add:

    export interface CashflowItemsOptions {
      from: string;                 // "YYYY-MM", inclusive
      to: string;                   // "YYYY-MM", inclusive
      flow: "income" | "spending" | "savings";
      categoryKeys?: string[];
      sort: "date" | "amount";
      limit: number;
    }
    export function selectCashflowItems(rows: CashflowRow[], options: CashflowItemsOptions):
      { items: CashflowLineItem[]; count: number; total: string };

In `src/app/api/analytics/cashflow/items/route.ts`, export:

    export type CashflowItemsResponse = { items: CashflowLineItem[]; count: number; total: string };
    export async function GET(request: NextRequest): Promise<NextResponse>;

Design-system primitives (in `src/components/ui/`, each its own file, named exports):

    export type ButtonVariant = "primary" | "secondary" | "ghost";
    export type ButtonSize = "sm" | "md";
    export function buttonClassName(opts?: { variant?: ButtonVariant; size?: ButtonSize; className?: string }): string;
    export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: React.ReactNode }): JSX.Element;
    export function Card(props: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div"; padding?: "none" | "md" | "lg" }): JSX.Element;
    export function CardHeader(props: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; headingLevel?: 2 | 3 }): JSX.Element;
    export function SegmentedControl<T extends string>(props: { options: ReadonlyArray<{ value: T; label: string }>; value: T;
      onChange: (value: T) => void; ariaLabel: string; size?: "sm" | "md"; fullWidth?: boolean }): JSX.Element;
    export function Chip(props: { label: string; onDismiss: () => void; dismissLabel: string }): JSX.Element;
    export function DeltaIndicator(props: { direction: "up" | "down" | "flat"; tone: "positive" | "negative" | "neutral"; children: React.ReactNode; size?: "sm" | "md" }): JSX.Element;
    export function LegendKey(props: { color: string; shape: "square" | "line" | "dashed-line" | "dot"; children: React.ReactNode }): JSX.Element;
    export function EmptyState(props: { children: React.ReactNode; className?: string }): JSX.Element;
    export function Skeleton(props: { className?: string }): JSX.Element;

Components (all `"use client"`, in `src/components/dashboard/`):

    AnalyticsView({ accounts, manualAccounts, groupId?, refreshKey? })
    NetWorthOverview({ accounts, manualAccounts, days, groupId?, refreshKey? })
    NetWorthChart({ history, mode, normalizedAvailable, onModeChange, isHousehold })
    StatTile({ label, value, delta, comparisonShortLabel, extra?, spark, pressed, onClick })
    CashflowChart({ months, selectedMonth, onSelectMonth })
    CategoryList({ rows, periodLabel, selectedKey, onSelect })
    AnalyticsDetails({ detail, periodMonths, periodLabel, comparisonLabel, rows, onClose })

`NetWorthCard` keeps its current props and appearance and calls `computeNetWorthTotals`.


Revision note (2026-09-27): Initial version, written after researching the code, proving the database-free harness, and counting production history. No implementation yet.

Revision note (2026-09-27, later the same day): The user approved the app-wide theme, asked for a baseline design system, asked that all pending work be committed first, and authorized running the plan end to end including deploy and mock-fidelity validation in a real browser. Milestone 1 now builds the design-system foundation (semantic tokens, primitives, gallery, guide, contrast test) and adopts it in the shell. Milestone 7 adds committed static renders of the mock and a side-by-side comparison. Milestone 8 no longer waits for approval and describes how production is verified without the owner's session. The staging rule that kept the category-rules edits out was superseded when the user asked to commit everything.
