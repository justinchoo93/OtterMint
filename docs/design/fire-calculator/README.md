# FIRE calculator: approved mock

The reference for the FIRE destination (`docs/plans/fire-calculator.md`). The owner approved version 3 of the interactive mock on 2026-10-09 on a private design canvas (https://claude.ai/artifact/5hJxDbfdQ86JT5STg6wGPB) and asked for it to be implemented. The sample household is not real. The OtterMint balances, take-home pay and spending are illustrative. The four typed accounts (River $15k, the partner's Roth IRA $20k, 457(b) $60k and PERS 3 investment account $60k) use round balances the owner gave that day.

- `source/desktop.dc.html` is the canvas board. It is one fluid page that also lays out at phone width, so there is no phone board. Its markup uses `{{ }}` holes plus `<sc-for>` and `<sc-if>` over values from `renderVals()`. In the canvas every input, the slider and the chart hover work.
- `desktop.html` is a static, self-contained render of the default state, with the headline "Jul 2033". Open it in a browser, or serve `docs/design` (`python3 -m http.server 8931`) and screenshot at 1440 and 390 wide.
- `node docs/design/analytics-redesign/render.mjs docs/design/fire-calculator` re-renders it from the source.

## Checking the implementation against the mock

`harness/mock-fixtures.js` (Milestone 5 of the plan) answers every `/api/*` request with this mock's sample household, so the real page renders locally with no database. The approach is the same as `docs/design/analytics-redesign/README.md`: run `npm run dev`, apply the harness in a Playwright browser as a page function, open FIRE, and screenshot at 1440 × 1000 and 390 × 844.

## Intended deviations in the implementation

These come from real data or from decisions in the plan's Decision Log. Anything else that differs is a bug.

- The app shell keeps its own header (page title, household switch, Refresh, Connect Account, avatar) and sidebar. Phones keep the existing header and top navigation.
- OtterMint accounts are listed one by one, not as a "Brokerage (3 accounts)" row. Each one has a type, owner and yearly contribution the owner can change, and checking and savings accounts start as "Not counted".
- The household's cash saving goes into a "New savings" brokerage account in the projection, not into one OtterMint account. "Cash saved per year" is an assumption field, filled from OtterMint's last twelve months until the owner changes it.
- Typed accounts have editable names, owners and types, and a remove button. "Add an account" adds a blank row instead of a fixed "New brokerage account".
- The PERS 3 investment account takes a typed yearly contribution. The mock's "10% of salary" calculated field is gone. The pension can belong to you, your partner or nobody.
- The account types add cash (0% return, spent first) and traditional IRA (opens at 59½, no Rule of 55) to the mock's set.
- Roth contributions are entered per person, as in the mock, and split across that person's Roth accounts by balance.
- The chart is Recharts, like the other charts in the app. Hover and keyboard both show the two-line tooltip.
- Edits are saved to the owner's login after a short pause. A small status says "Saved", "Saving…" or "Couldn't save".
