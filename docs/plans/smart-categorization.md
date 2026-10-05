# Categorize transactions in the app and remember the choice for similar ones

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. It is maintained in accordance with `docs/PLANS.md` at the repository root. It builds on two checked-in plans, `docs/plans/category-correction-rules.md` and `docs/plans/descriptor-enrichment.md`; both are incorporated by reference, and everything needed to do this work is restated below.


## Purpose / Big Picture

OtterMint shows where money went by category, and the categories come from Plaid (the bank-data service the app syncs from). The owner cannot change them. Of the owner's 2,226 transactions, 475 have no category, all of them from the bank-statement backfill that covers January 2025 to early May 2026, so "Uncategorized" is one of the largest rows in the category charts ($57,146 of purchases). Some are also miscounted: 29 uncategorized deposits totalling $9,555, among them 14 credit-card payments worth $8,172, are treated as negative spending because they carry the placeholder category `UNCATEGORIZED`. And when Plaid picks a wrong category, the only fix today is a code change and a deploy (`src/lib/category-rules.ts`).

After this work the owner can set the category of any transaction from inside the app, and the app remembers. Choosing a category opens a picker that says, for example, "Also apply to 14 similar transactions and future ones", ticked by default. Leaving it ticked stores a memory for that merchant, so every past and future transaction from it takes the category; unticking changes only that one transaction. The picker offers the categories already in use plus "New category", where the owner names a category and says whether it is income, spending or savings.

Three places lead to the picker. A new "Needs a category" card on the Analytics tab lists uncategorized transactions grouped by merchant, largest total first. On the owner's data the ten largest groups hold about half of the uncategorized dollars; the rest is some 230 one-off merchants, which the card lists for as long as the owner cares to go on. The category shown on each row of the Dashboard's details panel and of the Recent Transactions feed becomes a button. And a new Settings page, "Memorized categories", lists what the app has remembered and lets the owner remove an entry.

To see it working: sign in, open Analytics, find "Needs a category", click the first merchant, pick a category and save. The merchant leaves the card, the "Uncategorized" row in Category trends shrinks by that merchant's total, and the chosen category grows by the same amount. After the next Plaid sync the choice is still there.


## Progress

- [x] (2026-10-04 02:46Z) Read the two earlier plans, the read path, the schema, the migration and deploy procedure, the Analytics and Dashboard components and the test idioms. Asked the owner four scope questions (answers in the Decision Log). Wrote this plan.
- [x] (2026-10-04) Load-bearing review: thirteen assumptions listed; eight settled by reading the code and folded into the plan; five checked against production (read-only). Two were false (transaction ids are not URL-safe; one matching rule does not group person-to-person payments by payee) and the plan changed for both.
- [x] (2026-10-04) Milestone 0 (prototype), done as part of the review: the owner's 2,226 rows were grouped under the matching rule with caps of three, four and five words; cap four chosen; results in Surprises & Discoveries.
- [x] (2026-10-04) Milestone 1: `src/lib/category-memory.ts` and created-category flows in `src/lib/cashflow.ts`; `category-memory.test.ts` and the new `cashflow.test.ts` cases pass.
- [x] (2026-10-04) Milestone 2: migration `drizzle/0015_pale_black_bolt.sql` (generated offline, grants and policy appended by hand); the read helper (`loadClassifiedTransactions`) and both display routes apply the owner's choices; route mocks updated; the payroll-memory and own-choice route tests pass. All sixteen migrations applied cleanly to a disposable local PostgreSQL 17, and the real-database RLS suite (four new cases) passes 45/45.
- [x] (2026-10-04) Milestone 3: the six routes and `category-routes.test.ts` (16 cases).
- [x] (2026-10-04) Milestone 4: picker, queue card, inline buttons, settings page, avatar link; `category-picker.test.tsx`, `needs-category-card.test.tsx`, and one new case each in the two view suites.
- [x] (2026-10-05 00:30Z) Milestone 5, local: the real app against the disposable database with a synthetic owner, driven with Playwright at 1440 and 390 wide (evidence in Artifacts and Notes); a gated real-database test runs the real sync upserts; the real-row check on the production export; full gate green after rebasing onto main's period picker (665 passed, 46 skipped without a database; 46/46 real-database; tsc, lint and build clean).
- [x] (2026-10-05 00:40Z) Milestone 5, production: migration rehearsed in a rolled-back transaction as `app_user`, then applied (journal row 16, `1245a391d99f`, 1791159472147).
- [ ] Milestone 5, remaining: merge to main, deploy, verify the live app; the owner categorizes one real group.


## Surprises & Discoveries

Seeded from research; add implementation findings below.

- Observation: a row whose category is the literal `UNCATEGORIZED` is always counted as spending, whatever its sign, so an uncategorized inflow lowers spending instead of raising income.
  Evidence: `primaryOf` in `src/lib/cashflow.ts` returns `txn.category` when it is set, so rule 8 of `classifyTransaction` (no category: outflows are spending, inflows are income) never fires for the placeholder and the row falls to rule 9, "everything else is spending". Read from the code on 2026-10-03, not yet measured on production rows; Milestone 0 measures it.

- Observation: Plaid sync does not touch columns it does not name, so a per-transaction choice stored in new columns of `transactions` survives every sync.
  Evidence: both `onConflictDoUpdate` blocks in `src/lib/sync-transactions.ts` set only `amount`, `date`, `name`, `merchantName`, `category`, `categoryDetailed` and `pending`.

- Observation: the three analytics route tests mock the database handle as one chain, `select().from().innerJoin().innerJoin().where()`. A second query in the shared read helper (loading memories) has the shape `select().from().where()` and will fail against that mock until `from` also returns a `where`.
  Evidence: `src/__tests__/cashflow-items-route.test.ts` lines 17 to 28; the same shape is in `cashflow-route.test.ts` and `recurring-route.test.ts`.

- Observation (production, 2026-10-04, read-only export of all 2,226 rows run through the real `merchantTokens`, `enrichDescriptors`, `applyCategoryRules` and `isUncategorized`): 403 rows have a Plaid merchant name (141 distinct keys); 175 Plaid-era rows and 1,648 backfilled rows have none, and enrichment joins 673 of those. After enrichment and the code rules, 475 non-pending rows are uncategorized, every one backfilled and carrying the literal `UNCATEGORIZED` (411 on credit cards, 64 on checking): 446 outflows totalling $57,146.10 and 29 inflows totalling $9,555.25, of which 14 "BA ELECTRONIC PAYMENT" card payments are $8,171.51. Six rows are pending.
  Evidence: with a four-word cap the 475 rows form 292 groups, 238 of them single transactions, mostly real one-off merchants from trips. The ten largest groups cover 27% of the rows and 50 to 57% of the dollars: venmo payment web 22, netflix 15, hlu huluplus hulu bill 14, monkey grind seattle 14, ba electronic payment 14, nyct paygo new york 13, alaska air seattle 13, wave internet tel 9, the euphoria projectseattle 9, cinemark plano 7. The earlier figure of 217 came from a thirteen-month window.

