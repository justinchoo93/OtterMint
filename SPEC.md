# OtterFin Feature Spec

Personal finance dashboard that aggregates bank, investment, and retirement accounts to provide a unified view of household finances.

## Authentication

### Basic Auth Login
- All routes are protected by HTTP Basic Authentication
- Users are prompted for username/password on first visit
- Credentials are validated against `AUTH_USERNAME` and `AUTH_PASSWORD` env vars
- Static assets (_next/static, _next/image, favicon.ico) are excluded from auth

---

## Plaid Account Linking

### Connect a new bank account
1. User clicks "+ Connect Account" button in the header
2. Plaid Link modal opens (via `react-plaid-link`)
3. User selects a financial institution
4. User authenticates with their bank credentials
5. On success, public token is exchanged for an access token via `/api/plaid/exchange-token`
6. Access token is encrypted (AES-256-GCM) and stored in the database
7. Initial account balances are fetched and stored
8. Dashboard refreshes to show the newly linked accounts

### Re-authenticate a stale connection
1. When a Plaid item enters an error state (e.g., `ITEM_LOGIN_REQUIRED`), an error banner appears on the affected accounts
2. User clicks the "Re-authenticate" button on the error banner
3. Plaid Link opens in update mode with the existing access token
4. User re-authenticates with their bank
5. On success, the error state is cleared and data syncs resume

---

## Dashboard Overview

### Net Worth Card
- Displays total net worth (assets minus liabilities)
- Shows total assets and total liabilities as separate figures
- Includes account count
- Combines both Plaid-connected and manual accounts in the calculation
- Asset types: depository (checking/savings), investment, manual assets
- Liability types: credit cards, loans, manual liabilities

### Net Worth Chart
- Line chart (Recharts) showing net worth over the last 90 days
- Three lines: net worth (solid), assets (dashed green), liabilities (dashed red)
- Tooltip on hover shows values for a given date
- Only renders if there are 2+ data points
- Data sourced from daily `net_worth_snapshots` table

### Spending Chart
- Horizontal bar chart showing spending by category (top 8 categories)
- Pulls last 200 transactions
- Filters to only expenses (positive amounts, non-pending)
- Groups by Plaid category and sorts by total descending
- Color-coded bars per category
- Only renders if there are expenses to show

---

## Accounts Panel

### View connected accounts
- Accounts are grouped by type: Depository, Credit, Investment, Loan, Other
- Each group has a color-coded header
- Each account row shows: name, institution, last 4 digits (mask), current balance, available balance
- Hover effect on account rows
- Empty state message when no accounts are connected

### Account error handling
- Accounts with connection errors show an error banner at the top of the group
- Banner includes the institution name and a re-authenticate button
- Error state is tracked per Plaid item (not per individual account)

---

## Transactions Feed

### View recent transactions
- Scrollable list of the 50 most recent transactions
- Sorted by date (newest first), then by ID
- Each row shows: merchant name (or transaction name), category, amount, date
- Relative date formatting: "Today", "Yesterday", weekday name, or formatted date
- Pending transactions show a "Pending" badge
- Credits (negative amounts) are shown in green
- Plaid category codes are mapped to human-readable labels
- Empty state message when no transactions exist

---

## Holdings Panel

### View investment holdings
- Table showing all investment holdings across all linked investment accounts
- Columns: name, ticker symbol, quantity, price, value, gain/loss
- Shows total portfolio value, total cost basis, and total gain/loss at the top
- Gain/loss is color-coded: green for positive, red for negative
- Responsive layout: quantity and price columns hidden on mobile
- Loading skeleton while fetching
- Only renders if there are holdings to show

---

## Manual Accounts

### Add a manual account
1. User clicks "+ Add" button in the Manual Accounts panel
2. Form appears with fields: Name, Type (Asset/Liability dropdown), Subtype (optional), Balance, Notes (optional)
3. User fills in the form and clicks "Add Account"
4. Account is created via `POST /api/manual-accounts`
5. Panel refreshes to show the new account

### Edit a manual account
1. User hovers over an account row to reveal the "Edit" button
2. Clicking "Edit" opens the form pre-populated with the account's data
3. User modifies fields and clicks "Update"
4. Account is updated via `PUT /api/manual-accounts`

### Delete a manual account
1. User hovers over an account row to reveal the "Del" button
2. Clicking "Del" immediately deletes the account via `DELETE /api/manual-accounts?id={id}`
3. No confirmation dialog

### Manual account display
- Accounts are grouped into Assets and Liabilities
- Each group shows a subtotal
- Net total (assets minus liabilities) shown at the bottom
- Color-coded badges: green for asset, red for liability
- Subtype and notes displayed if present

---

## Data Refresh

### Refresh all accounts
1. User clicks the "Refresh" button in the header
2. Button shows spinning icon while refreshing
3. `POST /api/accounts/refresh` is called
4. For each Plaid item (skipping items refreshed within the last 2 hours):
   - Fetches updated account balances from Plaid
   - Syncs new/modified/removed transactions (incremental via cursor)
   - Syncs investment holdings for investment accounts (full replace)
   - Handles Plaid errors (marks items with error codes if needed)
5. Computes and saves a net worth snapshot for today (upserts by date)
6. Dashboard data refreshes on completion
7. "Last updated" timestamp displays relative time (just now, Xm ago, Xh ago, date)

### Transaction sync (incremental)
- Uses Plaid Transactions Sync API with cursor-based pagination
- Processes added, modified, and removed transactions
- Uses upsert (insert or update on conflict) for added/modified
- Deletes removed transactions
- Cursor is persisted per Plaid item for next sync

### Holdings sync (full replace)
- Fetches all holdings and securities from Plaid
- Deletes all existing holdings for the synced accounts
- Inserts fresh holdings with current prices and values
- Maps securities to holdings for name/ticker resolution

---

## Data Model

### Owner tagging
- `plaid_items` table has an `owner` field (defaults to "justin")
- `manual_accounts` table has an `owner` field (defaults to "justin")
- `accounts` table does NOT have an owner field (inherits via plaid_item foreign key)
- Owner is set when creating manual accounts

### Net worth snapshots
- One snapshot per day (upserted by date)
- Stores breakdown: depository, credit, investment, loan, manual assets, manual liabilities
- Stores totals: total assets, total liabilities, net worth
- Used by the net worth chart for historical trending

### Encryption
- Plaid access tokens are encrypted at rest using AES-256-GCM
- Encryption key sourced from `ENCRYPTION_KEY` env var (64-char hex = 32 bytes)
- Each encryption generates a unique 12-byte IV
- Stored format: `base64(IV):base64(authTag):base64(ciphertext)`

---

## Tech Stack
- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, Recharts
- **Backend**: Next.js API routes
- **Database**: Supabase (PostgreSQL) via Drizzle ORM + postgres.js
- **Financial data**: Plaid API (sandbox/production)
- **Auth**: HTTP Basic Authentication (middleware)
- **Fonts**: DM Sans (body), JetBrains Mono (monospace)
