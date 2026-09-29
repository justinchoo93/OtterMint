# Join backfilled bank descriptors to their Plaid merchants at read time

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. It is maintained in accordance with `docs/PLANS.md` at the repository root. It follows `docs/plans/analytics-tab.md`, whose production check found the problem this plan fixes; that file is checked in and is incorporated here by reference, but everything needed to do this work is restated below.

## Purpose / Big Picture

OtterMint's transactions come from two sources. Since about mid-April 2026 they are synced from Plaid, which supplies a clean merchant name ("Netflix") and a category for each row. Before that they were backfilled from bank statements, which give only the bank's descriptor ("NETFLIX.COM 866-579-7172 CA"), no merchant name, and for 294 of the 993 backfilled rows in the last thirteen months the placeholder category `UNCATEGORIZED`. Every analytics feature that groups by merchant or category feels the seam: the Analytics tab's recurring-charge detection sees "Medium" from May 2026 and "MEDIUM MONTHLY MEDIUM.COM CA" before it as two merchants, so a subscription's history, count and price changes start at the seam; and category trends over a window that reaches before April show "Uncategorized" as the second-largest category, $1,901 a month on average.

After this change, the analytics read joins each backfilled descriptor to the Plaid merchant it belongs to when the descriptor starts with that merchant's name, and fills in the merchant's usual category when the row has none. The recurring table then shows Medium with thirteen charges since September 2025 instead of five since May, Trader Joe's descriptors become "Trader Joe's" in the details panel with the Groceries category, and the Uncategorized row shrinks to the merchants that only ever appeared in the backfill. Nothing in the database changes; the join happens in the one helper every analytics route reads through.

To see it working: sign in, open Analytics, and press All. Category trends show Groceries and Online Marketplaces carrying their pre-April months instead of Uncategorized, and the recurring table's Medium row reads 13 charges with a first date in 2025.

## Progress

- [x] (2026-09-29 20:15Z) Milestone 1: `src/lib/merchant.ts` with `merchantTokens` and `merchantKey`; recurring detection uses it; `merchant.test.ts` and the updated `recurring.test.ts` pass.
- [x] (2026-09-29 20:20Z) Milestone 2: `src/lib/descriptor-enrichment.ts` wired into `selectClassifiedTransactionRows` before the category rules; `descriptor-enrichment.test.ts` and a cash-flow route test pass.
- [x] (2026-09-29 20:45Z) Milestone 3, production check: run before and after on the owner's 1,388 rows; three findings led to three refinements recorded below (the River rule, yearly tolerance, amount series). Full suite, type-check and lint clean; merged to main.
- [x] (2026-09-29 21:00Z) Milestone 3, deploy: deployed at `ea5d2ee` via `scripts/deploy.sh` on the owner's request; health check `{"status":"ok","db":"ok"}`.

## Surprises & Discoveries

- Observation: the backfilled rows are not all uncategorized. Of 993 descriptor rows in the last thirteen months, 294 carry the literal category `UNCATEGORIZED` with no detailed category, and the rest carry real categories (groceries, credit-card payments, transfers, wages). So "missing category" must mean null or `UNCATEGORIZED`, and rows that already have a category must keep it.
  Evidence (2026-09-29, production export): the top category pairs among descriptor rows were `UNCATEGORIZED / null` 294, `TRANSFER_OUT / TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS` 105, `FOOD_AND_DRINK / FOOD_AND_DRINK_GROCERIES` 84, `LOAN_PAYMENTS / LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` 83.

- Observation: a token-prefix join is enough. A prototype of the rule below joined 351 of the 993 descriptor rows to 138 Plaid merchants, and the largest joins were all correct: Trader Joe's 71, Amazon 55, Acorns 39, River 29, Costco 29, Uber 18, Fred Meyer 14, Apple 11, Medium 8. What did not join were payroll, transfers, interest and card payments, which have no merchant.