- Observation: the matching rule groups card merchants, payroll, card payments and own-account transfers by real payee at every cap, and does not for person-to-person payments.
  Evidence: payroll sources are one group each (Structured Light 47 rows, King County 46, Glowforge 37) and "online transfer from chk" and "to chk" stay apart (22 each). With three words, "zelle payment from" merges 23 rows from 11 senders; with five, Structured Light payroll splits 36 and 11 because a reference code leaves a stray letter; four words separates Zelle by the counterparty's first word and keeps payroll whole. At every cap "venmo payment web" (22 rows, $1,872) merges all counterparties because the descriptor carries only a number, a memory keyed `venmo` saved from a Plaid row would also sweep in 8 "Venmo Cashout" deposits, `check` reaches "CHECK OR SUPPLY ORDER", and Zelle payments to a phone number merge under the reference prefix.

- Observation: a memory does not always cross from the backfilled era to the Plaid era for the same merchant, because the bank's descriptor and Plaid's merchant name do not always share leading words.
  Evidence: seventeen pairs, for example Plaid "Monkey Grind Espresso" (2 rows) and descriptor "monkey grind seattle" (14), "Alaska Airlines" (2) and "alaska air seattle" (13), "PayByPhone" (10) and "sdot paybyphone parking" (9), "Xfinity" (6) and "comcast xfinity cable svcs" (2). Also, a memory keyed `uber` reaches the 13 backfilled "UBER EATS" descriptors as well as Uber's own, until a memory keyed `uber eats` exists (the longer key wins). And 15 "Subscription Acorns <code> Web ID" rows are single-row groups at every cap because the reference code is the third word.

- Observation: 1,648 of the 2,226 `transaction_id` values contain a colon (`backfill:2025-v1:<64 hex>`), so they change under URL encoding; the numeric `id` is unique and plain.
  Evidence: `select count(*) filter (where transaction_id ~ '^[A-Za-z0-9._-]+$')` gives 578 of 2,226.

- Observation: the backfill was written by inserts that skip existing rows, not by delete and re-insert (later confirmed in the scripts; see the Decision Log).
  Evidence: the `2026-v1` batch has two `created_at` stamps 35 seconds apart, and the 18 rows from the first run kept their stamp and ids through the second; the `2025-v1` batch is one stamp and one contiguous id block (7703 to 9024).

- Observation: production has what the migration pattern assumes.
  Evidence: role `app_user` exists without superuser or bypass; `app_current_user_id()` exists; `transactions` grants select, insert, update and delete to `app_user` and has the policy `transactions_isolation` for all commands with row-level security enabled and forced; the migration journal's latest row is `0014_rich_big_bertha` (15 rows), so the next is `0015`.

- Observation: backfilled payroll carries both `INCOME_SALARY` and `INCOME_WAGES`; both have the primary `INCOME`, which is what `classifyTransaction` reads, so both count as income.

- Observation (implementation): the negative-spending bug distorts comparisons as well as totals. With uncategorized payroll in the prior period, the Dashboard showed "Spending +136% vs prior 6 mo" against a negative prior total; after one memory the prior period's spending became a real $3,966.81 and the comparison +374%. On the synthetic owner, one save moved 2026 income from $45,980 to $78,140 and year-to-date spending from −$16,129 to $16,031.

- Observation (implementation): the views animate in with `transform: translateY(0)` held by `animation-fill-mode: both`, which makes every fixed-position descendant position relative to the view instead of the window. The picker is therefore portaled to `<body>`.
  Evidence: `.animate-fade-in` in `src/app/globals.css`.

- Observation (implementation): `buttonClassName` carries `inline-flex`, which beats an appended `hidden` (the design-system note about unmerged classes, in practice). The queue row's decorative pill is wrapped in a `hidden sm:block` span instead.

- Observation (production export, real-row check): with eight memories a person would make from the largest groups (Venmo skipped as a channel), 99 of the 475 uncategorized rows take a category; uncategorized purchases fall from $57,146.10 to $51,976.45 and uncategorized inflows from $9,555.25 to $608.14; no row outside a memorized group changes. 85 rows move within spending and 14 card payments move from spending to internal, so total spending rises in months with a "BA ELECTRONIC PAYMENT" (January 2026 by $2,000): those payments had been subtracting from spending.

- Observation (implementation): a memory's "similar" count includes Plaid-era rows that already carry the same category (the synthetic payroll group showed "44 similar", 33 backfilled and 11 Plaid-era). The count is accurate about reach; it is not a count of rows that will change.


## Decision Log

- Decision: Any transaction can be categorized, not only uncategorized ones.
  Rationale: the mechanism is the same, and it lets future corrections of Plaid's mistakes happen in the app rather than in code.
  Date/Author: 2026-10-03, Justin.

- Decision: The picker asks before memorizing: a checkbox "Also apply to N similar transactions and future ones", ticked by default.
  Rationale: one odd purchase at a merchant should not silently recategorize the rest, and the count shows the reach of a choice before it is made.
  Date/Author: 2026-10-03, Justin.

- Decision: Categorizing happens in a review queue on the Analytics tab and inline on the details panel and the Recent Transactions feed.
  Date/Author: 2026-10-03, Justin.

- Decision: The picker offers Plaid's categories and categories the owner creates, each created category declared as income, spending or savings.
  Date/Author: 2026-10-03, Justin.

- Decision: The owner's choices are stored in the database and applied at read time, after the existing descriptor enrichment and code rules. Plaid's own `category` and `category_detailed` columns are never rewritten.
  Rationale: choices made in the app cannot live in code, and sync rewrites Plaid's columns on every refresh. Applying at read time keeps the one choke point the earlier plans built, makes a choice retroactive at once, and makes removing it a clean undo. Order of precedence, last word first: the owner's choice for one transaction, then a memory, then the code rules in `src/lib/category-rules.ts`, then enrichment, then Plaid.
  Date/Author: 2026-10-03, Claude.

- Decision: Two storage shapes. A memory is a row in a new table `category_memories` (user, match key, category pair). A single-transaction choice is two new nullable columns on `transactions`, `user_category` and `user_category_detailed`.
  Rationale: a memory must outlive and precede the transactions it applies to, so it needs its own table. A single choice belongs to exactly one transaction, sync leaves unnamed columns alone, and columns avoid a join and a second table with its own security policy.
  Date/Author: 2026-10-03, Claude.

- Decision: "Similar" means matching the same memory key, and matching reads only the columns stored in the database, never the merchant name that descriptor enrichment adds at read time. Words come from `merchantTokens` in `src/lib/merchant.ts`. A row whose stored `merchant_name` is set has the key of that name and matches a memory only on an exactly equal key, of any length. A row with no stored merchant name matches the memory whose key equals the longest leading run of its descriptor's words, from five words down to one, and never on a key with fewer than four letters. When a memory is saved from a row with no stored merchant name, its key is the key of the Plaid merchant that enrichment joins the row to, when there is one (that key is by construction a leading run of the descriptor's words), and otherwise the descriptor's first four words (see the next decision).
  Rationale: the word rules are the ones descriptor enrichment already verified on production rows, so "Trader Joe's" and "TRADER JOE S #273 00SEATTLE WA" agree. Matching on stored columns only makes a row's answer independent of which other rows were loaded: the first draft matched on the enriched row, and the load-bearing review showed two failures of that, a memory silently ceasing to apply once a new Plaid merchant made enrichment rename old rows, and the feed and share-link routes (which do not run enrichment) disagreeing with analytics. The four-letter floor guards prefix matches only; applied to exact matches it would have made merchants such as CVS, REI and H&M impossible to memorize.
  Date/Author: 2026-10-03, Claude; revised 2026-10-04 after the load-bearing review.

