# Period picker: approved mock

The reference for `docs/plans/period-picker.md`. The owner reviewed it on 2026-10-03 on a private design canvas (https://claude.ai/artifact/EyaPtP3r23ijd6mpPeE9Nc). The sample data is generated inside each board and is not real.

- `boards/Dashboard.dc.html` (1360 wide): the period bar above the net worth card, tiles and cash flow chart, opening on 6M with the picker closed.
- `boards/Analytics.dc.html` (1360 wide): the same bar with the picker open on a custom range, March to August 2025.
- `boards/Phone.dc.html` (390 × 844): the picker as a bottom sheet, opening on month to date.

The boards are design-canvas files: markup with `{{ }}` holes plus `<sc-for>` and `<sc-if>` over the values each board's `renderVals()` returns. The period logic at the bottom of each board (`resolve`, the stepper, the month grid cells and the drag handlers) is the behavior the plan specifies; read it when the plan's prose leaves a detail open.

Milestone 1 of the plan adds `render.mjs`, the static renders and the list of intended deviations to this folder.
