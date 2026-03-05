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

## ~~Bug 6: Snapshot math overstates assets via Math.abs~~ RESOLVED
- **File**: `src/lib/compute-snapshot.ts:32`
- **Description**: `Math.abs` is applied to all account balances by type. Negative depository/investment balances are converted into positive assets, which can materially overstate assets and net worth in saved snapshots.
- **Fix**: Removed `Math.abs()` from `sumByType` and `manualLiabilitiesTotal`.

## Bug 7: Refresh doesn't sync new or removed Plaid accounts
- **File**: `src/app/api/accounts/refresh/route.ts:50`
- **Description**: Refresh only updates existing account rows; it never inserts newly discovered Plaid accounts or removes closed ones. This can leave stale data and break transaction/holding inserts via FK constraints for unseen account IDs.

## ~~Bug 8: Link token only requests Transactions product, not Investments~~ RESOLVED
- **File**: `src/app/api/plaid/create-link-token/route.ts:10`
- **Description**: Link token creation only requests `Products.Transactions`, but the refresh pipeline calls `investmentsHoldingsGet`. Without enabling the investments product at link time, holdings sync will fail for linked items.
- **Fix**: Added `Products.Investments` to the products array.

## Bug 9: Invalid `days` query param causes 500 on net-worth endpoint
- **File**: `src/app/api/net-worth/route.ts:22`
- **Description**: `days` query param is not validated for NaN/invalid values. Inputs like `days=abc` create an invalid date and throw, causing an avoidable 500.

## Bug 10: Invalid `limit` query param causes 500 on transactions endpoint
- **File**: `src/app/api/transactions/route.ts:22`
- **Description**: `limit` query param is not validated for invalid/negative values. Non-numeric input propagates NaN into `.limit()` and triggers an avoidable 500.

## Bug 11: Login endpoint accepts non-string email/password
- **File**: `src/app/api/auth/login/route.ts:22`
- **Description**: `email` and `password` are only checked for truthiness, not type. A non-string payload (e.g. `{ "email": {}, "password": {} }`) throws at `email.toLowerCase()` or inside bcrypt, producing a 500 instead of 400.

## Bug 12: Password change doesn't validate currentPassword type
- **File**: `src/app/api/auth/me/route.ts:91`
- **Description**: Password-change flow does not validate `currentPassword` type before passing to `verifyPassword()`. Truthy non-string input triggers a runtime error and returns 500.

## Bug 13: SpendingChart uses personal transactions in household mode
- **File**: `src/components/dashboard/SpendingChart.tsx:53`
- **Description**: `SpendingChart` always fetches `/api/transactions` (personal). When rendered in the household tab, it mixes household net worth with personal-only spending data.