- Observation: enrichment exposed three things the seam had hidden, each fixed before merging.
  First, River's backfilled ACH buys ("River <ref> (River) <ref> Web ID: …", 18 rows, $250 to $3,700 a month) carried `UNCATEGORIZED`, so they counted as spending and, once joined to the Plaid merchant "River.", would have taken its Plaid label, Internet & Cable. The category rule for River buys was anchored to "RIVER. SUPER BUY" and "RIVER. RECUR BUY" and never saw them. Widening the rule (Decision Log) moves them to savings, as the owner's rule intends: November 2025 spending $13,031 to $9,331 and savings $4,306 to $8,006.
  Second, a restaurant visited on 2025-09-11 ($39.03) and 2026-09-08 ($38.08) was detected as a yearly charge, because two charges a year apart within the $1 tolerance qualified. Yearly now needs the same amount to within 1% (or ten cents) and never counts food and drink.
  Third, joining Apple's descriptors merged two subscriptions billed under one merchant, $0.99 monthly all year and $33.09 monthly until December 2025, whose interleaved dates broke the monthly cadence and dropped Apple entirely. Charges are now split into amount series before detection (Decision Log). Result on production: Apple $0.99 with 13 charges since 2025-09-09, Medium 13 since 2025-09-17, and a $40 Thetadata plan (4 monthly charges) that had been hidden among $30 charges at the same merchant.
  Evidence (2026-09-29, before and after on the export): 351 descriptor rows gained a merchant name and 77 a category; rows still uncategorized 294 to 217; the Uncategorized category's twelve-month average $1,451 to $1,207 (with the River rule) and a Superstores row ($362 a month, Fred Meyer and Costco) appeared where those rows had been Uncategorized; recurring charges found 5 to 6, $3,780.57 to $3,820.57 a month; the twenty largest joins were all correct (Trader Joe's, Amazon, Acorns, River, Costco, Uber, Fred Meyer, Apple, Medium, River Super Buy, Asian Family Market, Uber Eats, Compass Account, Domino's, Halcyon Brewing, Airbnb, Delta, Lululemon, Uniqlo, H Mart).

## Decision Log

- Decision: Normalize a merchant name or descriptor into tokens: lower-case, replace every character other than letters with a space, drop noise tokens (`com`, `net`, `org`, `co`, `io`, `www`, `http`, `https`, `inc`, `llc`, `ltd`), drop a leading payment-processor phrase (`aplpay`, `applepay`, `sq`, `tst`, `pp`, `paypal`, `gpay`, `recurring card purchase`), and drop trailing two-letter US state or Canadian province codes. Store numbers, dates, phone numbers and URLs disappear with the digits and punctuation.
  Rationale: the same normalization applied to both sides makes "Trader Joe's" and "TRADER JOE S #273 00SEATTLE WA" agree token for token (`trader joe s`), so no fuzzy matching is needed. Cities cannot be stripped without a list, but a leftover city only lengthens the descriptor and never breaks a prefix match.
  Date/Author: 2026-09-29, Claude.

- Decision: A descriptor joins the Plaid merchant whose tokens equal a prefix of the descriptor's tokens, longest merchant first, considering at most five leading tokens, and only merchants whose tokens hold at least four letters.
  Rationale: token-wise prefixes keep "applebees" away from "apple" while letting "APPLE.COM/BILL" join Apple. Longest-first lets "UBER EATS help.uber.com" join Uber Eats rather than Uber. The four-letter floor keeps two-letter processor codes from becoming join targets. A single-token merchant can still claim an unrelated descriptor that happens to start with the same word; that risk is accepted and checked against production in Milestone 3.
  Date/Author: 2026-09-29, Claude.

- Decision: Enrichment sets `merchantName` on a joined row and fills `category` and `categoryDetailed` only when the row has none (null, or `UNCATEGORIZED` with no detailed category), using the merchant's most common category pair among its Plaid rows. It never changes a row that already has a merchant name or a category, and it runs in `selectClassifiedTransactionRows` before the category-correction rules.
  Rationale: the backfill categorized many rows correctly, and a merchant's category from Plaid is a guess for a row that has none, not a correction. Running before the rules keeps the rules the last word, as they are today.
  Date/Author: 2026-09-29, Claude.

- Decision: A weekly charge with a steady day but a varying amount (the chiropractor the production check found) stays out of the recurring table.
  Rationale: the table is for fixed commitments; a varying medical visit is a habit, not a bill, and the bill categories stay rent, utilities, loan payments and insurance.
  Date/Author: 2026-09-29, Claude.

