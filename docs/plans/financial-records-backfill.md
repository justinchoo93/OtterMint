# Personal financial records backfill: 2026 first

This is a personal action checklist for collecting, importing, and verifying financial history. It is not an implementation ExecPlan; any substantial OtterMint feature work identified here should receive a separate ExecPlan following `docs/PLANS.md`.

## Goal and scope

Build a verified 2026 financial history in OtterMint, starting January 1 and ending at the latest available records. Reconcile completed statement periods first, keep the current partial period marked provisional, and finish the full calendar year once the final 2026 statements are available.

The first pass covers spending and income transactions, plus historical account balances for a monthly net-worth view. Collect investment activity exports alongside statements, but treat detailed historical investment performance as a later step. Backfill 2025 only after the 2026 process works and its remaining gaps are documented.

The user identified the currently connected OtterMint accounts as the starting inventory for 2026. Reuse that list rather than asking the user to recreate it. Account-by-account coverage has not yet been checked.

The oldest Amex record the user has found is dated January 10, 2025; whether this is a statement or transaction is not yet established, and it does not establish the opening date. The user thinks the Chase Reserve card was closed around that time, but its closure and final settlement dates remain unverified. Treat Chase as a likely 2025 stretch item, checking for any 2026 residual activity before excluding it from 2026. Keep Chase and Amex as separate accounts with their own histories.

## 1. Make the account inventory

- [ ] List every checking, savings, credit-card, brokerage, retirement, and loan account held at any point during 2026, including closed accounts. Include manual assets or liabilities already tracked in OtterMint if they belong in the net-worth history.
- [ ] Record each account's institution, nickname or last four digits, type, whether it is linked in OtterMint, and whether its historical records are accessible.
- [ ] Record opening and closing dates where known. Mark uncertain dates as unknown rather than guessing.
- [ ] Compare this list with OtterMint's accounts to identify missing or closed accounts that need a place for their history.

Use a private working copy of this table for actual account details:

| Account | Active dates | In OtterMint? | Transactions collected through | Balances collected through | Remaining action |
| --- | --- | --- | --- | --- | --- |
| Chase Reserve credit card | Possibly closed around January 2025; unverified | Check | Unknown | Unknown | Verify final settlement; likely 2025 stretch |
| Amex credit card | Oldest known record January 10, 2025; opening date unknown | Currently connected per user inventory | Unknown | Unknown | Collect 2026 activity and opening balance anchor |
| Other currently connected accounts | Confirm only where needed | Connected per user | Unknown | Unknown | Reuse OtterMint account list and check coverage |

## 2. Resolve the Chase and Amex timeline early

- [ ] Search personal email and available account documents for the Chase closure confirmation, Amex welcome or approval notice, and first/final statements. These establish the timeline; the first purchase alone does not establish an opening date.
- [ ] For Chase, collect all available 2026 transactions and statements through the final settlement of the account, including payments, fees, interest, or refunds after closure. If online records are unavailable, request historical records from Chase.
- [ ] For Amex, collect records from opening through the latest available date. If it opened before 2026, include a December 31, 2025 balance anchor where available.
- [ ] If Chase was closed and fully settled before January 1, 2026, mark it outside the 2026 scope and add it to the 2025 stretch list if applicable. If its final settlement extended into 2026, include that activity.
- [ ] Mark periods before an account opened or after it was fully settled as not applicable once verified. Do not label them as missing statements.

Do not delay collecting the other accounts while resolving these dates.

## 3. Collect the 2026 source records

Keep financial files in a private folder outside the repository. Preserve the original downloads; work from copies when converting formats.

Suggested layout: `Financial Records/2026/<institution>/<account nickname>/`, with separate `transactions` and `statements` folders. Give files clear date ranges, such as `2026-01-01_to_2026-09-25_transactions.csv`.

