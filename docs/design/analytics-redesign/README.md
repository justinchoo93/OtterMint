# Analytics redesign: approved mock

The reference for the Analytics redesign (`docs/plans/analytics-redesign.md`). The user approved it on 2026-09-26 on a private design canvas (https://claude.ai/artifact/EFWAHG6UGx94B5rS5bSLoE). The sample data is generated inside the mock and is not real.

- `desktop.html` (1440 × 1700) and `phone.html` (390 × 2000) are static, self-contained renders. Open them in a browser, or serve this folder (`python3 -m http.server 8931` from `docs/design`) and screenshot at those widths.
- `source/*.dc.html` are the canvas boards. Their markup uses `{{ }}` holes plus `<sc-for>` and `<sc-if>` over values from each board's `renderVals()`.
- `render.mjs` re-renders the static files from the sources: `node docs/design/analytics-redesign/render.mjs` from the repository root (it uses the repo's `jsdom`).

## Checking the implementation against the mock

The app's auth middleware only checks that a UUID-shaped `session_id` cookie exists, so the real signed-in page renders locally with no database when every `/api/*` request is answered in the browser. `harness/prod-fixtures.js` answers with production-like data (transactions from January 2026, month-end estimates before July); `harness/mock-fixtures.js` answers with the mock's own sample data so screenshots are comparable number for number.

1. `npm run dev -- --port 3000`
2. In a Playwright browser, run one harness file as a page function (with the Playwright MCP tool, pass `filename`; the tool only reads files inside the repository and its sandbox has no `URL` global, which the harness already avoids).
3. Open `http://localhost:3000/`, click Analytics, wait about 5 seconds (Recharts animates in), and screenshot at 1440 × 1000 and 390 × 844. Compare with `desktop.html` and `phone.html` served from `docs/design`.

## Intended deviations in the implementation

These differences come from real data or scope decisions recorded in the plan's Decision Log. Anything else that differs is a bug.

- Category bars are one color (the spending series) instead of a color per category, and there are no colored dots. Real detailed categories are open-ended.
- The hero change reads "since <date>", measured within the latest comparable stretch of history, not "over 6 months".
- The app shell keeps its header bar (page title, household switch, Refresh with "Updated … ago", Connect Account, avatar menu) and its sidebar without the mock's logo tile, "Settings" and "Personal plan" rows, and "Synced … · 9 accounts" subtitle. Phones keep the existing header (wordmark, title, then its buttons on a second row) and top navigation instead of the mock's large title and bottom tab bar.
- On phones the Normalized/Reported toggle sits on its own row under the chart legend, and every control is at least 44px tall.
- Cash-flow gridline steps follow the data (for example $5k steps up to $15k) rather than the mock's fixed ±$10k.
- With more than 12 months on screen (1Y, All), only a selected month carries value labels; hover, focus and the details panel carry the rest.
- There are no "All categories" or "Open in Transactions" links; no destination supports those filters yet.
- The category footer shows total spending, not a transaction count.
- The details panel lists up to 200 rows in a scrolling table, not six.
- The net-worth tooltip appears on hover and focus; the mock shows one frozen open.
- The hero's footnote reads "Liabilities are N% of assets." without the mock's sample sentence about estimated accounts; estimate disclosures live in the chart's "About this chart" section.