- Decision: The River category rule in `src/lib/category-rules.ts` widens to `^RIVER\b.*\bWEB ID\b`, recorded in that rule's own plan (`docs/plans/category-correction-rules.md`, Decision Log, 2026-09-29).
  Rationale: the backfilled River descriptors are the same ACH buys the rule already treats as savings; leaving them as spending under River's Plaid label would make enrichment worse than the placeholder it replaced.
  Date/Author: 2026-09-29, Claude.

- Decision: Yearly detection needs two charges whose amounts agree to within 1% (or ten cents) and a category outside food and drink; the general $1 or 5% tolerance stays for the other cadences.
  Rationale: with only two data points a year apart, the ordinary tolerance lets a restaurant revisit pass as a membership; memberships bill the same amount to the cent.
  Date/Author: 2026-09-29, Claude.

- Decision: Before detection, a non-bill merchant's charges are clustered by amount (within the $1 or 5% tolerance of each cluster's first amount); clusters that follow one another in time merge into one series (a price change), and clusters that interleave stay separate series, each detected on its own. Bills (rent, utilities, loan payments, insurance) stay one series because their amounts vary by design. When one merchant yields several charges, their keys are suffixed with the amount ("apple 0.99", "apple 33.09").
  Rationale: Apple, Amazon and app stores bill several subscriptions under one merchant; without the split, joining a merchant's full history drops it. Merging by time keeps the price-change note that the Netflix case relies on.
  Date/Author: 2026-09-29, Claude.

## Outcomes & Retrospective

Done on 2026-09-29 except deployment. The join is two small pure modules and one line in the canonical read; nothing was migrated. On the owner's data it gives a third of the backfilled rows their merchant back, cuts the placeholder category by a quarter, and lets the recurring table see a full year for the subscriptions that continued across the seam. The most valuable part of the milestone was the before-and-after run on real rows: each of the three refinements (River, yearly, amount series) came from a wrong-looking row in that output, not from a test fixture, and each is now a fixture.

What remains: 217 rows still carry the placeholder category, all at merchants that never appear in the Plaid era (payroll, transfers and card payments have no merchant to join; a few real merchants such as Hulu ended before the seam). A hand-kept table of descriptor-to-category overrides could cover the few that matter, but nothing in this plan needs it.

Revision note (2026-09-29, later): Milestones 1 to 3 done except deployment; three refinements recorded in Surprises and the Decision Log; Interfaces unchanged except that recurring charges may now share a merchant with amount-suffixed keys.

## Context and Orientation

The analytics routes (`src/app/api/analytics/cashflow/route.ts`, `.../cashflow/items/route.ts`, `.../recurring/route.ts`) all read transactions through one helper, `selectClassifiedTransactionRows(tx, userId, since)` in `src/lib/db/classified-transactions.ts`. It joins transactions to accounts and Plaid items, scopes to the user, and returns `ClassifiedTransactionRow` objects: `amount`, `date`, `name` (the bank descriptor), `merchantName` (Plaid's clean name, or null), `category` and `categoryDetailed` (Plaid's primary and detailed category, or null), `pending`, `accountType`, `accountSubtype`, `accountName`. Before returning, it maps every row through `applyCategoryRules` from `src/lib/category-rules.ts`, a pure function that rewrites the categories of rows whose `name` matches a rule (for example brokerage credits Plaid tags as contractor income). The database is never written by analytics; corrections live at read time because Plaid sync rewrites categories on every refresh.

Recurring-charge detection (`src/lib/recurring.ts`, `detectRecurringCharges`) groups spending rows by a merchant key and currently has its own `merchantKey`: the merchant name when present, else the descriptor, lower-cased with everything but letters and spaces removed. Category totals (`src/lib/cashflow.ts`, `aggregateCashflow`) key a row by `categoryDetailed ?? category ?? "UNCATEGORIZED"`, and `labelForCategoryKey` renders `UNCATEGORIZED` as "Uncategorized". Line items in the Analytics details panel show `merchantName ?? name`.

Tests run with `npx vitest run --dir src` from the repository root (the `--dir src` keeps stale worktree copies out). Route tests mock the database chain and import the real helper, so a pure change inside the helper runs in them too. Production can be queried read-only over ssh (`ssh otterholt 'docker exec ottermint-db-1 psql -U postgres -d ottermint -Atc "<sql>"'`); the owner's user is `kchoosun@gmail.com`, and the export used here is the last thirteen months of their rows as JSON (the query is in Artifacts and Notes).