- [ ] Download transaction CSVs for January 1, 2026 through the latest available date, or from opening if later. When only shorter exports are available, collect each period and retain any overlap for duplicate checking.
- [ ] Download statements covering the same period. Prefer CSVs for importing transaction rows and statements for checking totals; use statement extraction only where exports are unavailable.
- [ ] Collect December 31, 2025 balances for accounts already open, using year-end statements or another dated record. This provides the opening anchor for 2026.
- [ ] Collect dated historical balances for checking, savings, cards, loans, investment accounts, and any manual assets or liabilities included in net worth.
- [ ] Download available investment activity exports, including trades, dividends, contributions, withdrawals, and fees. Save them for later processing even if performance reporting is deferred.
- [ ] Record unavailable files or dates in the inventory immediately.

Credit-card statements may close mid-month. Preserve their actual closing dates. A February 18 statement balance must not be presented as a February 28 balance. Calendar month-end figures need a record for that date or a verified reconstruction from complete activity; otherwise leave the date unresolved.

## 4. Establish what OtterMint already has

This is the first technical task once the inventory is ready. Produce a read-only coverage report for each account, showing transaction counts by month, earliest/latest dates, available balance snapshots, and known gaps. Compare that report with the source records. A month containing some transactions is not automatically complete, and a month with no transactions is not automatically missing.

Current repository observations from the planning discussion:

- Bank/card transactions sync through Plaid and use provider transaction IDs to avoid duplicate provider records. File imports will need additional matching for overlapping records from different sources.
- Investment activity requests the trailing 24 months on its first sync; subsequent syncs use recent stored activity. A normal refresh is not proof that older gaps have been repaired.
- Balance and holdings snapshots accumulate as the app captures them. Importing historical transactions alone does not create a verified historical net-worth series.
- The current account model ties transaction accounts to Plaid connections. Representing a closed account that cannot be linked may require implementation work before its records can be imported correctly.

Do not delete or relink an existing account merely to obtain older history. First determine the actual gaps and a supported way to fill them.

## 5. Pilot, verify, then expand

Start with one checking account and one credit card for one completed statement period. Choose periods with source documents and some overlap with existing OtterMint transactions so the pilot exercises duplicate handling.

- [ ] Preview additions, matched existing transactions, uncertain matches, and rejected rows before importing. Review amount signs, dates, account mapping, and currency.
- [ ] Require imports to record their source and batch, support undoing that batch safely, and avoid adding duplicates when rerun. Keep uncertain matches for review; two purchases with the same amount and date can be legitimate separate transactions.
- [ ] Check that later Plaid activity can match imported records without doubling them or losing corrections.
- [ ] Reconcile the pilot against statement opening/closing balances and activity totals, accounting for the account's sign convention.
- [ ] Verify that transfers and credit-card payments do not inflate spending or income. Check refunds, interest, fees, and pending-versus-posted activity explicitly.
- [ ] Preserve configured merchant exclusions. Document any resulting reconciliation difference without copying excluded merchant details into the repository.
- [ ] Once the pilot passes, process the remaining accounts period by period, recording verification status as each finishes.

If the necessary import, matching, rollback, or closed-account support is missing, write a separate implementation ExecPlan before loading the full dataset.

## 6. Add monthly balance history

Prefer verified calendar month-end account balances for a useful first version of historical net worth. Retain the source document and actual observation date for each figure. Label any reconstructed balance and how it was derived; leave unsupported dates unknown.

Check account coverage across each monthly total so a missing brokerage or card does not create an artificial jump in net worth. Historical manual assets and liabilities need dated values too; today's value should not silently be copied into the past. Detailed daily balances and investment returns can follow after the monthly history is trustworthy.

## 7. Finish 2026, then consider 2025

The initial 2026 backfill is complete when every in-scope account and completed period is either verified or has an explicit unresolved gap; imports can be repeated without duplicates; transfers/payments are classified correctly; and historical net-worth values show their actual coverage. The current partial period remains provisional until its records can be reconciled. An unresolved gap remains visible and is not counted as verified coverage.

- [ ] Review the final coverage report and resolve or document every discrepancy.
- [ ] Continue saving new monthly records through year-end, then reconcile the final 2026 period when statements are available.
- [ ] Start the 2025 stretch once the 2026 process is reliable. Reuse the same collection and verification workflow, beginning with a December 31, 2024 opening anchor and accounts active during 2025.
- [ ] Collect older Chase records early if they are available, even while 2025 imports remain deferred. Preserve any other older records that are easy to download during the 2026 collection pass.