- Decision: An unjoined descriptor's key to save is its first four words; matching still tries leading runs from five words down, because a Plaid merchant's key (which is saved whole) can have up to five.
  Rationale: measured on the owner's rows (Surprises & Discoveries): three words merges every Zelle counterparty, five splits one payroll source and shatters ATM and Zelle rows, four is the best of the three.
  Date/Author: 2026-10-04, Claude (load-bearing review, production data).

- Decision: The "apply to similar" box starts unticked when the key to save begins with `venmo`, `zelle`, `paypal` or `check`, or contains the word `atm`; it starts ticked otherwise. Under the box the picker lists up to three of the similar transactions (date, descriptor, amount) so the reach of a memory is visible before saving.
  Rationale: for payment apps, checks and cash the descriptor names the channel, not the payee, so similar-looking rows are different people; the production check showed exactly these merging. Everything else grouped by real payee. The owner chose a default of ticked; this narrows it only where the data showed it would be wrong, and the owner can still tick the box.
  Date/Author: 2026-10-04, Claude (load-bearing review, production data). The owner may overrule.

- Decision: The routes that act on one transaction are keyed on the numeric `transactions.id`, and line items carry `id`.
  Rationale: backfilled `transaction_id` values contain colons, which change under URL encoding; `id` is unique, already returned by `/api/transactions`, and row-level security still confines it to the owner.
  Date/Author: 2026-10-04, Claude (load-bearing review, production data).

- Decision: Accepted limits of the matching rule for this version: a memory may not cross between the backfilled era and the Plaid era when the bank's descriptor and Plaid's name start differently (seventeen known pairs); a one-word memory reaches backfilled descriptors that merely start with that word until a longer memory exists; and descriptors with a reference code among their first four words stay single-row groups.
  Rationale: each is visible in the picker's count and sample list before saving, each is fixed by one more choice, and none miscounts money silently. A smarter matcher (aliases between a descriptor key and a merchant key, or stripping reference codes) is a possible follow-up once the owner has used this on real rows.
  Date/Author: 2026-10-04, Claude (load-bearing review, production data).

- Decision: Single-transaction choices stay as columns on `transactions`; the statement backfill does not threaten them.
  Rationale: the backfill was a one-time batch whose scripts live outside this repository in `~/code/personal/bank_statements/backfill` and `backfill-2025`. Read on 2026-10-04: both `apply-transactions.sql` files insert with `ON CONFLICT (transaction_id) DO NOTHING` inside one database transaction, so a rerun leaves existing rows, and any choices on them, untouched. Only the deliberate `undo-transactions.sql` deletes the batch's rows, and removing the transactions removes their choices by intent. Memories are unaffected either way. One side effect to know: the apply scripts guard on a hash of every non-batch row, so after migration `0015` adds columns a rerun would stop with a mismatch rather than write anything.
  Date/Author: 2026-10-04, Claude (load-bearing review; verified in the scripts).

- Decision: The category button is disabled on pending transactions; memories still apply to them.
  Rationale: when a pending transaction posts, Plaid removes it and adds the posted one under a new id, and `src/lib/sync-transactions.ts` deletes removed rows, so a choice stored on a pending row would vanish within days. A memory is keyed on the merchant and carries over.
  Date/Author: 2026-10-04, Claude (load-bearing review).

- Decision: The Recent Transactions feed's API returns `categoryDetailed` as well, and the feed labels rows with `labelForCategoryKey` on the category key, replacing its private label table.
  Rationale: the feed showed only the primary category, so a created category would read "custom spending" and a change within one primary would be invisible.
  Date/Author: 2026-10-04, Claude (load-bearing review).

- Decision: Before the migration is applied for real, it is rehearsed in production inside a database transaction that is rolled back, exercising the new table and columns as the application's database role.
  Rationale: there is no local database and the gated real-database test suite is skipped here, yet the memories query sits in the read every analytics view depends on; a wrong grant or policy would otherwise first show as errors on every page after deploy.
  Date/Author: 2026-10-04, Claude (load-bearing review).

- Decision: A memory ignores the direction of the money; a refund takes its merchant's category.
  Rationale: a refund nets against the same spending category, which is what a reader expects. The owner can still set one transaction on its own. Revisit only if Milestone 0 shows a key that mixes unrelated inflows and outflows (a payment app, for example).
  Date/Author: 2026-10-03, Claude.

- Decision: A created category is encoded in the category strings themselves and has no table. Its primary is `CUSTOM_INCOME`, `CUSTOM_SPENDING` or `CUSTOM_SAVINGS`, and its detailed key is that primary, an underscore, and the name in upper case with spaces as underscores ("Kids activities" as spending is `CUSTOM_SPENDING_KIDS_ACTIVITIES`). Names are 1 to 30 letters, digits and spaces. A created category exists for as long as a memory or a transaction uses it.
  Rationale: every chart, list and route already carries category keys as strings and labels them with `labelForCategoryKey`, which strips a known primary and title-cases the rest, so created categories flow through with three new primaries and one classifier rule and no label plumbing. The cost is that a name is shown title-cased ("Hoa Dues", not "HOA dues") and that renaming means rewriting stored keys; both are accepted for a first version. If exact names matter later, add a `custom_categories` table holding the label and send labels with the API responses.
  Date/Author: 2026-10-03, Claude.

- Decision: The picker's list is the category pairs present in the owner's transactions plus a short fixed list of pairs that change how money is counted. There is no checked-in copy of Plaid's full taxonomy.
  Rationale: Plaid's real values have diverged from its documented list five times in this repository, so the data is the better source. The fixed list covers the choices that matter for the income, spending and savings totals even when no row carries them yet. Anything else can be created.
  Date/Author: 2026-10-03, Claude.

- Decision: Saving with the checkbox ticked writes the memory and clears that transaction's own choice; saving with it unticked writes only the transaction's own choice. Removing a memory is done on the Settings page. "Reset to original" in the picker clears the transaction's own choice.
  Rationale: one save, one stored fact, so there is never a stale single choice shadowing a memory the owner just made.
  Date/Author: 2026-10-03, Claude.

- Decision: A save with "apply to similar" writes into the memory that already decides the row when there is one (`memoryKeyForRow`), and only otherwise into the row's own key.
  Rationale: if a longer memory already decides a row, a new shorter memory would lose to it and the save would visibly do nothing to the row the owner clicked.
  Date/Author: 2026-10-04, Claude (implementation).

- Decision: The uncategorized route reports money out and money in separately (`outflow`, `inflow`), and the card's caption shows both.
  Rationale: the production groups mix purchases with deposits and card payments; one signed total would hide both.
  Date/Author: 2026-10-04, Claude (implementation).