Terms. A "descriptor" is the bank's transaction text in the `name` column. A "Plaid merchant" is a row's `merchantName` when Plaid supplied one. "Tokens" are the words left after the normalization in the Decision Log. The "seam" is mid-April 2026, when Plaid rows replace backfilled rows.

## Plan of Work

### Milestone 1: shared merchant normalization

Create `src/lib/merchant.ts`, pure, exporting `merchantTokens(text: string): string[]` implementing the normalization in the Decision Log, and `merchantKey(row: { merchantName: string | null; name: string }): string`, the tokens of the merchant name (trimmed, when non-empty) or else of the descriptor, joined with single spaces. Keep the state and province codes and the processor phrases as module constants. Test in `src/__tests__/merchant.test.ts`: "NETFLIX.COM 866-579-7172 CA" gives `["netflix"]`; "TRADER JOE S #273 00SEATTLE WA" and "Trader Joe's" both give `["trader", "joe", "s"]`; "AplPay TRADER JOE S SEATTLE WA" drops its prefix; "Recurring Card Purchase 03/08 SPOTIFY" gives `["spotify"]`; "UBER TRIP HTTPS://HELP.UBER.CO" gives `["uber", "trip", "help", "uber"]`; "HLU*HULUPLUS HULU.COM/BILL CA" gives `["hlu", "huluplus", "hulu", "bill"]`; "CA" alone stays `["ca"]` (a lone token is never dropped); `merchantKey` prefers the merchant name and falls back to the descriptor.

Change `src/lib/recurring.ts` to import `merchantKey` from `@/lib/merchant` and delete its local copy; the grouping and the `key` field keep their meaning. In `src/__tests__/recurring.test.ts`, import `merchantKey` from `@/lib/merchant` and update the expectation that "NETFLIX.COM 866-579-7172" now keys as `netflix` (the `com` and phone number are gone). Everything else in that suite passes unchanged, since the fixture merchants normalize the same way.

### Milestone 2: descriptor enrichment

Create `src/lib/descriptor-enrichment.ts`, pure, exporting `isUncategorized(row)` (true when `categoryDetailed` is null and `category` is null or `"UNCATEGORIZED"`) and `enrichDescriptors<T extends EnrichableRow>(rows: T[]): T[]`, where `EnrichableRow` is `{ name; merchantName; category; categoryDetailed }`. Build an index from the rows that have a merchant name: key is `merchantTokens(merchantName).join(" ")`, skipped when its letters number fewer than four; value holds the merchant name as first seen and a count of each category pair among that merchant's categorized rows. Then map the rows: a row with a merchant name is returned as is; otherwise take `merchantTokens(name)` and look up its first five, four, three, two and one tokens in that order; on the first hit return a copy with `merchantName` set to the entry's name and, when `isUncategorized(row)`, `category` and `categoryDetailed` set to the entry's most common pair (ties broken by first seen); with no hit return the row itself. When the index is empty, return the input array unchanged.

Wire it into `src/lib/db/classified-transactions.ts`: `return enrichDescriptors(rows).map(applyCategoryRules);` and extend the helper's comment to say that descriptors are joined to Plaid merchants before the rules run.

Test in `src/__tests__/descriptor-enrichment.test.ts` with small hand-built rows: a `NETFLIX.COM 866-579-7172 CA` row with `UNCATEGORIZED` joins a "Netflix" row and takes `ENTERTAINMENT / ENTERTAINMENT_TV_AND_MOVIES`; a `TRADER JOE S #273 00SEATTLE WA` row that already carries `FOOD_AND_DRINK_GROCERIES` gains the merchant name and keeps its category; `UBER EATS help.uber.com CA` joins Uber Eats when both Uber and Uber Eats exist; `APPLEBEES 123` does not join Apple; a merchant named "SQ" is never a join target; a row whose merchant name is present is untouched even if a longer merchant would match; the most common category wins when a merchant's Plaid rows disagree; and an input with no merchant names comes back as the same array. Add one test to `src/__tests__/cashflow-route.test.ts`: with a fixture that has a Plaid "Netflix" row and a `NETFLIX.COM` descriptor row tagged `UNCATEGORIZED`, the month's `spendingByCategory` has no `UNCATEGORIZED` key and the TV and movies total covers both rows.