## First sitting

Spend the first session making the account list, finding the Chase/Amex timeline evidence, and downloading one checking-account export and one credit-card export with their matching statements. The next technical deliverable is the read-only OtterMint coverage report; the next import deliverable is a verified pilot for those two accounts.

Created September 25, 2026. Scope decisions: prioritize 2026; retain 2025 as a stretch; verify the Chase closure and Amex opening dates; use monthly balance history as the initial net-worth target.

Guided-session update: the user confirmed that currently connected accounts are the starting inventory and supplied the tentative January 2025 Amex/Chase timeline. Next user action: check the available 2026 transaction export date range and formats for Amex.

## Collection progress: September 25, 2026

Records are stored outside the repository at `~/code/personal/bank_statements/`, with `AMEX/` and `CHASE/<account>/` subdirectories. The previous `AMEX statements` folder was moved into `bank_statements/AMEX`.

Collected 21 Amex CSV statement periods, January 2025 through September 2026, and 135 Chase PDFs across seven accounts for 2025 and available 2026 periods. Chase files have been checked against the download manifest for presence and PDF headers; financial reconciliation has not started. A private `CHASE/README.md` and `CHASE/download-manifest.json` contain account-level counts, closing dates, file paths, and checksums.

Sapphire Reserve lists 11 statements in 2025, including December, with October absent; its 2026 view explicitly reports no statements. The tentative January 2025 closure date remains unverified. Freedom lists no statements in either year. The debit-card entry showed ATM/branch receipts rather than monthly statements and was excluded. Investment-account statements are collected through August 2026.

Next guided step: review transaction coverage and import requirements using the collected records. Downloaded statements are not yet imported or reconciled in OtterMint.

## Collection and coverage update: September 26, 2026

Statement collection now includes Bank of America, Citi, Schwab, Marcus, and both Vanguard employer plans in the private `bank_statements` archive. Collection is sufficient to proceed; it does not certify complete financial coverage. The user accepted proceeding without BofA August 2026's statement, recalls Citi opening in February 2025, and deferred Sapphire October 2025. Do not pursue those documents as blockers. The user's collection scope is statements only; additional exports and email searches above are deferred.

A read-only NAS query produced `bank_statements/coverage/ottermint-2026-coverage.csv` and its private README, with account/month counts and dates for posted transactions, investment activity, and balance snapshots. Bank/card history begins around April–May 2026; account balance snapshots begin August 15. Existing rows alone do not establish complete periods.

Next step: prepare a local 2026 pilot preview from Amex CSV and one Chase checking statement, mapping to existing accounts and identifying overlaps before imports. Keep investment and manual Vanguard balance reconstruction separate until their source coverage and transition are reconciled. No financial records have been imported or database records modified.

## One-time backfill applied: September 26, 2026

The user chose a guarded one-time backfill instead of reusable import support, accepted the future reconnect/full-resync reconciliation limitation, and authorized proceeding. This supersedes the earlier requirement to implement automatic future cross-source matching before this import. No application code, schema, or reconnect behavior was changed.

Added and verified 326 historical bank/card transactions across seven existing linked accounts. An 18-row Amex/checking pilot passed first. All 555 pre-existing transaction rows were preserved. Source checksums, source rows, stable imported IDs, and category rationale are recorded in the private batch manifest. Ninety-three imported rows remain explicitly uncategorized. Merchant exclusions were rechecked against production immediately before applying. Import reruns and undo were tested inside rolled-back database transactions.

Added and verified 106 historical account balance observations across ten linked accounts, preserving all 242 existing balance rows. Evidence retains actual statement dates; 45 local month-end observations were also reconstructed only from fully reconciled posted activity, with both opening-forward and closing-backward calculations agreeing. Not every local observation was imported: existing-period records, unmapped accounts, and unsupported manual-account history were retained separately. The application database role can see the imported records, and the NAS app/database health check passes. Browser verification of the dashboard was unavailable because Firefox could not resolve the documented hostname.

