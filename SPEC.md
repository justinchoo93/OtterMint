# OtterMint Feature Spec

Personal finance dashboard that aggregates bank, investment, and retirement accounts to provide a unified view of household finances.

## Authentication

### Registration
- Route: `/register`
- Fields: Name, Email, Password, Confirm password
- Password minimum 8 characters, validated on blur
- On success: creates session, redirects to `/` with onboarding banner
- If URL contains `?invite=[token]`: redirects to `/invite/[token]` after registration

### Login
- Route: `/login`
- Fields: Email, Password
- On failure: inline error "Incorrect email or password"
- After 5 failures: lockout with timer
- On success: creates session, redirects to `/` (or `?redirect=` destination)
- If user has MFA enabled: redirects to `/auth/mfa-verify` with session in pending state

### MFA Verification (post-login)
- Route: `/auth/mfa-verify`
- Two input modes: authenticator app (6-digit numeric) or recovery code (8-char hex)
- Toggle between modes via link
- Recovery codes are single-use (consumed on verification)
- On success: session fully established, redirects to dashboard

### Session Management
- Sessions stored server-side in `sessions` table
- Cookie: `session_id`, HttpOnly, Secure, SameSite=Lax, 30-day max age
- `POST /api/auth/logout` clears session and cookie

---

## Two-Factor Authentication (MFA)

### Setup flow
1. User clicks "Set up two-factor authentication" in Profile settings
2. `POST /api/auth/mfa/setup` generates TOTP secret, QR code, and 8 recovery codes
3. QR code and recovery codes displayed (recovery codes shown once only)
4. User enters 6-digit code from authenticator app to verify
5. `POST /api/auth/mfa/verify-setup` validates code and enables MFA

### Disable flow
1. User clicks "Disable two-factor authentication" in Profile settings
2. Must enter a valid TOTP code to confirm (prevents unauthorized removal)
3. `POST /api/auth/mfa/disable` clears MFA data from user record

### Security details
- TOTP secret: 20 bytes, encrypted at rest (AES-256-GCM)
- Recovery codes: 8 codes, 4-byte hex each, bcrypt-hashed (cost 10)
- Validation window: 1 period (±30 seconds)
- Recovery codes consumed on use (removed from stored list)

---

## Plaid Account Linking

### Connect a new bank account
1. User clicks "+ Connect Account" button in the header
2. `POST /api/plaid/create-link-token` creates a Plaid Link token
   - Products: `[Transactions]` (required)
   - Optional products: `[Investments]` (pulled when available, not required)
3. Plaid Link modal opens (via `react-plaid-link`)
4. User selects a financial institution and authenticates
5. On success, public token is exchanged for an access token via `/api/plaid/exchange-token`
6. Access token is encrypted (AES-256-GCM) and stored in the database
7. Initial account balances are fetched and stored
8. Dashboard refreshes to show the newly linked accounts

### Re-authenticate a stale connection
1. When a Plaid item enters an error state (e.g., `ITEM_LOGIN_REQUIRED`), an error banner appears
2. User clicks "Re-authenticate" button
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
- Data sourced from daily `user_net_worth_snapshots` table

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
- Each group has a color-coded header with group subtotal
- Each account row shows: name, institution, last 4 digits (mask), current balance, available balance
- Hover effect on account rows
- Empty state message when no accounts are connected

### Account error handling
- Accounts with connection errors show an error banner at the top of the panel
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

## Groups & Household

### Create a group
- Route: `/settings/group`
- User clicks "Create group" to become the owner
- Generates an invite link (7-day expiry, regenerable)

### Invite members
- Owner shares invite link or enters email address
- Invite link route: `/invite/[token]`
- Invitee sees sharing disclosure: "all of your connected accounts and transactions will be visible to group members"
- States: logged in (accept/decline), already in group (go to settings), not logged in (sign in/register), expired/invalid

### Member management
- Owner: can invite, remove members, regenerate invite link, disband group
- Member: can view group, leave group
- Remove/disband/leave all require confirmation dialogs

### Household dashboard tab
- "Household" tab appears in header when user is in a group
- Combined net worth card with member breakdown
- Accounts grouped by member, then by type within each member
- Combined transaction feed with member initials badges ([JK], [SK])
- Combined net worth chart (same 90-day Recharts component)