### Milestone 3: production check, merge, deploy

Re-run the owner's exported rows through the pure functions with and without enrichment (a temporary test file in `src/__tests__/`, deleted afterwards, writing its output to the scratchpad since Vitest 4 does not print console output from tests). Record: how many descriptor rows gained a merchant name and how many gained a category; the Uncategorized average over the last twelve months before and after; the recurring charges before and after, especially Medium's count and first date; and any join that looks wrong in the twenty largest. If a join is wrong, tighten the rule in the Decision Log and repeat. Then run the full checks, merge to main by fast-forward push (`git push origin <branch>:main`, no pull request, per the owner's standing instruction), and deploy with `scripts/deploy.sh` only when the owner says so.

## Concrete Steps

From the worktree root (`/Users/justin/code/personal/OtterMint/.claude/worktrees/analytics-deeper` while in progress):

    npx vitest run --dir src
    # expected: all files pass, including merchant.test.ts and descriptor-enrichment.test.ts
    npx tsc --noEmit -p tsconfig.json
    npx eslint src

Production rows (read-only), the same query the helper runs, as JSON:

    ssh otterholt 'docker exec ottermint-db-1 psql -U postgres -d ottermint -Atc "select json_agg(json_build_object(
      '"'"'amount'"'"', t.amount, '"'"'date'"'"', t.date, '"'"'name'"'"', t.name, '"'"'merchantName'"'"', t.merchant_name,
      '"'"'category'"'"', t.category, '"'"'categoryDetailed'"'"', t.category_detailed, '"'"'pending'"'"', t.pending,
      '"'"'accountType'"'"', a.type, '"'"'accountSubtype'"'"', a.subtype, '"'"'accountName'"'"', a.name))
      from transactions t join accounts a on a.account_id = t.account_id
      join plaid_items p on p.id = a.plaid_item_id join users u on u.id = p.user_id
      where u.email = '"'"'kchoosun@gmail.com'"'"' and t.date >= '"'"'2025-09-01'"'"'"' > <scratchpad>/rows.json
    # amounts come back as JSON numbers; coerce them to strings before use.

## Validation and Acceptance

Unit tests pass, and the two new suites fail before their modules exist. With the production export, the recurring table lists Medium with a count of 13 and a first date of 2025-09-17 (it was 5 and 2026-05-18), and the Uncategorized average over the last twelve months falls from $1,901 (only merchants absent from the Plaid era remain). In the app, pressing All on Analytics shows the pre-April months carrying real categories, and the Analytics details panel lists "Trader Joe's" for backfilled grocery rows.

## Idempotence and Recovery

Everything is a pure, read-time transformation; re-running any step is safe and the database is never written. To back the change out, remove the `enrichDescriptors` call from the helper; the rest is inert. The production query is read-only.

## Artifacts and Notes

Prototype on the export (2026-09-29): 138 Plaid merchants; 351 of 993 descriptor rows joined; largest joins Trader Joe's 71, Amazon 55, Acorns 39, River 29, Costco 29, Uber 18, Fred Meyer 14, Apple 11, Medium 8; unjoined leaders were payroll, transfers, interest and card payments.

## Interfaces and Dependencies

No new dependencies.

In `src/lib/merchant.ts`:

    export function merchantTokens(text: string): string[];
    export function merchantKey(row: { merchantName: string | null; name: string }): string;

In `src/lib/descriptor-enrichment.ts`:

    export interface EnrichableRow {
      name: string; merchantName: string | null; category: string | null; categoryDetailed: string | null;
    }
    export function isUncategorized(row: Pick<EnrichableRow, "category" | "categoryDetailed">): boolean;
    export function enrichDescriptors<T extends EnrichableRow>(rows: T[]): T[];

In `src/lib/db/classified-transactions.ts`, the helper returns `enrichDescriptors(rows).map(applyCategoryRules)`.

Revision note (2026-09-29): Initial version, written from the Analytics tab plan's production findings and a prototype of the join on the same export. No implementation yet.
