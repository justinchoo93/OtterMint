# Add a FIRE destination: the earliest date the household could retire, account by account

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. It is maintained in accordance with `docs/PLANS.md` at the repository root.

## Purpose / Big Picture

FIRE stands for "financial independence, retire early": saving and investing enough that the household can stop working long before the usual retirement age. OtterMint already knows the household's investment balances and, from its transactions, what the household earns and spends. It cannot answer the owner's question from 2026-10-09: "based on my current financials, when could we retire?" The honest answer depends on more than one total. Money sits in accounts that open at different ages. A brokerage account can be spent any time. A 401(k) normally waits until 59½. A governmental 457(b) opens the day its owner leaves the job. A Washington State PERS Plan 3 pension pays a monthly income from 55 to 65 depending on choices. Social Security starts between 62 and 70. Several accounts that matter (a River bitcoin account, the partner's Roth IRA, 457(b) and PERS 3 investment account) are not in OtterMint at all.

After this change the sidebar has a "FIRE" destination. It shows the earliest month the owner could retire, and a chart of invested money from today to age 95. A "Try retiring at" slider tests any other age and says whether that date works. A timeline shows which accounts pay for which years. A table lists the OtterMint accounts with balances that update by themselves, plus accounts the owner types in. A panel holds every assumption the projection uses, and three tiles show what moves the date. Everything the owner types is saved to their OtterMint login, so it is there on the phone and the laptop. **Nothing typed on this page changes real accounts, balances or net worth**: the typed accounts live only inside the FIRE plan (the owner asked for this explicitly on 2026-10-09).

The owner approved an interactive mock on 2026-10-09 (private design canvas https://claude.ai/artifact/5hJxDbfdQ86JT5STg6wGPB, version 3). Milestone 1 commits its source and a static render under `docs/design/fire-calculator/` so a reader of this repository can see the target without the canvas.

To see it working after implementation, sign in and click "FIRE" in the sidebar. Enter both ages, then add the partner's 457(b) with a balance and a yearly contribution. The headline date moves earlier. Drag "Try retiring at" below that date and the status turns to "Short at …". Reload the page and every typed value is still there. The Accounts and Dashboard pages show the same net worth as before.

## Progress

- [x] (2026-10-09 20:10Z) Research, design decisions and this plan.
- [x] (2026-10-09 20:20Z) Milestone 1: design reference committed under `docs/design/fire-calculator/`. The render prints `leftover holes: 0`; `render.mjs` now skips a missing phone board.
- [x] (2026-10-09 20:35Z) Milestone 2: `src/lib/fire-model.ts` with 25 unit tests. The mock's sample household reproduces its headline, "Jul 2033", and the binary search agrees with a linear scan.
- [x] (2026-10-09 20:50Z) Milestone 3: `fire_plans` with its RLS policy (`drizzle/0016_famous_harpoon.sql`), `validateFirePlan`, `GET`/`PUT /api/fire`, and 13 tests. All 17 migrations applied to a fresh Postgres 17, and the gated RLS suite passed (48 tests, including the three new `fire_plans` cases).
- [x] (2026-10-09 21:10Z) Milestone 4: the FIRE destination (`src/components/fire/`) and its nav item, with 6 view tests. The full suite passes (709 passed, 49 gated skips); `tsc` and `eslint src` are clean apart from one earlier warning in `src/lib/sync-holdings.ts`.
- [x] (2026-10-09 21:30Z) Milestone 5: an end-to-end run of the real app against a disposable database seeded with the mock's household, with screenshots at 1440 and 390; three layout fixes came out of it. The read-only production replay matched the expected figures (see Surprises & Discoveries). The export and the temporary test were deleted.
- [x] (2026-10-09 21:40Z) Milestone 6: `origin/main` fast-forwarded to the branch (b87c79b) and the local main synced.
- [ ] Production, waiting for the owner's go-ahead: apply `drizzle/0016_famous_harpoon.sql` by hand on the NAS (`docs/DEPLOYMENT.md` §5.5), then run `scripts/deploy.sh`.

## Surprises & Discoveries

- Observation: on production data the twelve-month figures come out at take-home $15,626 a month, spending $7,638 a month and cash saved $95,851 a year (October 2025 to September 2026, twelve months counted). The account types were suggested as expected:
  - three brokerage accounts (Chase Self-Directed ····6850 and ····6940, Schwab Individual);
  - one Roth IRA;
  - the "Vanguard 401K" manual asset as a 401(k);
  - both checking accounts and the "Kimmy Choo's Trust Fund" savings account as not counted.

  Evidence: 1,291 classified rows and 11 category memories, exported read-only on 2026-10-10 and replayed through `enrichDescriptors`, `applyCategoryRules`, `applyUserCategories`, `aggregateCashflow` and `summarizeCashflow`. Two accounts share the name "Self-Directed", so the table's institution-and-mask line is what tells them apart.

- Observation: the JSX compiler dropped the space in `Plus {formatWholeCurrency(x)} a year …` when the text after the expression ran to the end of the line, so the page read "$90,000a year".
  Evidence: in the browser the text nodes were `"Plus "`, `"$90,000"`, `"a year of …"`. The sentence is now one template string.

- Observation: the visually hidden labels (`sr-only`, absolutely positioned) inside the horizontally scrolling accounts table escaped its clipping and widened phones by 363 px. Their containing block was outside the scroll box.
  Evidence: `scrollWidth − clientWidth` was 363 at 390 px wide and 0 on every other destination; it fell to 0 once the scroll box became `relative`.

- Observation: Next's dev server blocks its client resources for the `127.0.0.1` origin, so the page never hydrated there. Use `http://localhost:<port>` for browser checks.
  Evidence: "Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from 127.0.0.1" in the dev log, and the page stuck on its loading skeleton.

## Decision Log

- Decision: build the account-access-age model from the approved mock, not a "25 times spending" target.
  Rationale: the owner chose it on 2026-10-09. This household's large 457(b) (no early-withdrawal penalty after leaving the job) and PERS 3 pension make the years before 59½ the binding constraint, and a single multiple of spending cannot show that.
  Date/Author: 2026-10-09, owner and agent.

- Decision: accounts typed on the FIRE page are stored only inside the FIRE plan. They are never written to `manual_accounts` and never touch net worth.
  Rationale: the owner said "the accounts I add here shouldn't affect my real accounts".
  Date/Author: 2026-10-09, owner.

- Decision: store the plan server-side in a new `fire_plans` table, one row per user, holding a validated JSON document, protected by the same Row-Level Security as every other owned table.
  Rationale: the owner uses the app from a phone and a laptop, so browser storage would split the plan in two. A JSON document keeps the many assumption fields out of the relational schema. Fields will change as the calculator grows, and nothing else in the app queries them.
  Date/Author: 2026-10-09, agent.

- Decision: the plan always has two people, "you" and "partner". The pension belongs to whoever is chosen: you, your partner, or nobody.
  Rationale: OtterMint is this household's app, and the mock assumes a couple. A single-person mode would add switches the owner did not ask for. A partner with no accounts and $0 pay has no effect except their age.
  Date/Author: 2026-10-09, agent.

- Decision: OtterMint's figures for monthly take-home pay, monthly spending and yearly cash saved come from the last twelve complete calendar months of the existing cash-flow aggregation (`aggregateCashflow` over `selectClassifiedTransactionRows`). Months before the first month with any data are not counted. Spending and cash saved are stored as `null` until the owner overrides them, so the live figures keep flowing in.
  Rationale: this matches the Dashboard's definitions exactly, so the FIRE page and the Analytics page agree. An override is still possible, because retirement spending need not equal today's spending.
  Date/Author: 2026-10-09, agent.

- Decision: OtterMint accounts appear in the table with a suggested "type" (brokerage, Roth IRA, 401(k) and so on) inferred from their Plaid subtype, or from a manual account's subtype and name. Checking and savings accounts are listed but "Not counted" by default. The owner can change any account's type, owner and yearly contribution, and those choices are stored in the plan by a stable account key.
  Rationale: Plaid subtypes are inconsistent across institutions (see the repository's history of taxonomy drift), and a manual "Vanguard 401K" only says so in free text. A suggestion plus an override is right more often than a strict mapping. Cash is excluded by default because the mock said "cash and home equity aren't counted", and an emergency fund or a child's savings is not retirement money.
  Date/Author: 2026-10-09, agent.

- Decision: a PERS 3 investment account takes a typed yearly contribution, like every other account. The mock's "10% of salary" calculated field is dropped.
  Rationale: salary raises are not modeled, so 10% of a fixed salary is a fixed dollar amount anyway. One rule for every account keeps the table simple.
  Date/Author: 2026-10-09, agent.

- Decision: "cash saved per year" (from OtterMint, or the override) flows into a synthetic account called "New savings", of type brokerage. It is not added to any one OtterMint account.
  Rationale: the household's cash surplus lands in checking and is moved by hand. Tying it to one brokerage account would make that account's projected balance wrong.
  Date/Author: 2026-10-09, agent.

- Decision: the destination is unavailable on the household tab and shows "Household FIRE plans are not available yet." like Investments.
  Rationale: the plan already models the couple. Group-wide reads would need the partner's consent model, and the partner has no accounts.
  Date/Author: 2026-10-09, agent.

- Decision: the production migration and deploy are not part of "implement". The branch is merged to main, and `drizzle/0016_*.sql` is applied on the NAS only after the owner says go.
  Rationale: a production schema change is outward-facing and hard to reverse. `scripts/deploy.sh` never runs migrations, and deploying the code before the table exists would make the FIRE page fail to load or save, while every other page keeps working.
  Date/Author: 2026-10-09, agent.

- Decision: Milestone 5 ran the real app against a disposable Postgres, seeded with the mock's household through real accounts, transactions and a `PUT` of the mock's plan, instead of writing a route-fixture harness.
  Rationale: this exercises the migration, RLS, the Drizzle upsert of the JSON column, autosave and reload, as well as the layout. A fixture harness would have shown only the layout. The screenshots matched the mock number for number, so no committed harness is needed. Run it again with the steps under Concrete Steps.
  Date/Author: 2026-10-09, agent.

- Decision: "Cash saved per year" may be negative (bounds −100,000,000 to 100,000,000). A negative figure is withdrawn from open accounts while both partners work.
  Rationale: OtterMint's twelve-month figure is income minus spending, and a household that spends more than it earns should see that, not a silent zero.
  Date/Author: 2026-10-09, agent.

- Decision: the household-tab empty state is checked by reading `src/app/page.tsx`, not by a unit test.
  Rationale: `page.tsx` is a large client page with many fetches. The branch is two lines, the same shape as the Investments one.
  Date/Author: 2026-10-09, agent.

## Outcomes & Retrospective

As of 2026-10-09 the feature is complete on branch `fire-calculator`. With the mock's sample household seeded into a real database, the real app shows the mock's numbers exactly: headline "Jul 2033", "Lasts to 95 · $130k left", and the lever tiles Dec 2032, Mar 2033 and Dec 2034.

Checked end to end in the running app:
- Editing spending to $7,000 moves the headline to Dec 2032, the date the "Spend $500/mo less" tile predicted. The edit saves itself and survives a reload.
- A typed account is stored only in `fire_plans`; `manual_accounts` was untouched.
- `PUT` returns 400 for an invalid plan and 401 when signed out.
- The chart tooltip reads "Age 66 · 2058 / $748,989".
- With "Partner retires" set to 3 years, the chart shows two markers on separate label rows.

What remains is the production rollout: apply `drizzle/0016_famous_harpoon.sql` on the NAS, then deploy. The owner must also enter the household's real ages, the four accounts OtterMint cannot see, the 401(k) and 457(b) contributions, the PERS 3 service and salary, and the Social Security estimates; the plan starts with the defaults.

Lessons: checking against a real database in a browser caught three layout bugs that the jsdom tests could not see. The pure model made the "reproduce the mock's headline" test cheap, and that test is the strongest guard on the projection.

## Context and Orientation

OtterMint is a Next.js 16 app, using the App Router and React 19, written in TypeScript with Tailwind CSS 4. It is backed by PostgreSQL through the Drizzle ORM and runs on the owner's home NAS. The whole signed-in app is one client page, `src/app/page.tsx`. It keeps a `NavDestination` union and a `NAV_ITEMS` array (Dashboard, Accounts, Transactions, Investments, Analytics), each with a `lucide-react` icon. `renderContent()` picks the view component for the active destination. Views receive `refreshKey` (incremented when the user presses Refresh) and fetch their own data from `/api/...` route handlers. The household tab (`isHousehold`) shows an `EmptyState` for views that have no household version.

Route handlers live under `src/app/api/<name>/route.ts`. Every handler calls `getUserId()` from `src/lib/auth/get-user-id.ts`, which throws an auth error that `isAuthError` recognizes. It then runs its queries inside `withUser(userId, (tx) => ...)` from `src/lib/db/with-user.ts`. That helper opens a transaction and sets the Postgres variable `app.current_user_id`. Row-Level Security (RLS, Postgres policies that filter every query to the rows a role may see) keys on that variable through the function `app_current_user_id()`, so a query issued through `tx` only ever sees the signed-in user's rows. Errors go to `logServerError` from `src/lib/logging.ts`. `src/app/api/manual-accounts/route.ts` and `src/app/api/analytics/cashflow/route.ts` are good small examples.

The database schema is `src/lib/db/schema.ts`. RLS is not modeled there. It lives in hand-edited migrations under `drizzle/`, and the banner at the top of the schema file explains why `npm run db:push` must never be run. A new table is added by declaring it in `schema.ts`, generating a migration with `drizzle-kit generate`, and then appending the grants and policy by hand. `drizzle/0015_pale_black_bolt.sql` (table `category_memories`) is the most recent example: after the generated `CREATE TABLE` it grants `SELECT, INSERT, UPDATE, DELETE` to the role `app_user`, enables and forces row level security, and creates an `..._isolation` policy `USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id())`. The migration journal is `drizzle/meta/_journal.json`. Production migrations are applied by hand, as described in `docs/DEPLOYMENT.md` §5.5.

The Plaid-linked accounts are in table `accounts` (columns `account_id` text unique, `name`, `mask`, `type` such as `investment` or `depository`, `subtype` such as `brokerage` or `roth`, `current_balance`). Rows belong to a user through `plaid_items.user_id`. Hand-entered accounts are in `manual_accounts` (`id`, `name`, `type` `asset` or `liability`, free-text `subtype`, `balance`). In production on 2026-10-09 the owner has four investment accounts (two Chase "Self-Directed" brokerage accounts, a Schwab "Individual" brokerage, a Schwab "Roth Contributory IRA" with subtype `roth`) and one manual asset, "Vanguard 401K", with subtype "401K".

Cash flow comes from `src/lib/cashflow.ts`. `aggregateCashflow(rows, { months, today })` turns classified transaction rows into one `CashflowMonth` per calendar month. Each month carries `income`, `spending`, `savings` and `netCashFlow` as decimal strings, and `partial: true` for the current month only. The rows come from `selectClassifiedTransactionRows(tx, userId, since)` in `src/lib/db/classified-transactions.ts`, which applies descriptor enrichment, the category-correction rules and the owner's own category choices. `firstDataMonthIndex(months)` in `src/lib/analytics-model.ts` finds the first month with any data.

Shared UI primitives are exported from `src/components/ui/index.ts`: `Card`, `CardHeader`, `Button`, `EmptyState`, `Skeleton`, `SegmentedControl` and `cx`. Design tokens are CSS variables in `src/app/globals.css`, mapped to Tailwind classes:

- surfaces: `bg-canvas`, `bg-surface`, `bg-surface-raised`, `bg-surface-hover`, `bg-surface-active`;
- text: `text-ink`, `text-ink-secondary`, `text-ink-muted`;
- borders: `border-line`;
- accents: `text-accent` (mint `#34d399`), `text-negative` (`#f0836f`);
- type sizes: `text-hero`, `text-figure`, `text-title`, `text-caption`, `text-micro`;
- radii: `rounded-card` (16px), `rounded-tile`, `rounded-control`;
- fonts: `font-serif` (Instrument Serif, for titles), `font-mono` (tabular numbers).

Charts use Recharts 3. `src/components/dashboard/InvestmentChart.tsx` is the house pattern: one mint line with a 10% area, gridlines `var(--chart-grid)`, mono 11px ticks, `formatCompactCurrency` from `src/lib/format.ts` for axis labels, and a small date pill in the tooltip. The owner prefers charts that read at a glance: one line, a two-line tooltip, and caveats inside a collapsed "About …" details block, never on the plot.

Tests are Vitest with Testing Library and jsdom, under `src/__tests__/`. Run them with `npx vitest run --dir src`; the `--dir src` matters because stale repository copies under `.claude/worktrees/` would otherwise be picked up. Route tests mock `getUserId` and `withUser` with `vi.mock` (see `src/__tests__/cashflow-route.test.ts`). View tests mock `recharts` with pass-through components and stub `global.fetch` (see `src/__tests__/trends-view.test.tsx`). `src/__tests__/rls-isolation.test.ts` is a real-database suite that only runs when `RLS_TEST_DATABASE_URL` and `RLS_TEST_SUPERUSER_URL` are set. Type checking is `npx tsc --noEmit` and lint is `npm run lint`.

There is no standing local database. A disposable one works for migration and RLS checks:

    docker run -d --name fire-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ottermint -p 127.0.0.1:5433:5432 postgres:17
    DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/ottermint npx drizzle-kit migrate
    docker exec fire-pg psql -U postgres -d ottermint -c "ALTER ROLE app_user PASSWORD 'app'"

Signed-in pages can be seen locally without a database. The auth middleware (`src/middleware.ts`) only checks that a UUID-shaped `session_id` cookie exists, so a Playwright page function that sets the cookie and answers every `/api/**` request renders the real page. The pattern and its README are in `docs/design/analytics-redesign/harness/`.

Terms used below:
- **Month index**: the number of whole months from the current month. 0 is this month, 12 is the same month next year.
- **Open**: an account is open when money can come out of it without the IRS 10% early-withdrawal penalty.
- **Rule of 55**: a 401(k)-style employer plan opens at once for someone who leaves that job in or after the calendar year they turn 55; otherwise it opens at 59½.
- **Roth basis**: the total contributed to a Roth IRA, which can always come out penalty-free. Growth on it waits for 59½.
- **Real dollars**: today's dollars. Every figure in the model is real, so returns are after inflation.

## Plan of Work

### Milestone 1: design reference

Copy the approved board into `docs/design/fire-calculator/source/desktop.dc.html`. It is one fluid board that also works at phone width, so there is no separate phone board. Make the shared renderer `docs/design/analytics-redesign/render.mjs` skip `phone.dc.html` when that file does not exist; that is a one-line `fs.existsSync` guard. Then run it to produce `docs/design/fire-calculator/desktop.html`. Write `docs/design/fire-calculator/README.md` covering three things: the canvas link and approval date, how to re-render, and the list of intended deviations (filled in as decisions land; the first ones are the dropped "10% of salary" field, the "New savings" account, the account type selects and the per-account Roth basis split).

Acceptance: the render prints `leftover holes: 0`, and opening `desktop.html` in a browser shows the mock's default state with the "Jul 2033" headline.

### Milestone 2: the pure projection model

Create `src/lib/fire-model.ts` with no React or database imports. It ports the mock's `simulate`/`earliest` logic to typed TypeScript and generalizes it, as `Interfaces and Dependencies` specifies. The rules, in plain words:

The projection runs month by month in real dollars, from month index 0 to the month you reach the plan age. You retire at month index `yM`. Your partner retires at `pM = max(0, yM + round(partnerOffsetYears × 12))`. While a person works, each of their accounts receives `contributionYearly / 12` a month. While both work, the household's cash saving (`cashSavedYearly / 12`) goes into "New savings". Once at least one person has stopped, the month's spending is the retirement spending plus any spending changes your age has passed. While neither works, add half the health-insurance amount for each person under 65. Income that month is:

- the take-home pay of whoever still works (yours is OtterMint's take-home minus your partner's);
- the pension, from its start month;
- each Social Security benefit, from its claim month, adjusted for the claim age.

A surplus goes into "New savings". A shortfall, grossed up by the tax rate (`need / (1 − taxRate)`), is withdrawn from open accounts in a fixed order: cash, brokerage (New savings first), crypto, 457(b), PERS 3 investment account, 401(k), traditional IRA, then Roth IRAs (basis first). If open money runs short while locked money remains, record the first such month as the **gap** month and take the rest from locked accounts anyway, so the total line stays honest. If all money is gone, record the **out** month. Before the end of each month every balance grows by the monthly equivalent of its return: crypto at the crypto return; everything else at the before-retirement return until the first person retires, then at the after-retirement return; cash at 0. A retirement month works when there is no gap and no out month. The earliest retirement is the smallest `yM` between 0 and age 70 that works, found by binary search; working longer only ever adds money and shortens the bridge.

Opening rules by account type (owner = the account's person, retirement = that person's own retirement month):

- cash, brokerage and crypto: open at month 0;
- 457(b): open at the owner's retirement;
- 401(k) and PERS 3 investment account: open at the owner's retirement if they are 55 or older then, otherwise at 59½;
- traditional IRA: open at 59½;
- Roth IRA: open at 59½, with the basis available from month 0.

The PERS 3 pension follows the Department of Retirement Systems (DRS) rules researched on 2026-10-09 (drs.wa.gov PERS Plan 3 pages; RCW 41.40.790 and 41.40.820). Service at separation is the years so far plus the years until the pension owner retires.

- **Vesting.** The pension exists only with 10 or more years of service, or 5 or more if the owner is at least 45 when they leave.
- **Start age.** It is the later of the chosen start age, the owner's age on leaving and 55. With fewer than 10 years of service it is 65.
- **Benefit.** The yearly benefit is 1% × service × salary.
- **Early-start reduction.** With 30 or more years of service it is multiplied by `1 − 0.05 × (65 − start age)`. Otherwise, before 65, it is multiplied by the DRS early-retirement factor, linearly interpolated between the published points: 55 → .4092, 58 → .5280, 60 → .6292, 62 → .7538, 64 → .9085, 65 → 1.
- **Between leaving and the start.** With 20 or more years of service the benefit grows 0.25% a month compounded (about 3.04% a year), until the start age or 65, whichever comes first. With fewer than 20 years it does not grow. Either way, inflation erodes it in real terms over the whole wait, so divide by `(1 + inflation)^(years waited)`.
- **After it starts.** It is treated as keeping pace with inflation.

Social Security claimed at age A pays the entered at-67 amount times `ssFactor(A)`. Each month before 67 cuts it by 5/9 of 1% for the first 36 months and 5/12 of 1% after that; each month after 67 adds 2/3 of 1%, up to 70. So 62 → 0.70 and 70 → 1.24.

Also put in this file:
- `resolveParams(data, plan)`, which merges the API's OtterMint data with the saved plan into model parameters;
- `suggestKind(...)`, which suggests an account type;
- `summarizeCashflow(months)`, which computes the twelve-month take-home, spending and cash saved;
- `buildTimeline(params, sim)` for the timeline rows;
- `leverDates(params, base)` for the three "what moves the date" tiles;
- `monthLabel` and `ageText` formatting.

`src/__tests__/fire-model.test.ts` covers, with numbers small enough to check by hand:
- `ssFactor` at 62, 67 and 70;
- the pension's vesting, early factors, 20-year growth and real erosion;
- each opening rule;
- the gap and out detection;
- surplus going to New savings while one partner works;
- the binary search agreeing with a linear scan on a fixture;
- `suggestKind` on the production subtypes;
- `summarizeCashflow` skipping the partial month and the months before the first data;
- the mock's default sample reproducing the mock's headline, "Jul 2033".

Acceptance: `npx vitest run --dir src src/__tests__/fire-model.test.ts` passes.

### Milestone 3: storage and API

Add `firePlans` to `src/lib/db/schema.ts`: table `fire_plans`, `user_id uuid primary key references users(id) on delete cascade`, `plan jsonb not null`, `updated_at timestamptz not null default now()`. Generate the migration offline:

    DATABASE_URL=postgres://placeholder@127.0.0.1:1/x npx drizzle-kit generate

Then append to the generated `drizzle/0016_*.sql` the grant (`SELECT, INSERT, UPDATE, DELETE` to `app_user`; there is no sequence), `ENABLE` and `FORCE ROW LEVEL SECURITY`, and the policy `fire_plans_isolation`, exactly as in `0015`. Add `fire_plans` to both `allOwnedTables` and `strictlyPrivateTables` in `src/__tests__/rls-isolation.test.ts`, and seed one row for each test user there.

Create `src/lib/validate-fire-plan.ts` with `validateFirePlan(input: unknown)`, returning `{ success: true, plan }` or `{ success: false, error }`. It accepts only the `FirePlan` shape (version 1), checks every number against the bounds listed in `Interfaces`, and normalizes trimmed names. It caps the plan at 30 typed accounts and 200 app-account overrides, and drops unknown keys.

Create `src/app/api/fire/route.ts`:
- `GET` runs inside one `withUser` transaction and reads four things: classified transaction rows since the first day of the month twelve months back; the user's Plaid accounts of type `investment` or `depository` with their institution name; the user's manual accounts of type `asset`; and the user's `fire_plans` row. It returns `FireResponse`: `asOf` (today), `cashflow` (from `summarizeCashflow(aggregateCashflow(rows, { months: 13, today }))`), `accounts` (each with a stable `key`, `plaid:<account_id>` or `manual:<id>`, its display name, balance and `suggestedKind`), `plan` (or `null`) and `savedAt`.
- `PUT` validates the body and upserts the row (`onConflictDoUpdate` on `user_id`, setting `plan` and `updated_at`). It returns `{ plan, savedAt }`, with 400 and the validation error for a bad body.
- Both return 401 for auth errors and 500 with a logged error otherwise.

Tests: `src/__tests__/validate-fire-plan.test.ts` (bounds, unknown keys, too many accounts) and `src/__tests__/fire-route.test.ts` (GET shape from mocked rows, PUT happy path and 400, 401).

Real-database check: start the disposable Postgres above, run all migrations, and run the gated RLS suite:

    RLS_TEST_DATABASE_URL=postgres://app_user:app@127.0.0.1:5433/ottermint RLS_TEST_SUPERUSER_URL=postgres://postgres:postgres@127.0.0.1:5433/ottermint npx vitest run --dir src src/__tests__/rls-isolation.test.ts

Expect the new `fire_plans` cases to pass. Then remove the container.

### Milestone 4: the FIRE destination

Add `"fire"` to `NavDestination` and `{ id: "fire", label: "FIRE", icon: Flame }` to `NAV_ITEMS` in `src/app/page.tsx`. `renderContent()` renders `<FireView refreshKey={refreshKey} />`, or on the household tab an `EmptyState` reading "Household FIRE plans are not available yet."

Create the components under `src/components/fire/`:

- `FireView.tsx` (the container). It fetches `GET /api/fire` when `refreshKey` changes and keeps the editable plan in state. Inputs keep the raw strings the user typed, so a half-typed "-" or "" does not jump. A valid change updates the numeric plan and schedules a save: `PUT /api/fire` 800 ms after the last change, flushed on unmount. A small status reads "Saved", "Saving…" or "Couldn't save". If no plan has ever been saved, a one-line note says: "Start with your ages and the accounts OtterMint can't see. Nothing here changes your real accounts." The projection is computed with `useMemo` from `resolveParams`. The view renders the sections below in order: hero, tiles, timeline, accounts, assumptions, levers.
- `FireChart.tsx`. A Recharts `ComposedChart` with x = your age (fractional, one point per quarter-year), a mint `Line` plus a 10% `Area`, a `ReferenceLine` at each retirement age labelled "Retire · 41½" (or "You retire" and "Partner retires" when they differ), and a coral `ReferenceDot` with the label "Runs out at 78" when the money runs out. The tooltip has two lines: "Age 50 · 2041" and the value. The y-axis uses `formatCompactCurrency`.
- `FireTimeline.tsx`, `FireAccounts.tsx` and `FireAssumptions.tsx`. They render the timeline list, the accounts table and the grouped number fields, following the mock's copy and layout with the app's tokens. The accounts table puts OtterMint rows first: balance read-only, with type, owner and yearly contribution editable. Typed rows follow, with name, owner, type, balance and contribution editable plus a remove button, and an "Add an account" button at the end. The table scrolls horizontally inside its card on phones. Every control is at least 44 px tall on phones.

Tests: `src/__tests__/fire-view.test.tsx` covers:
- the loading skeleton, then the hero date for a fixture response;
- that changing "Monthly spending" changes the headline;
- that adding a typed account adds a row and moves the date;
- that the debounced `PUT` body contains the change (fake timers);
- the "not saved yet" note;
- the household empty state.

Acceptance: `npx tsc --noEmit`, `npm run lint` and `npx vitest run --dir src` all pass.

### Milestone 5: harness and production check

Write `docs/design/fire-calculator/harness/mock-fixtures.js`. It answers `/api/auth/me`, `/api/groups`, `/api/accounts`, `/api/manual-accounts` and `/api/fire` with the mock's sample household, plus a saved plan holding the four typed accounts. Swallow `PUT /api/fire`. Run `npm run dev`, apply the harness in a Playwright browser, open FIRE, and screenshot at 1440 × 1000 and 390 × 844. Compare with `docs/design/fire-calculator/desktop.html`: section order, the headline "Jul 2033", the timeline rows, the table rows, the assumption groups and the lever tiles should all match, with no horizontal page overflow at 390. Record the differences in the README under "Intended deviations", or fix them.

Production check, read-only: export the owner's last thirteen months of classified rows and the account lists over `ssh otterholt` psql, the way the analytics plans did. Run them through `aggregateCashflow`, `summarizeCashflow` and `suggestKind` in a temporary test file under `src/__tests__/tmp-*.test.ts` (delete it after), and record the take-home, spending and cash-saved figures and the suggested kinds in `Surprises & Discoveries`. Expect a monthly spending of about $8k, a take-home of about $15.9k, and the four investment accounts suggested as three brokerages and one Roth, the Vanguard 401K as a 401(k), and checking and savings as not counted. Delete the export afterwards.

### Milestone 6: merge

Commit each milestone. Fast-forward `origin/main` to the branch (`git push origin fire-calculator:main`); this repository does not use pull requests. Then fast-forward the local main. Stop there and report. Production needs two steps, in this order, once the owner says go: apply `drizzle/0016_*.sql` by hand as in `docs/DEPLOYMENT.md` §5.5, then run `scripts/deploy.sh`.

## Concrete Steps

All commands run from the repository root, `/Users/justin/code/personal/OtterMint`, on branch `fire-calculator`.

    node docs/design/analytics-redesign/render.mjs docs/design/fire-calculator
    npx vitest run --dir src src/__tests__/fire-model.test.ts
    DATABASE_URL=postgres://placeholder@127.0.0.1:1/x npx drizzle-kit generate
    npx tsc --noEmit 2>&1 | grep -v worktrees
    npm run lint
    npx vitest run --dir src

The end-to-end check (Milestone 5) used a disposable database and a dev server on port 3100, with a gitignored `.env.local` holding `DATABASE_URL=postgres://app_user:app@127.0.0.1:5433/ottermint`, a random 64-character hex `ENCRYPTION_KEY`, `PLAID_ENV=sandbox` and placeholder Plaid keys. The steps:

1. Register a synthetic user through `POST /api/auth/register`.
2. As the superuser, seed one Plaid item with brokerage, Roth and checking accounts, a "Vanguard 401K" manual asset, and twelve months of $15,000 income and $7,500 spending.
3. `PUT` the mock's plan.
4. Sign in from Playwright at `http://localhost:3100` and open FIRE.

Remove `.env.local` and the container afterwards.

    $ npx vitest run --dir src
     Test Files  65 passed | 2 skipped (67)
          Tests  709 passed | 49 skipped (758)
    $ RLS_TEST_DATABASE_URL=… RLS_TEST_SUPERUSER_URL=… npx vitest run --dir src src/__tests__/rls-isolation.test.ts
          Tests  48 passed (48)
    $ curl -s -b cookies.txt http://127.0.0.1:3100/api/fire
    {"asOf":"2026-10-10","cashflow":{"takeHomeMonthly":15000,"spendingMonthly":7500,"cashSavedYearly":90000,"monthsCounted":12,…},"accounts":[… "suggestedKind":"brokerage" …],"plan":null,"savedAt":null}

## Validation and Acceptance

The work is accepted when all of the following hold:
- The full test suite passes.
- The gated RLS suite passes against a freshly migrated disposable database, including `fire_plans: A sees only A's rows` and `fire_plans: fail-closed`.
- The harness screenshots match the mock as listed in Milestone 5.
- In the running app, these behaviors can be seen:
  - FIRE appears in the sidebar and the phone navigation, and shows a headline month.
  - Lowering "Monthly spending" by $500 moves the headline earlier by the amount the first lever tile predicted.
  - Dragging "Try retiring at" below the headline age shows a coral "Short at …" or "Runs out at …" status.
  - After an edit and a reload, the edit is still there.
  - The Dashboard's net worth is unchanged by anything typed on the FIRE page.

## Idempotence and Recovery

The model, the API and the UI are additive; removing the FIRE nav item hides the feature. The migration only creates a table. To undo it in a disposable database, drop the container. In production the rollback is `DROP TABLE fire_plans;` plus deleting its journal row, and no other table refers to it. Re-running `drizzle-kit generate` with no schema change creates nothing. If generation produced an unwanted file, delete it, along with its journal entry and snapshot, before re-running. The temporary production export and the temporary test file must be deleted after Milestone 5.

## Artifacts and Notes

The browser check, on the real app with a real database, at 1440 wide:

    {"login":200,"headline":"Jul 2033","status":"Lasts to 95 · $130k left","overflow":0}
    after editing spending to 7000: headline "Dec 2032"; after reload: headline "Dec 2032", field "7000"
    tooltip: "Age 66 · 2058\n$748,989"
    partner retires 3 years later: "Mar 2032", "In 5 years 5 months · you 40 · partner stops Mar 2035 at 42"

At 390 wide, after the fixes, the horizontal overflow is 0 and every input box is 44 px tall.

## Interfaces and Dependencies

No new dependencies: `recharts`, `lucide-react` (`Flame` icon), `drizzle-orm` (`jsonb` column type) are already installed.

In `src/lib/fire-model.ts`:

    export type FireOwner = "you" | "partner";
    export type FireKind = "cash" | "brokerage" | "crypto" | "k457" | "pers3" | "k401" | "ira" | "roth";
    export type FireAccountKind = FireKind | "excluded";

    export interface FireAssumptions {
      yourAge: number; partnerAge: number; planAge: number;           // years
      partnerOffsetYears: number;                                    // partner retires this many years after you (negative = before)
      partnerTakeHomeMonthly: number | null;                         // null = half of OtterMint's take-home
      spendingMonthly: number | null;                                // null = OtterMint's last-12-month average
      cashSavedYearly: number | null;                                // null = OtterMint's last-12-month figure
      healthMonthly: number; taxRatePct: number;
      change1Age: number; change1Monthly: number; change2Age: number; change2Monthly: number;
      returnBeforePct: number; returnAfterPct: number; returnCryptoPct: number; inflationPct: number;
      pensionOwner: FireOwner | "none"; pensionSalaryYearly: number; pensionServiceYears: number; pensionStartAge: number;
      ssYouMonthly: number; ssYouClaimAge: number; ssPartnerMonthly: number; ssPartnerClaimAge: number;
      rothBasisYou: number; rothBasisPartner: number;
    }
    export interface FireAppAccountChoice { kind?: FireAccountKind; owner?: FireOwner; contributionYearly?: number }
    export interface FireTypedAccount { id: string; name: string; owner: FireOwner; kind: FireKind; balance: number; contributionYearly: number }
    export interface FirePlan {
      version: 1;
      assumptions: FireAssumptions;
      appAccounts: Record<string, FireAppAccountChoice>;   // key: "plaid:<account_id>" | "manual:<id>"
      typedAccounts: FireTypedAccount[];
    }
    export const DEFAULT_ASSUMPTIONS: FireAssumptions;
    export function defaultPlan(): FirePlan;

    export interface FireCashflowSummary { takeHomeMonthly: number; spendingMonthly: number; cashSavedYearly: number; monthsCounted: number; firstMonth: string | null; lastMonth: string | null }
    export interface FireAppAccount { key: string; name: string; detail: string; source: "plaid" | "manual"; balance: number; suggestedKind: FireAccountKind }
    export interface FireResponse { asOf: string; cashflow: FireCashflowSummary; accounts: FireAppAccount[]; plan: FirePlan | null; savedAt: string | null }

    export function summarizeCashflow(months: CashflowMonth[]): FireCashflowSummary;
    export function suggestKind(source: "plaid" | "manual", type: string, subtype: string | null, name: string): FireAccountKind;
    export function ssFactor(claimAge: number): number;
    export function pensionFor(params: FireParams, ownerRetireM: number): { monthly: number; startM: number; startAge: number | null; service: number };

    export interface FireModelAccount { key: string; label: string; owner: FireOwner; kind: FireKind; balance: number; contributionYearly: number; rothBasis: number; isNewSavings?: boolean }
    export interface FireParams { /* the resolved, numeric inputs: assumptions as fractions, take-home split, spending, cash saved, accounts, asOf month */ }
    export function resolveParams(data: FireResponse, plan: FirePlan): FireParams;

    export interface FireSimulation { path: number[]; horizon: number; yM: number; pM: number; gapM: number | null; outM: number | null; low: number | null; lowM: number | null; accounts: (FireModelAccount & { openM: number; history: number[]; basisHistory: number[] })[]; pension: ReturnType<typeof pensionFor>; ssYouM: number; ssYou: number; ssPartnerM: number; ssPartner: number; ok: boolean }
    export function simulate(params: FireParams, yourRetireM: number): FireSimulation;
    export function earliestRetirement(params: FireParams): number | null;   // month index, or null when not by 70

The validation bounds in `src/lib/validate-fire-plan.ts`:
- ages: 18 to 100, with the plan age between 50 and 110 and above your age;
- partner offset: −30 to 30 years;
- monthly money: 0 to 1,000,000, except spending changes, which may be −1,000,000 to 1,000,000;
- yearly money and balances: 0 to 100,000,000, except cash saved per year, which may be −100,000,000 to 100,000,000;
- tax: 0% to 60%; returns: −10% to 20%; inflation: 0% to 15%;
- pension service: 0 to 60 years; pension start age: 55 to 65; Social Security claim ages: 62 to 70;
- typed accounts: at most 30, each id matching `^[a-z0-9-]{1,40}$` and each name 1 to 200 characters;
- app-account keys: at most 200, each matching `^(plaid|manual):[A-Za-z0-9_-]{1,200}$`.

---

Revision note (2026-10-09): Progress, Surprises & Discoveries, Decision Log, Outcomes, Concrete Steps and Artifacts were updated after Milestones 1–5. The fixture harness in Milestone 5 was replaced by a real-database run (Decision Log). The validation bounds now allow a negative cash saving.