### Phase 1 sharing model
- All-or-nothing: joining a group shares all accounts and transactions
- No per-account toggles (planned for Phase 2)
- Static "Shared Data" info section in group settings as placeholder for future controls

---

## External Share Links

### Create a share link
- Route: `/settings/sharing`
- Optional label (e.g., "For accountant")
- Three independent data toggles:
  - Net worth overview (default: on)
  - Account balances (default: off)
  - Transactions (default: off)
- At least one category must be selected to create
- `POST /api/share-links` generates a 256-bit random token (base64url)

### Manage share links
- Active links listed with label, included data badges, expiration date
- "Copy URL" button (copies `{origin}/shared/{token}`, shows "Copied!" for 2s)
- "Revoke" button with confirmation dialog
- Revocation is immediate (soft delete via `revokedAt` timestamp)

### Public shared view
- Route: `/shared/[token]` (no authentication required)
- Displays user's display name and link label
- Sections conditionally rendered based on link permissions:
  - Net worth: latest snapshot + 90-day history
  - Accounts: Plaid accounts (name, type, mask, balance, institution) + manual accounts
  - Transactions: last 200, most recent first (date, name, merchant, amount, category)
- Footer: "Read-only view - Powered by OtterMint"
- Revoked links: "This link is no longer available"
- Expired links: 410 Gone
- Invalid tokens: 404

### Security
- Token: 256-bit cryptographically random, base64url encoded
- No sensitive data exposed (no access tokens, no full account numbers)
- Account masks show only last 4 digits
- Optional expiration, checked on every access
- Immediate revocation via soft delete

---

## Profile & Settings

### Route: `/settings/profile`

### Identity section
- Display name (editable text input)
- Email (read-only)
- [Save changes] button

### Security section
- Change password: expands inline with current/new/confirm fields
- Two-factor authentication: setup/disable flow (see MFA section above)
  - "Enabled" badge in section header when active

### Account deletion
- "Delete account" in danger zone section
- Confirmation required
- Revokes all Plaid access tokens before deletion
- Cascading delete: sessions, plaid items, accounts, transactions, holdings,
  manual accounts, share links, net worth snapshots, group memberships
- Clears session cookie, redirects to `/login`

### Sessions section
- [Sign out] — ends current session, redirects to `/login`
- [Sign out all devices] — invalidates all active sessions

---

## Privacy Policy

### Route: `/privacy` (no authentication required)

Static page covering:
1. What We Collect
2. How We Store Your Data (AES-256-GCM, bcrypt, TLS)
3. How We Use Your Data
4. Third-Party Services (Plaid)
5. Data Sharing (no selling, no third-party sharing)
6. Your Rights (access, deletion, export)
7. Data Retention (deleted on account deletion, sessions expire after 30 days)
8. Security (MFA, encryption at rest and in transit)
9. Contact

---

## Data Model

### User ownership
- `plaid_items` table has a `userId` foreign key to `users`
- `manual_accounts` table has a `userId` foreign key to `users`
- `accounts` inherit user ownership transitively through `plaid_items.userId`
- Tenant isolation is enforced at the application layer via these
  `userId`-scoped queries. Database-enforced row-level security (RLS) is **not
  yet active** as a defense-in-depth second layer and is tracked in
  `docs/exec_plans/tenant-isolation-rls.md`.

### Net worth snapshots
- `user_net_worth_snapshots`: one per user per day (upserted)
- `group_net_worth_snapshots`: one per group per day (sum of all members)
- Stores breakdown: depository, credit, investment, loan, manual assets, manual liabilities
- Stores totals: total assets, total liabilities, net worth

### Encryption
- Plaid access tokens: AES-256-GCM, stored as `base64(IV):base64(authTag):base64(ciphertext)`
- TOTP secrets: same AES-256-GCM encryption
- Passwords: bcrypt, cost factor 12
- Recovery codes: bcrypt, cost factor 10
- Encryption key: `ENCRYPTION_KEY` env var (64-char hex = 32 bytes)

---

## Tech Stack
- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, Recharts
- **Backend**: Next.js API routes
- **Database**: Supabase (PostgreSQL) via Drizzle ORM + postgres.js
- **Financial data**: Plaid API (sandbox/production)
- **Auth**: Session-based (HttpOnly cookie + server-side session table)
- **MFA**: TOTP via `otpauth` library
- **Fonts**: DM Sans (body), JetBrains Mono (monospace)