- Decision: In the queue, the whole row is the button; the "Categorize" pill is decoration shown from `sm` up.
  Rationale: at 390 wide a separate button left about 140px for the merchant name; the row as the control keeps a 62px tap target and roughly doubles the visible label.
  Date/Author: 2026-10-05, Claude (Playwright check at 390 wide).

- Decision: Local acceptance ran the real app against a disposable PostgreSQL 17 container (all migrations, the `app_user` role, a synthetic owner registered through the real API) rather than the database-free harness, and "survives a Plaid sync" is proven by a gated real-database test that runs the real `syncTransactions` with Plaid's API mocked.
  Rationale: Docker was available, which tests the migration, RLS, writes and reads end to end; the Refresh button needs live Plaid credentials the development machine does not have.
  Date/Author: 2026-10-04, Claude.


## Outcomes & Retrospective

(2026-10-05, before deploy) The owner can now categorize any transaction in the app, from the Analytics tab's "Needs a category" queue, the Dashboard's detail rows or the Recent Transactions feed, and the app remembers the choice for the merchant's past and future transactions unless the box is unticked. Created categories declare their flow and count in the right total. Every choice is read-time, so Plaid sync never touches it and removing a memory restores exactly what was there. On the owner's real rows, eight choices clear a fifth of the uncategorized transactions and nearly all of the deposits that were being counted as negative spending.

Storage is one additive migration (two nullable columns and one RLS-guarded table), rehearsed and applied in production before the code. The load-bearing review paid for itself before any code existed: it replaced an enrichment-dependent matcher that would have silently dropped memories, and it caught the colon-bearing transaction ids that would have broken the routes. Running the real app against a disposable database caught what unit tests could not: the transform that would have trapped the dialog, the phone layout, and the sign of the sample amounts.

What remains: the deploy and the owner's first real save. The accepted limits of the matching rule stand (era split for seventeen merchants, one-word memories reaching wider until a longer one exists, reference codes in the first four words).


## Context and Orientation

OtterMint is a Next.js (App Router) personal-finance app with one real user, the owner, whose login is `kchoosun@gmail.com`. Data is in Postgres through drizzle-orm (`src/lib/db/schema.ts`; migrations in `drizzle/`). The development machine has no database: all development is test-driven with Vitest, pages are checked visually with a database-free browser harness, and production data lives in the `ottermint-db-1` container on a home server reachable as `ssh otterholt` on the home network or `ssh otterholt-ts` over Tailscale.

