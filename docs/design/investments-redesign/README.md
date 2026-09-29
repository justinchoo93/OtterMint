# Investments redesign: approved mock

The reference for the Investments page redesign (`docs/plans/investments-redesign.md`). The user approved it on 2026-09-29 on a private design canvas (https://claude.ai/artifact/QY77fgSmg7DML48XasV2Kr). The sample data is generated inside the mock and is not real: the four account names and masks and the two lifetime figures mirror the shape of production, everything else is illustrative.

- `desktop.html` (1440 × 2100, all accounts), `account.html` (1440 × 1900, scoped to the Schwab Individual account with the chart crosshair frozen on Aug 22) and `phone.html` (390 × 2560) are static, self-contained renders. Open them in a browser, or serve this folder (`python3 -m http.server 8931` from `docs/design`) and screenshot at those widths.
- `boards/*.dc.html` are the canvas boards. `desktop.dc.html` and `account.dc.html` are the same source with different default props (`scope`, `range`, `scrubDay`); their markup uses `{{ }}` holes plus `<sc-for>` and `<sc-if>` over values from each board's `renderVals()`. In the canvas the boards are live prototypes: range pills, account tiles and type filters click, and the chart scrubs.
- `render.mjs` re-renders the static files from the boards: `node docs/design/investments-redesign/render.mjs` from the repository root (it uses the repo's `jsdom`).

## Checking the implementation against the mock

Follow `docs/design/analytics-redesign/README.md`: the app's auth middleware only checks that a UUID-shaped `session_id` cookie exists, so the real signed-in page renders locally with no database when every `/api/*` request is answered in the browser. The plan's Milestone 6 adds `harness/mock-fixtures.js` here, answering `/api/analytics/investments` and the account routes with this mock's data so screenshots are comparable number for number.

## Intended deviations in the implementation

These differences come from real data or scope decisions recorded in the plan's Decision Log. Anything else that differs is a bug.

- The fourth summary tile is "Unrealized gain" (value versus cost basis), not "Realized gain". Realized gains need the tax-lot engine of `docs/plans/trade-ledger-wash-sales.md`; when it ships, that tile takes the slot and unrealized gain stays in the Holdings footer.
- The return under "Market gain" is the money-weighted return for the selected range (modified Dietz), not annualized.
- The hero change is measured within the latest comparable stretch of history (same set of covered accounts) and reads "since <date>", which can start later than the range. The chart still draws every reported point as one solid line.
- The chart is Recharts: the mint line, a 10% area, an end label, solid hairline gridlines and month (or week) ticks. Hovering or arrow-keying shows a date pill under the crosshair while the hero figure follows the point; the mock freezes one such state on the account board.
- Activity shows eight rows and a "Show all N" control that expands the list in place; there is no separate destination for brokerage activity.
- The search box filters the holdings table in the browser by ticker or name.
- On phones the app keeps its existing header (wordmark, title, then its buttons on a second row) and top navigation; the tile row scrolls horizontally.
- An option position shows its quantity in contracts and a readable label parsed from its OCC symbol (for example "AAPL $260 call · Dec 18, 2026"); the mock hand-wrote that label.
- Accounts are the user's Plaid investment accounts; manual accounts never appear (they carry no market data).
- Account tiles put the institution on a small line above the account name and mask ("Charles Schwab" over "Individual ····5111"), because Plaid's real institution names do not fit on one line with the mask at five tiles across; the mock abbreviated "Schwab".
- The allocation legend counts distinct securities (AAPL held in two accounts is one stock), and the holdings footer shows the unrealized figure without the word "unrealized", which the column header already carries.
