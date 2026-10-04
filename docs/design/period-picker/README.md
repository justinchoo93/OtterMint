# Period picker: approved mock

The reference for `docs/plans/period-picker.md`. The owner reviewed it on 2026-10-03 on a private design canvas (https://claude.ai/artifact/EyaPtP3r23ijd6mpPeE9Nc). The sample data is generated inside each board and is not real.

- `boards/Dashboard.dc.html` (1360 wide): the period bar above the net worth card, tiles and cash flow chart, opening on 6M with the picker closed.
- `boards/Analytics.dc.html` (1360 wide): the same bar with the picker open on a custom range, March to August 2025.
- `boards/Phone.dc.html` (390 × 844): the picker as a bottom sheet, opening on month to date.

The boards are design-canvas files: markup with `{{ }}` holes plus `<sc-for>` and `<sc-if>` over the values each board's `renderVals()` returns. The period logic at the bottom of each board (`resolve`, the stepper, the month grid cells and the drag handlers) is the behavior the plan specifies; read it when the plan's prose leaves a detail open.

`desktop.html`, `analytics.html` and `phone.html` are static, self-contained renders of the boards. Open them in a browser. `render.mjs` re-renders them: `node docs/design/period-picker/render.mjs` from the repository root.

## Checking the implementation

The real pages render locally with no database (see `docs/design/analytics-redesign/README.md`). Start `npm run dev -- --port 3000`, then in a Playwright browser run a fixtures file and a check file, each as a page function:

- `docs/design/analytics-redesign/harness/prod-fixtures.js`, then `harness/check-dashboard.js` and `harness/check-analytics.js`.
- `docs/design/investments-redesign/harness/mock-fixtures.js`, then `harness/check-investments.js`.

Both fixtures pin the page's clock to the last day of their data, because the picker reads today's date. Each check walks the plan's acceptance scenarios, returns what it observed as JSON, and writes screenshots to `evidence/` (`desktop-…` at 640 px and wider, `phone-…` below; the output path at the top of each script is absolute, so change it when the checkout moves). Run each at 1440 × 1000 and 390 × 844. `check-analytics.js` also performs a real touch drag through Chromium's debugging protocol.

## Intended deviations in the implementation

Anything else that differs from the boards is a bug.

- The app keeps its real header, sidebar and cards; the boards simplify them.
- The cash flow chart keeps its diverging form (income above the line, spending and saving below) and its Saved series.
- The net worth card keeps its assets and liabilities block. Its change reads "since <date>" for a period that reaches today and names both ends ("Feb 28–Mar 31") for one that ended earlier.
- A past period with no net worth history shows "No net worth history for this period." The boards' sample data has history for every month.
- The Analytics page keeps its real Year to date and Recurring charges cards where the board shows a note card.
- The drag is tracked with `pointermove` and hit-testing, not `pointerenter` as in the boards' script; the behavior is the same.
- Every figure on the boards is a generated sample.