Terms used here. A "descriptor" is the bank's raw text for a transaction, stored in `transactions.name`. A "Plaid merchant" is the clean name in `transactions.merchant_name`, present on rows synced from Plaid (since about mid-April 2026) and absent on rows backfilled from statements. A "category pair" is `category` (Plaid's primary, such as `FOOD_AND_DRINK`) and `category_detailed` (such as `FOOD_AND_DRINK_GROCERIES`). A "category key" is `categoryDetailed ?? category ?? "UNCATEGORIZED"`, the string the charts group by. A row is "uncategorized" when its detailed category is null and its primary is null or the literal `UNCATEGORIZED` (`isUncategorized` in `src/lib/descriptor-enrichment.ts`). A "flow" is one of income, spending, savings or internal, decided by `classifyTransaction` in `src/lib/cashflow.ts` from the category pair, the sign of the amount (Plaid's convention: positive means money left the account) and the account type. A "memory" is the new stored fact "transactions with this match key get this category pair". Row-level security (RLS) is the Postgres feature that limits each query to the signed-in user's rows; `withUser(userId, fn)` in `src/lib/db/with-user.ts` opens a database transaction with the user set, and every table has a policy keyed on it.

How categories reach the screen today. `selectClassifiedTransactionRows(tx, userId, since)` in `src/lib/db/classified-transactions.ts` is the one read every analytics route uses (`src/app/api/analytics/cashflow/route.ts`, `.../cashflow/items/route.ts`, `.../recurring/route.ts`). It selects the user's transactions joined to their accounts, then returns `enrichDescriptors(rows).map(applyCategoryRules)`. `enrichDescriptors` (`src/lib/descriptor-enrichment.ts`) gives a descriptor-only row the Plaid merchant whose words are a prefix of the descriptor's words, and that merchant's usual category when the row has none. `applyCategoryRules` (`src/lib/category-rules.ts`) rewrites the pair for rows whose descriptor matches one of two hand-written patterns. Two more routes read transactions for display and call only `applyCategoryRules`: `src/app/api/transactions/route.ts` (the latest 50 rows for the Recent Transactions feed) and `src/app/api/shared/[token]/route.ts` (the latest 200 for a share link, read inside `withUser(ownerId, ...)`).

Where categories are shown. The Dashboard tab is `src/components/dashboard/AnalyticsView.tsx`; clicking a stat tile or a category opens `AnalyticsDetails.tsx`, whose `ItemsTable` lists line items (`CashflowLineItem` from `src/lib/cashflow.ts`) fetched from the items route. The Analytics tab is `src/components/dashboard/TrendsView.tsx`, a column of cards ending in `RecurringChargesCard`. `src/components/dashboard/TransactionsFeed.tsx` renders the Recent Transactions feed on `src/app/page.tsx`, which holds a `refreshKey` number that makes the views refetch. Settings pages live under `src/app/settings/` and use `src/components/settings/SettingsLayout.tsx`; the avatar menu that links to them is `src/components/auth/AvatarMenu.tsx`. Shared interface pieces (Button, Card, CardHeader, Chip, EmptyState, SegmentedControl, Skeleton, `cx`) are exported from `src/components/ui`; `docs/design-system.md` describes them and the color tokens.

Labels. `labelForCategoryKey` in `src/lib/cashflow.ts` turns a key into a label by removing the longest primary from `KNOWN_PRIMARIES` that prefixes it and title-casing the rest, with a few explicit overrides.

Tests. Run `npx vitest run --dir src` from the repository root; the `--dir src` keeps stale copies under `.claude/worktrees/` out of the run. Pure modules are tested with hand-built rows. Route tests mock `withUser` with a fake handle whose query chain resolves fixture rows and import the real route. Component tests use Testing Library and mock `fetch`.

Migrations in production are applied by hand before deploying, because the production image has no migration tooling; the exact procedure is restated in Concrete Steps. New tables need grants to the `app_user` role and an RLS policy written by hand after the generated SQL, as `drizzle/0012_ancient_invisible_woman.sql` does.


## Plan of Work

### Milestone 0 (prototype): how do the owner's rows group?

Done on 2026-10-04 during the load-bearing review; the results are in Surprises & Discoveries and the choices in the Decision Log. The description is kept for the record.

The matching rule decides whether this feature feels smart or annoying, and it can be measured before anything is built. Export the owner's rows read-only (query in Concrete Steps) to the scratchpad. In a temporary test file under `src/__tests__/` (deleted afterwards; it writes its findings to a scratchpad file because Vitest 4 hides console output), run the rows through `enrichDescriptors` and `applyCategoryRules`, then group the non-pending uncategorized rows by a draft of the match key with caps of three, four and five words.

Record in Surprises & Discoveries: the number of uncategorized rows and their total; for each cap, the number of groups and how many rows the ten largest groups cover; any group that mixes inflows and outflows; and the sum of uncategorized inflows now counted as negative spending. Read the twenty largest groups by eye. Choose the cap whose groups are each one real-world payee (payroll in one group, each kind of transfer in its own), write it into the Decision Log, and adjust the matching decision if a group is wrong. If no cap gives sensible groups, stop and revise this plan before Milestone 1. Nothing from this milestone is committed except the notes in this file.

### Milestone 1: the pure module and created categories

Create `src/lib/category-memory.ts`, pure, with a header comment in the style of `src/lib/category-rules.ts` pointing at this plan. It holds everything about matching and choosing, as specified in Interfaces and Dependencies: the match key, matching a row against memories, applying the owner's choices to rows, counting similar rows, grouping uncategorized rows for the queue, building and validating created categories, and building the picker's list.

In `src/lib/cashflow.ts`, add `CUSTOM_INCOME`, `CUSTOM_SPENDING` and `CUSTOM_SAVINGS` to `KNOWN_PRIMARIES`, and add a first rule to `classifyTransaction`: when `txn.category` is one of those three, return `income`, `spending` or `savings`. Savings stays a signed sum, as it is for Plaid's savings categories. `labelForCategoryKey("CUSTOM_SPENDING_KIDS_ACTIVITIES")` then gives "Kids Activities" with no further change. Add `id: number` to `CashflowRow` and `CashflowLineItem`, and copy it in `toLineItem`.

Tests in `src/__tests__/category-memory.test.ts`: a memory keyed `trader joe s` matches both a row with merchant name "Trader Joe's" and a descriptor-only row "TRADER JOE S #273 00SEATTLE WA", and the key to save for that descriptor row after enrichment is `trader joe s`; an unjoined descriptor's key to save is its first four words, and a five-word merchant key still matches a descriptor that starts with those five words; `defaultApplyToSimilar` is false for keys `venmo payment web`, `zelle payment to mom`, `check` and `non chase atm withdraw` and true for `trader joe s`; a descriptor row "MANUAL DB-BKRG 08/14" matches a memory keyed `manual db bkrg` and "Manual CR-Bkrg" does not; a row with merchant name "Apple Cash" does not match a memory keyed `apple`, while a descriptor row "APPLE.COM/BILL 866-712-7753 CA" does; a row with merchant name "CVS" matches a memory keyed `cvs`, while a descriptor row never prefix-matches a key with fewer than four letters; the longest matching memory wins; a descriptor row gets the same answer whether or not enrichment has given it a merchant name; a transaction's own choice beats a memory, and a memory beats a pair the code rules produced; rows with neither come back as the same objects; `applyUserCategories` does not mutate; the similar count for a row excludes the row itself; uncategorized groups are sorted by total, skip pending rows, and carry a count, a total, a date range and the newest row's transaction id; `customCategory("Kids activities", "spending")` gives the pair above, and names with punctuation, empty names and names over 30 characters give null; `isValidCategoryPair` accepts a Plaid-shaped pair and a well-formed created pair and rejects a created detailed key under the wrong primary; the option list contains each pair present in the rows or held by a memory once, the fixed pairs, and no `UNCATEGORIZED`. In `src/__tests__/cashflow.test.ts`: a `CUSTOM_INCOME` row with a negative amount counts as income, a `CUSTOM_SAVINGS` row as savings, a `CUSTOM_SPENDING` row as spending, and the label test above. Add `id` to the fixtures the type-checker flags.

Acceptance: the new suite fails before the module exists and passes after; the whole suite and `npx tsc --noEmit` pass.

### Milestone 2: storage, and every read applies the owner's choices

In `src/lib/db/schema.ts`, add `userCategory: text("user_category")` and `userCategoryDetailed: text("user_category_detailed")` to `transactions`, and a table `categoryMemories` (`category_memories`): `id` serial primary key, `userId` uuid not null referencing `users.id` with cascade delete, `matchKey` text not null, `category` text not null, `categoryDetailed` text not null, `createdAt` and `updatedAt` timestamps with time zone defaulting to now, and a unique constraint on (`userId`, `matchKey`). Run `npm run db:generate`, which works without a database and writes `drizzle/0015_<name>.sql` and its journal entry. Append to that file, each statement after a `--> statement-breakpoint` line and following `drizzle/0012_ancient_invisible_woman.sql` exactly: grant select, insert, update and delete on `category_memories` to `app_user`; grant usage and select on its id sequence; enable and force row level security; and create the policy `category_memories_isolation` for all commands to `app_user` using and checking `user_id = app_current_user_id()`. The `transactions` table already has its grants and policy, so the two new columns need nothing more.

In `src/lib/db/classified-transactions.ts`, add `id`, `userCategory` and `userCategoryDetailed` to the select and to `ClassifiedTransactionRow`, load the user's memories with a second query (`select` of `matchKey`, `category`, `categoryDetailed` from `categoryMemories` where `userId` matches), and return `applyUserCategories(rows, enrichDescriptors(rows).map(applyCategoryRules), memories)`: the first argument is the rows as stored, which decide what matches, and the second is the same rows after enrichment and the code rules, which receive the result. Extend the doc comment to state the order of precedence and that matching reads stored columns only. Export a small `selectCategoryMemories(tx, userId)` from the same file so the two display routes can use it.

In `src/app/api/transactions/route.ts` and `src/app/api/shared/[token]/route.ts`, load memories in the same `withUser` callback and pass the rows through `applyUserCategories` after `applyCategoryRules`. The shared route must also select `id`, `userCategory` and `userCategoryDetailed` for this and keep stripping its payload to the original five fields. These two routes do not run enrichment, and do not need to: matching reads stored columns only, so they give each row the same answer analytics does. In `src/app/api/transactions/route.ts` also add `categoryDetailed` to `TransactionRow` and to the response.

Update the three analytics route tests so the mocked `from` returns both the `innerJoin` chain and a `where` that resolves a memories fixture (empty by default). Add to `src/__tests__/cashflow-route.test.ts`: with a memory keyed `acme payroll` mapping to `INCOME` / `INCOME_SALARY` and an `UNCATEGORIZED` descriptor row "ACME PAYROLL PPD 123" of amount "-2000.00", the month's income includes 2000.00 and spending has no `UNCATEGORIZED` key; and a row with `userCategoryDetailed` set is totaled under that key. If the gated real-database suite `src/__tests__/rls-isolation.test.ts` enumerates tables, add `category_memories` to it in the same pattern; it is skipped without a database and stays skipped here.

Acceptance: the suite and type-check pass; `grep -rn "applyUserCategories" src/app src/lib/db` lists the helper and the two display routes.

### Milestone 3: the routes

All routes authenticate with `getUserId`, run inside `withUser`, return 401 through `isAuthError`, and log failures with `logServerError`, as `src/app/api/manual-accounts/route.ts` does. The ones that need a transaction's key read all of the user's rows through `selectClassifiedTransactionRows(tx, userId, "1970-01-01")` and find the row by `id`, because the key depends on enrichment, which needs the whole set; the owner has under two thousand rows.

`GET /api/categories` returns `{ options }` from `categoryOptions(rows, memories)`, so a created category held only by a memory that matches no row today is still offered.

`GET /api/analytics/uncategorized` returns `{ groups, count, total }` from `groupUncategorized(rows)`, where `count` and `total` cover all groups.

`GET /api/transactions/[id]/similar` returns `{ key, label, similarCount, samples, defaultApply, category, categoryDetailed, hasOwnChoice, hasMemory, pending }` for that transaction, where `samples` is up to three similar transactions (date, descriptor, amount), newest first, and `defaultApply` is `defaultApplyToSimilar(key)`, or 404 when it is not the user's.

`PUT /api/transactions/[id]/category` takes `{ category, categoryDetailed, applyToSimilar }`. It answers 400 unless `isValidCategoryPair` accepts the pair and `applyToSimilar` is a boolean, and 404 for an unknown transaction. With `applyToSimilar` true it upserts the memory for the row's key (insert, on conflict on user and key update the pair and `updatedAt`) and sets the transaction's two user columns to null; when the key to save is empty, or the row has no stored merchant name and the key has fewer than four letters, it answers 400 with "this transaction cannot be matched to similar ones". With `applyToSimilar` false it sets the two user columns on that transaction, and answers 400 when the transaction is pending. `DELETE` on the same path sets the two columns to null. Each answers `{ ok: true }`.

`GET /api/category-memories` returns `{ memories }`, each with `id`, `matchKey`, `label` (the merchant name or descriptor of the newest matching row, or the key when none matches), `category`, `categoryDetailed` and `matchCount`. `DELETE /api/category-memories/[id]` removes one of the user's memories and answers 404 when it is not theirs.

Tests, one file per route family in `src/__tests__/` using the existing mock idiom: each route's 401; `PUT` validation failures; `PUT` with `applyToSimilar` true calls insert on `categoryMemories` with the expected key and nulls the columns, and with false updates the transaction only; `similar` returns the right count for a fixture with three matching rows; the uncategorized route's groups for a small fixture; deleting another user's memory id gives 404.

Acceptance: suite, type-check and `npx eslint src` clean.

### Milestone 4: the interface

Follow `docs/design-system.md` and the neighbouring components; use the primitives from `src/components/ui`; every control at least 44px tall on phones; no new dependencies.

Create `src/components/dashboard/CategoryPicker.tsx`, a dialog (`role="dialog"`, labelled, closes on Escape and on Cancel, a centered panel on desktop and full width at the bottom on phones). Props: `id`, `title` (merchant or descriptor), `onClose`, `onSaved`. On open it fetches `/api/categories` and the transaction's `similar` route. It shows a filter box, the options as a list grouped under their primary's label with the current category marked, and a last row "New category" that reveals a name field and a three-way `SegmentedControl` (Income, Spending, Savings; Spending first and selected). Below the list is a checkbox: "Also apply to N similar transactions and future ones" when `similarCount` is above zero, otherwise "Remember for future transactions from <label>"; ticked or not according to the route's `defaultApply`; followed by the route's sample transactions in small text; hidden with a one-line explanation when the route says the transaction cannot be matched. Save sends the `PUT` and calls `onSaved`; a failed save shows an inline error and keeps the dialog open. When `hasOwnChoice` is true a "Reset to original" button sends the `DELETE`.

Create `src/components/dashboard/NeedsCategoryCard.tsx`, a `Card` titled "Needs a category" with the caption "N transactions · $T" and one row per group: label, "N transactions · first date to last date", total, and a "Categorize" button that opens the picker for the group's newest transaction. It shows ten groups and a "Show all" button when there are more (the owner starts with about 290 groups, most of them single transactions, so the expanded list scrolls inside the card at the same maximum height as the details table). It renders nothing when there are no groups or while loading for the first time, and a single line "Couldn't load uncategorized transactions." on error. Render it in `src/components/dashboard/TrendsView.tsx` directly above `RecurringChargesCard`.

In `AnalyticsDetails.tsx`, make the category in each `ItemsTable` row (the desktop column and the phone sub-line) a button that opens the picker for `item.id`; the row key can now be the transaction id. In `TransactionsFeed.tsx`, do the same for the category label, label it with `labelForCategoryKey(txn.categoryDetailed ?? txn.category ?? "UNCATEGORIZED")`, delete the file's own `CATEGORY_LABELS` and `formatCategory`, and leave the label as plain text on pending rows.

After any save, everything showing categories must refetch. `src/app/page.tsx` already holds `refreshKey`; pass a callback that increments it down to `TrendsView`, `AnalyticsView` (for `AnalyticsDetails`) and `TransactionsFeed`, and make the card refetch on it too.

Create `src/app/settings/categories/page.tsx` using `SettingsLayout` with the title "Memorized categories": one row per memory with its label, "→ category label", "N transactions" and a Remove button that sends the `DELETE` and refetches; an `EmptyState` when there are none ("Nothing memorized yet. Categorize a transaction and keep the box ticked."). Add a "Categories" link to `src/components/auth/AvatarMenu.tsx` beside the other settings links.

Component tests: the picker lists options, filters, saves with the box ticked by default (`applyToSimilar: true` in the request) and unticked (`false`), creates a category (the request carries `CUSTOM_SPENDING` and the derived key), shows the count sentence, and shows Reset only when the transaction has its own choice; the card renders groups, hides when empty, and opens the picker; `trends-view.test.tsx` and `analytics-view.test.tsx` get the extra fetch mocked and one test each that a category button opens the picker; the settings page lists and removes.

Acceptance: suite, type-check and lint clean.

### Milestone 5: look at it, check it on real rows, ship it

Visual check without a database: the harness in `docs/design/analytics-redesign/harness/` answers every `/api/*` request in the browser (its README has the three steps). Add answers for the new routes to `prod-fixtures.js` (several uncategorized groups, an option list, a `similar` answer, a memories list), run `npm run dev -- --port 3000`, and look at the Analytics tab, the picker and the Settings page at 1440 and 390 pixels wide. Fix what looks wrong.

Real-row check: with the Milestone 0 export and a temporary test, apply a handful of memories a person would make (the largest groups from Milestone 0, payroll as `INCOME_SALARY`) and run `aggregateCashflow` before and after. Record in Surprises & Discoveries the uncategorized count and total before and after, and the change in income and spending for two affected months; confirm that every changed row belongs to a memorized group.

Then run the full checks, rehearse the migration in production inside a rolled-back transaction and then apply it before deploying (both in Concrete Steps), verify the journal, merge to `main` without a pull request, and run `scripts/deploy.sh` only when the owner says so. After deploy the owner categorizes one real group and confirms the behavior in Purpose, and a spot check in production shows the memory row.


## Concrete Steps

All commands run from the repository root, or from this worktree's root (`/Users/justin/code/personal/OtterMint/.claude/worktrees/smart-categorization`) while the work is in progress.

Checks:

    npx vitest run --dir src
    npx tsc --noEmit -p tsconfig.json
    npx eslint src
    npm run build

Export the owner's rows (read-only) for Milestones 0 and 5; use `otterholt-ts` instead of `otterholt` when away from the home network:

    ssh otterholt 'docker exec ottermint-db-1 psql -U postgres -d ottermint -Atc "select json_agg(json_build_object(
      '"'"'id'"'"', t.id, '"'"'amount'"'"', t.amount, '"'"'date'"'"', t.date, '"'"'name'"'"', t.name,
      '"'"'merchantName'"'"', t.merchant_name, '"'"'category'"'"', t.category, '"'"'categoryDetailed'"'"', t.category_detailed,
      '"'"'pending'"'"', t.pending, '"'"'accountType'"'"', a.type, '"'"'accountSubtype'"'"', a.subtype, '"'"'accountName'"'"', a.name))
      from transactions t join accounts a on a.account_id = t.account_id
      join plaid_items p on p.id = a.plaid_item_id join users u on u.id = p.user_id
      where u.email = '"'"'kchoosun@gmail.com'"'"'"' > <scratchpad>/rows.json
    # amounts come back as JSON numbers; convert them to strings before use.

