# Analytics tab: reference mock

The reference for the Analytics tab (`docs/plans/analytics-tab.md`): a savings-rate card, a category-trends table, a year-to-date card and a recurring-charges table, scoped by one time-range control. The owner reviewed it on 2026-09-29 on a private design canvas (https://claude.ai/artifact/BqCLEaTd9dAx9sfRVm578b) and asked for the work to start. The sample data is generated inside the mock and is not real.

- `desktop.html` (1440 × 1940) and `phone.html` (390 × 2720) are static, self-contained renders of the 1Y state. Open them in a browser, or serve this folder (`python3 -m http.server 8931` from `docs/design`) and screenshot at those widths.
- `source/*.dc.html` are the canvas boards. Their markup uses `{{ }}` holes plus `<sc-for>` and `<sc-if>` over values from each board's `renderVals()`; the range control works when the canvas is played.
- `node docs/design/analytics-redesign/render.mjs docs/design/analytics-tab` re-renders the static files from the sources (the script is shared with the earlier redesign and takes the design folder as its argument).

## Checking the implementation against the mock

The app's auth middleware only checks that a UUID-shaped `session_id` cookie exists, so the real signed-in page renders locally with no database when every `/api/*` request is answered in the browser. The harness files live beside the earlier redesign in `docs/design/analytics-redesign/harness/`: `prod-fixtures.js` answers with production-like data (transactions from January 2025) and `mock-fixtures.js` with the mock's own sample data.

1. `npm run dev -- --port 3000`
2. In a Playwright browser, run one harness file as a page function (with the Playwright MCP tool, pass `filename`).
3. Open `http://localhost:3000/`, click Analytics, wait about 5 seconds (Recharts animates in), and screenshot at 1440 × 1000 and 390 × 844. Compare with `desktop.html` and `phone.html` served from `docs/design`.

## Intended deviations in the implementation

These differences come from real data or scope decisions recorded in the plan's Decision Log. Anything else that differs is a bug.

- The app shell keeps its header bar (page title, household switch, Refresh with "Updated … ago", Connect Account, avatar menu) and its sidebar. Phones keep the existing header and top navigation.
- The range control is the app's `SegmentedControl`, sharing the Dashboard's options (3M, 6M, 1Y, All).
- "About this chart" and "How detection works" are collapsed details blocks, not links.
- Recurring rows on phones show the cadence and next date as a caption under the merchant, and hide the last-charged column and the note's detail text.
- The savings-rate line is drawn with Recharts, like the net-worth line, so its tooltip appears on hover and focus; the mock shows one frozen open.
- Every control is at least 44 px tall on phones.
- With real data the window clips to the first month with data (January 2025) and comparisons appear only when the equal prior period is covered, so at 1Y the caption reads "History starts Jan 2025" until January 2027.