BofA's apparent August gap is resolved: its next statement covers July 20 through September 4. Two Amex benefit credits had later Plaid postings and were not duplicated. The 62 unique bank/card PDFs used in the 2026 pass reconcile, as do 37 investment balance summaries. Amex CSVs have no independent balance control.

The private result and recovery guide is `~/code/personal/bank_statements/backfill/README.md`. That directory contains the original and final user-scoped database exports, transaction and balance manifests, applied SQL, rehearsal SQL, guarded undo SQL, source reconciliation checks, and current coverage results. None of those financial records belong in this repository.

Remaining work is specifically scoped: obtain Amex PDF balance anchors (the user was asked to reopen the signed-in statements tab); decide how to represent dated Vanguard manual-account balances without inventing aggregate net-worth history; retain source-only closed/unlinked account evidence until there is an explicit mapping. Detailed historical investment activity and 2025 transaction imports remain deferred. The current cash-flow dashboard requests six months, although the API supports longer windows; importing January–March does not change that display setting. Per-account balance imports alone do not populate historical aggregate net-worth snapshots.

## Amex balance completion: September 26, 2026

The user reopened the signed-in statement page. Collected ten Amex PDFs (December 2025 through September 2026) into the private `AMEX/PDF` folder. Every CSV net activity sum matches its PDF statement balance change, every combined-account summary reconciles, and consecutive closing/opening balances agree. No transaction correction was required.

Added eight January–August Amex statement-closing balances after rehearsing repeat insertion and undo. All 348 prior balance rows and all 881 transaction rows remained unchanged. Total historical additions now stand at 326 transactions and 114 account balances across eleven linked accounts. Actual statement closing dates are preserved; unsupported calendar month-end balances are not inferred from transaction dates.

Amex no longer requires user action. Vanguard manual-account history, source-only account mapping, and the aggregate historical net-worth chart remain separate unresolved coverage/model limitations documented in the private result guide. The dedicated Amex batch manifest, PDF reconciliation checks, result receipt, and guarded undo script are retained outside the repository.

## Retirement and aggregate coverage review: September 26, 2026

Completed a source-based review of retirement account transitions and exact month-end coverage. The Schwab transfer matches on date and amount. The employer-plan rollover has an unresolved difference retained in the private reconciliation report; no explanation was invented. An unlinked savings account has a nonzero balance, and the user has been asked whether to represent it manually. No account or aggregate net-worth records were created during this review.

Private reports `backfill/retirement-reconciliation.json` and `backfill/net-worth-coverage.{json,md}` record findings and remaining date-specific evidence gaps. There is insufficient exact-date coverage to publish complete historical monthly net worth. Vanguard custom statement collection is pending access to the signed-in statement page. The bank/card transaction backfill and 114 balance additions remain verified. Continue independent work without confirmation; wait only for the outstanding account-representation decision and necessary statement access.

## Vanguard dashboard follow-up and scope decision

The user declined adding the unlinked Chase savings account; retain its statements in the archive and exclude it from application backfill scope. Vanguard dashboard custom performance dates supplied month-end values for January–August. Old-plan activity supports zero balances after its distribution. Quarterly dashboard values agree with statement anchors. The rollover crossed February month-end before being received in March; any aggregate wealth reconstruction must explicitly account for funds in transit rather than show an artificial loss. Source evidence and verification remain in the private archive. No database writes were made, and Vanguard access is no longer a pending user action. Historical manual-account storage and the remaining card/account coverage gaps still prevent publishing complete aggregate history.

## Published and applied net-worth history

The user approved deployment on September 26. App commit 93cfb8b and migration 0014 are live. Added six labeled January–June aggregate estimates with explicit source-date assumptions and transfer-in-transit treatment, preserving all 41 original aggregate snapshots and all transaction/account-balance records. Analytics now offers a one-year view and expandable estimate explanations. The private result receipt and guarded undo remain in the statement archive. The 2026 backfill through currently available records is complete with documented estimate limits; 2025 remains a stretch and detailed historical investment activity is deferred.