Generate the migration (no database needed), then append the grants and policy by hand:

    npm run db:generate
    # expected: a new drizzle/0015_<name>.sql and a new entry in drizzle/meta/_journal.json

Rehearse the migration in production; everything is rolled back, and any error means stop and fix the migration file:

    ssh otterholt 'docker exec -i ottermint-db-1 psql -U postgres -d ottermint -v ON_ERROR_STOP=1' <<'SQL'
    BEGIN;
    -- every statement from drizzle/0015_<name>.sql
    SET LOCAL ROLE app_user;
    SELECT set_config('app.current_user_id', (SELECT id::text FROM users WHERE email = 'kchoosun@gmail.com'), true);
    INSERT INTO category_memories (user_id, match_key, category, category_detailed)
      VALUES (app_current_user_id(), 'rehearsal key', 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES')
      ON CONFLICT (user_id, match_key) DO UPDATE SET category_detailed = excluded.category_detailed;
    SELECT count(*) FROM category_memories;                    -- expected: 1
    UPDATE transactions SET user_category = NULL WHERE id = (SELECT min(id) FROM transactions);  -- expected: UPDATE 1
    ROLLBACK;
    SQL
    # the users lookup runs as app_user under row-level security; if it returns no row, look the id up as postgres first and paste it in.

Apply the migration in production, before deploying the code that needs it:

    shasum -a 256 drizzle/0015_<name>.sql                       # the hash
    grep -A3 '"tag": "0015_<name>"' drizzle/meta/_journal.json  # "when": the millisecond stamp
    ssh otterholt 'docker exec -i ottermint-db-1 psql -U postgres -d ottermint -v ON_ERROR_STOP=1' <<'SQL'
    BEGIN;
    -- every statement from drizzle/0015_<name>.sql
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<hash>', <millis>);
    COMMIT;
    SQL
    ssh otterholt 'docker exec ottermint-db-1 psql -U postgres -d ottermint \
      -c "SELECT id, left(hash,12), created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 2;"'
    # expected: the newest row shows the hash and stamp just inserted

Merge and deploy (the owner's standing rule for this repository: no pull requests, push the branch straight to main using the personal GitHub identity; deploy only on the owner's word):

    git push origin worktree-smart-categorization:main
    ./scripts/deploy.sh
    # expected: the script ends with the health check {"status":"ok","db":"ok"}


## Validation and Acceptance

Tests: every suite passes, and each new suite fails before its milestone's code exists. The key ones are the cash-flow route test in Milestone 2 (an uncategorized payroll descriptor becomes income through a memory, through the real route) and the picker's two save tests in Milestone 4.

Behavior, on the deployed app as the owner. The Analytics tab shows "Needs a category" with the uncategorized total recorded in Milestone 0. Clicking a group's Categorize button opens the picker with that merchant as the title and a sentence giving the number of similar transactions. Saving a group of purchases with the box ticked and a spending category removes the group from the card, lowers the Uncategorized row of Category trends by the group's total and raises the chosen category by the same amount. Saving a group of deposits as Salary removes it from the card and raises that month's income by the group's amount for the month (Category trends shows spending only, so income and savings categories appear in the totals and the detail lists, not as a trend row). On the Dashboard, opening a category's details and clicking a row's category, unticking the box and saving changes that one row and no other. Creating "Kids activities" as spending shows "Kids Activities" in the lists and counts toward spending. Pressing Refresh (a Plaid sync) changes none of this. On Settings, Memorized categories lists the memory with its transaction count; removing it puts the group back on the card.

Data, in production after the owner's first save:

    ssh otterholt 'docker exec ottermint-db-1 psql -U postgres -d ottermint -c "select match_key, category_detailed from category_memories;"'
    # expected: one row with the merchant's key and the chosen category


## Idempotence and Recovery

Every code step is additive and covered by tests; re-running a check is harmless. The export query is read-only. The migration only adds two nullable columns and one table, so the old application runs unchanged against the migrated database, which is why it is applied first. It runs inside one database transaction with `ON_ERROR_STOP`, so a failure leaves nothing behind and it can be run again; if the journal already shows the hash, do not run it again. To back the feature out, redeploy the previous commit; the new columns and table are then unused and can stay. Plaid's categories are never modified, so removing a memory or resetting a transaction restores exactly what was shown before. If `scripts/deploy.sh` fails part-way, run it again.


## Artifacts and Notes

Production facts (2026-10-04) are in Surprises & Discoveries: 2,226 rows, 475 uncategorized in about 290 groups. The export and the analysis scripts from the review are in the session scratchpad and are not checked in; the export query is in Concrete Steps.

Local end-to-end run (2026-10-05), real app on `next dev` against a disposable `postgres:17` container on 127.0.0.1:5433 with all sixteen migrations and a synthetic owner (289 transactions shaped like production; no real data). Observed through the UI and the same APIs the charts use:

    Payroll group (34 rows) saved as Salary  -> queue 89 -> 55 rows; Uncategorized fold -$4,896 -> -$511 a month
    Monkey Grind (16 rows, $116.62) as Coffee -> UNCATEGORIZED -116.62, FOOD_AND_DRINK_COFFEE +116.62, total spending unchanged
    One Uber ride, box unticked, Kids Activities -> Taxis -36.49, Kids Activities +36.49, no memory written
    Settings: remove Monkey Grind             -> group back in the queue with 16 rows, $116.62
    Feed: Reset to original                   -> the ride shows Taxis And Ride Shares again
    Venmo similar -> key "venmo", defaultApply false; Trader Joe's -> 91 similar, defaultApply true; "BP 1234" -> key ""
    Pending one-off PUT -> 400; no session -> 401 on all four GET routes; foreign Origin PUT -> 403
    Second user probing the first user's ids -> 404 on similar, PUT, DELETE and memory DELETE

Production rehearsal of `0015` (rolled back): CREATE TABLE, ALTER x3, GRANT x2, ALTER x2, CREATE POLICY; as app_user under the owner's context the upsert inserted then updated, the owner saw 1 memory, `UPDATE 1` on a transaction; after ROLLBACK the table was absent and the journal still had 15 rows. Applied: journal row 16 `1245a391d99f` / 1791159472147.

The fixed pairs always offered by the picker, chosen because they change how money is counted or are everyday needs: `INCOME` / `INCOME_SALARY`, `INCOME` / `INCOME_INTEREST_EARNED`, `INCOME` / `INCOME_DIVIDENDS`, `TRANSFER_OUT` / `TRANSFER_OUT_SAVINGS`, `TRANSFER_OUT` / `TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS`, `TRANSFER_IN` / `TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS`, `TRANSFER_OUT` / `TRANSFER_OUT_ACCOUNT_TRANSFER`, `TRANSFER_IN` / `TRANSFER_IN_ACCOUNT_TRANSFER`, `LOAN_PAYMENTS` / `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`, `FOOD_AND_DRINK` / `FOOD_AND_DRINK_GROCERIES`, `RENT_AND_UTILITIES` / `RENT_AND_UTILITIES_RENT`. Production carries both `INCOME_SALARY` and `INCOME_WAGES` for payroll; both count as income. The account-transfer and card-payment pairs are how the owner marks a row as "not counted" (the classifier treats them as internal).


## Interfaces and Dependencies

No new dependencies.

In `src/lib/category-memory.ts` (new, pure):

    export interface CategoryPair { category: string; categoryDetailed: string }
    export interface CategoryMemory extends CategoryPair { matchKey: string }
    export interface MemoryRow {
      id: number; name: string; merchantName: string | null;
      category: string | null; categoryDetailed: string | null;
      userCategory?: string | null; userCategoryDetailed?: string | null;
    }
    export type CustomFlow = "income" | "spending" | "savings";

    /** A row from the read helper: merchantName may come from enrichment; storedMerchantName is the column. */
    export interface ReadRow { id: number; name: string; merchantName: string | null; storedMerchantName: string | null; userCategory?: string | null; userCategoryDetailed?: string | null }
    /**
     * The key a memory saved from this row gets. `stored` is the row as stored;
     * `enrichedMerchantName` is the merchant enrichment joined it to, if any.
     * Empty string when the row cannot be memorized.
     */
    export function memoryKeyToSave(stored: { merchantName: string | null; name: string }, enrichedMerchantName: string | null): string;
    export function rowMemoryKey(row: ReadRow): string;
    /** The memory that already decides the row, else rowMemoryKey: what a save writes. */
    export function memoryKeyForRow(row: ReadRow, memories: CategoryMemory[]): string;
    /** The rows each memory decides, by key (rows with their own choice excluded). */
    export function memoryMatches<T extends ReadRow>(rows: T[], memories: CategoryMemory[]): Map<string, T[]>;
    /** The memory that applies to a stored row, or null (exact for Plaid-named rows, longest prefix for descriptors). */
    export function findMemory<M extends CategoryMemory>(stored: { merchantName: string | null; name: string }, memories: M[]): M | null;
    /**
     * `processed[i]` with the owner's choice for `stored[i]` applied: own choice,
     * else memory, else unchanged (same object). The two arrays are index-aligned. Never mutates.
     */
    export function applyUserCategories<S extends MemoryRow, T extends { category: string | null; categoryDetailed: string | null }>(stored: S[], processed: T[], memories: CategoryMemory[]): T[];
    /** Rows a memory with this key would decide alongside the existing memories, excluding the given transaction and rows with their own choice. */
    export function similarRows<T extends ReadRow>(rows: T[], key: string, exceptId: number, memories?: CategoryMemory[]): T[];
    /** False for payment-app, check and cash keys, where similar descriptors are different payees. */
    export function defaultApplyToSimilar(key: string): boolean;
    export interface UncategorizedGroup {
      key: string; label: string; count: number; total: string;
      firstDate: string; lastDate: string; id: number;
    }
    export function groupUncategorized<T extends MemoryRow & { amount: string; date: string; pending: boolean }>(rows: T[]): UncategorizedGroup[];
    export function customCategory(name: string, flow: CustomFlow): CategoryPair | null;
    export function isValidCategoryPair(pair: { category: unknown; categoryDetailed: unknown }): pair is CategoryPair;
    export interface CategoryOption extends CategoryPair { label: string; groupLabel: string }
    export function categoryOptions(rows: Array<{ category: string | null; categoryDetailed: string | null }>, memories: CategoryPair[]): CategoryOption[];

`isValidCategoryPair` requires both strings to match `^[A-Z0-9_]{1,80}$`, the pair not to be the `UNCATEGORIZED` placeholder, and, when either string starts with `CUSTOM_`, the primary to be one of the three created primaries and the detailed key to start with that primary and an underscore.

In `src/lib/cashflow.ts` (changed): three created primaries in `KNOWN_PRIMARIES`; the first rule of `classifyTransaction`; `id` on `CashflowRow` and `CashflowLineItem`.

In `src/lib/db/schema.ts` (changed): `transactions.userCategory`, `transactions.userCategoryDetailed`, and `categoryMemories`.

In `src/lib/db/classified-transactions.ts` (changed): `ClassifiedTransactionRow` gains `id`, `storedMerchantName`, `userCategory`, `userCategoryDetailed`; new `selectCategoryMemories(tx, userId): Promise<StoredCategoryMemory[]>` (memories with their `id`) and `loadClassifiedTransactions(tx, userId, since): Promise<{ rows, memories }>`, which the category routes use so the memories are read once; `selectClassifiedTransactionRows` returns its `rows`.

In `src/lib/validate-request.ts` (changed): `parseSerialId(raw: string): number | null` for the `[id]` path segments.

In `src/app/api/transactions/route.ts` (changed): `TransactionRow` gains `categoryDetailed: string | null`.

Routes (new): `src/app/api/categories/route.ts`, `src/app/api/analytics/uncategorized/route.ts`, `src/app/api/transactions/[id]/similar/route.ts`, `src/app/api/transactions/[id]/category/route.ts`, `src/app/api/category-memories/route.ts`, `src/app/api/category-memories/[id]/route.ts`, with the request and response shapes given in Milestone 3.

Components (new): `src/components/dashboard/CategoryPicker.tsx`, `src/components/dashboard/NeedsCategoryCard.tsx`, `src/app/settings/categories/page.tsx`.


---

Revision note (2026-10-03): Initial version, written from a read of the code and the two earlier category plans, with the owner's four scope answers. Nothing implemented.

Revision note (2026-10-05): Implemented Milestones 1 to 5 up to the deploy. Recorded the implementation decisions (save into the deciding memory, out/in totals, whole-row buttons on phones, local acceptance against a disposable PostgreSQL), the surprises (the fade-in transform, the unmerged button class, the comparison distortion, the real-row results), the local and production evidence, and the interfaces as built. Rebased onto main's period picker before merging.

Revision note (2026-10-04): Load-bearing review. Matching now reads stored columns only (the first draft's dependence on enrichment could make a memory stop applying and made the feed disagree with analytics); the four-letter floor guards prefix matches only; the save cap is four words; the "apply to similar" box starts unticked for payment-app, check and cash keys and the picker shows sample transactions; single-transaction routes are keyed on the numeric id because backfilled transaction ids contain colons; the category button is disabled on pending rows; the feed's API and labels carry the detailed category; a rolled-back production rehearsal precedes the migration; the picker's options include pairs held only by memories; the uncategorized figures are corrected from 217 to 475 and the claim that a few choices clear most of the pile is withdrawn. Milestone 0 was completed as part of the review. The statement importer was found outside the repository and read: reruns skip existing rows, so that risk is closed.
