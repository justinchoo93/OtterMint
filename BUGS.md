# OtterFin Bugs

## Bug 1: Plaid Link reopens on refresh after dismissing
- **Steps to reproduce**: Click "+Connect Account", dismiss the Plaid Link modal without completing the flow, then click "Refresh"
- **Expected**: Refresh should just refresh account data
- **Actual**: Plaid Link popup reappears

## Bug 2: Plaid Link reopens after successfully adding an account
- **Steps to reproduce**: Click "+Connect Account", complete the full Plaid Link flow successfully, account is added
- **Expected**: Modal closes, dashboard shows the new account
- **Actual**: Plaid Link modal pops up again after completion

## Bug 3: Refresh button does not update "last refreshed" time
- **Steps to reproduce**: Click "Refresh" button
- **Expected**: The displayed last refreshed timestamp should update
- **Actual**: Timestamp does not change

## Bug 4: Plaid Reauth modal reopens after dismissing
- **File**: `src/components/plaid/PlaidReauthButton.tsx:49`
- **Description**: Same root cause as Bug 1/2 — `open()` is called during render when `linkToken` is set, and the token is only cleared on success. Dismissing the reauth flow leaves the token set, so rerenders reopen the modal.

## Bug 5: Malformed auth header causes 500 instead of 401
- **File**: `src/middleware.ts:9`
- **Description**: `atob(encoded)` is unguarded. A malformed Basic auth header will throw and produce a 500 instead of a 401, creating an easy denial-of-service path.

## Bug 6: Snapshot math overstates assets via Math.abs
- **File**: `src/lib/compute-snapshot.ts:32`
- **Description**: `Math.abs` is applied to all account balances by type. Negative depository/investment balances are converted into positive assets, which can materially overstate assets and net worth in saved snapshots.

## Bug 7: Refresh doesn't sync new or removed Plaid accounts
- **File**: `src/app/api/accounts/refresh/route.ts:50`
- **Description**: Refresh only updates existing account rows; it never inserts newly discovered Plaid accounts or removes closed ones. This can leave stale data and break transaction/holding inserts via FK constraints for unseen account IDs.

## Bug 8: Link token only requests Transactions product, not Investments
- **File**: `src/app/api/plaid/create-link-token/route.ts:10`
- **Description**: Link token creation only requests `Products.Transactions`, but the refresh pipeline calls `investmentsHoldingsGet`. Without enabling the investments product at link time, holdings sync will fail for linked items.

## Bug 9: Invalid `days` query param causes 500 on net-worth endpoint
- **File**: `src/app/api/net-worth/route.ts:22`
- **Description**: `days` query param is not validated for NaN/invalid values. Inputs like `days=abc` create an invalid date and throw, causing an avoidable 500.

## Bug 10: Invalid `limit` query param causes 500 on transactions endpoint
- **File**: `src/app/api/transactions/route.ts:22`
- **Description**: `limit` query param is not validated for invalid/negative values. Non-numeric input propagates NaN into `.limit()` and triggers an avoidable 500.
