# OtterMint Technical Architecture

## Overview

OtterMint is a personal finance dashboard built on Next.js 15/16 with API routes, Drizzle ORM over Supabase PostgreSQL, and Plaid for financial data. This document covers the current architecture, known bugs, and a proposed architecture for multi-user support with profiles, groups, and sharing.

---

## Current State

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Recharts |
| Backend | Next.js API routes (Edge-compatible where noted) |
| Database | Supabase (PostgreSQL) via Drizzle ORM + postgres.js |
| Financial data | Plaid API (sandbox/production) |
| Auth | HTTP Basic Authentication (middleware) |

### Current Schema (Drizzle DDL)

```typescript
// plaid_items — one row per linked financial institution
export const plaidItems = pgTable("plaid_items", {
  id: serial("id").primaryKey(),
  institutionId: text("institution_id").notNull(),
  institutionName: text("institution_name").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  itemId: text("item_id").notNull().unique(),
  transactionsCursor: text("transactions_cursor"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  owner: text("owner").notNull().default("justin"),  // single-user vestige
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// accounts — plaid accounts, FK to plaid_items
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  plaidItemId: integer("plaid_item_id")
    .notNull()
    .references(() => plaidItems.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().unique(),  // Plaid's account_id
  name: text("name").notNull(),
  officialName: text("official_name"),
  type: text("type").notNull(),          // depository | credit | investment | loan
  subtype: text("subtype"),
  mask: text("mask"),
  currentBalance: numeric("current_balance", { precision: 12, scale: 2 }),
  availableBalance: numeric("available_balance", { precision: 12, scale: 2 }),
  limitAmount: numeric("limit_amount", { precision: 12, scale: 2 }),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// transactions — incremental sync via Plaid Transactions Sync API
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.accountId, { onDelete: "cascade" }),
  transactionId: text("transaction_id").notNull().unique(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: date("date").notNull(),
  merchantName: text("merchant_name"),
  name: text("name").notNull(),
  category: text("category"),
  pending: boolean("pending").notNull().default(false),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// holdings — full-replace sync from Plaid Investments API
export const holdings = pgTable("holdings", {
  id: serial("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.accountId, { onDelete: "cascade" }),
  securityId: text("security_id").notNull(),
  name: text("name").notNull(),
  tickerSymbol: text("ticker_symbol"),
  quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
  price: numeric("price", { precision: 12, scale: 4 }).notNull(),
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  costBasis: numeric("cost_basis", { precision: 14, scale: 2 }),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// manual_accounts — user-entered assets and liabilities
export const manualAccounts = pgTable("manual_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),         // asset | liability
  subtype: text("subtype"),             // crypto | real estate | vehicle | other
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull(),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  owner: text("owner").notNull().default("justin"),  // single-user vestige
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// net_worth_snapshots — one row per calendar day (upserted)
export const netWorthSnapshots = pgTable("net_worth_snapshots", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  totalAssets: numeric("total_assets", { precision: 14, scale: 2 }).notNull(),
  totalLiabilities: numeric("total_liabilities", { precision: 14, scale: 2 }).notNull(),
  netWorth: numeric("net_worth", { precision: 14, scale: 2 }).notNull(),
  depositoryTotal: numeric("depository_total", { precision: 14, scale: 2 }),
  creditTotal: numeric("credit_total", { precision: 14, scale: 2 }),
  investmentTotal: numeric("investment_total", { precision: 14, scale: 2 }),
  loanTotal: numeric("loan_total", { precision: 14, scale: 2 }),
  manualAssetsTotal: numeric("manual_assets_total", { precision: 14, scale: 2 }),
  manualLiabilitiesTotal: numeric("manual_liabilities_total", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### Current Indexes

The current schema has no explicit indexes beyond primary keys and unique constraints. The unique constraints that exist:

| Table | Column | Constraint |
|---|---|---|
| `plaid_items` | `item_id` | UNIQUE |
| `accounts` | `account_id` | UNIQUE |
| `transactions` | `transaction_id` | UNIQUE |
| `net_worth_snapshots` | `date` | UNIQUE |

Missing indexes that would help query performance:
- `accounts(plaid_item_id)` — used in refresh loop
- `transactions(date DESC, id DESC)` — used in feed query
- `transactions(account_id)` — used in cascade and category aggregation
- `holdings(account_id)` — used in full-replace sync

### Current API Routes

#### `GET /api/accounts`
Returns all Plaid-linked accounts with institution context and item error states.

**Response:**
```json
{
  "accounts": [AccountWithInstitution],
  "itemStatuses": [PlaidItemStatus]
}
```

**Query pattern:** N+1 loop (one query per plaid item). Should be a single JOIN.

---

#### `POST /api/accounts/refresh`
Refreshes all stale Plaid items (>2h since last refresh). Syncs balances, transactions, and holdings. Computes and saves a net worth snapshot.

**Staleness check:** Per-item — stale if any account's `last_refreshed_at` is older than 2 hours, or if the item has no accounts.

**Bug (Bug 7):** Does not insert newly discovered Plaid accounts or delete closed ones. Only updates existing rows.

**Bug (Bug 6):** `computeSnapshot` calls `Math.abs` on all account balances, including depository and investment. Negative depository balances (overdrafts) are counted as positive assets.

---

#### `GET /api/transactions`
Returns recent transactions, sorted by `date DESC, id DESC`.

**Query params:**
- `limit` — number of transactions (default 50, max 200). **Bug (Bug 10):** NaN passes through to `.limit()`.

---

#### `GET /api/holdings`
Returns all holdings with no filtering or pagination.

---

#### `GET /api/manual-accounts`
Returns all manual accounts.

---

#### `POST /api/manual-accounts`
Creates a manual account. Validates via `validateManualAccount()`.

**Request body:**
```json
{ "name": string, "type": "asset"|"liability", "subtype"?: string, "balance": string, "notes"?: string }
```

---

#### `PUT /api/manual-accounts`
Updates a manual account by `id` (in body).

---

#### `DELETE /api/manual-accounts?id={id}`
Deletes a manual account.

---

#### `POST /api/plaid/create-link-token`
Creates a Plaid Link token for initial account connection.

**Bug (Bug 8):** Only requests `Products.Transactions`, not `Products.Investments`. Holdings sync will fail for items linked this way.

---

#### `POST /api/plaid/create-update-link-token`
Creates a Plaid Link token in update mode (re-auth) for an existing item.

**Request body:** `{ "itemId": number }`

---

#### `POST /api/plaid/exchange-token`
Exchanges a Plaid public token for an access token. Encrypts and stores the token. Fetches initial account balances.

**Request body:** `{ "public_token": string, "institution": { institution_id: string, name: string } }`

---

#### `GET /api/net-worth`
Returns net worth snapshots for the last N days.

**Query params:**
- `days` — lookback window (default 90, max 365). **Bug (Bug 9):** NaN passes through to date arithmetic.

---

### Middleware

```typescript
// src/middleware.ts
export function middleware(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);  // Bug 5: unguarded, throws on malformed input
      const [username, password] = decoded.split(":");
      if (username === process.env.AUTH_USERNAME && password === process.env.AUTH_PASSWORD) {
        return NextResponse.next();
      }
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="OtterMint"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

**Bug (Bug 5):** `atob(encoded)` throws synchronously on malformed base64. This produces a 500 instead of a 401. The fix is to wrap in try/catch.

---

### Encryption

Plaid access tokens are encrypted at rest using AES-256-GCM.

- Key: `ENCRYPTION_KEY` env var — 64-char hex string (32 bytes)
- IV: 12 random bytes per encryption
- Auth tag: 16 bytes
- Stored format: `base64(IV):base64(authTag):base64(ciphertext)`

---

## Known Bugs Summary

| Bug | File | Description | Fix |
|---|---|---|---|
| 1 | `PlaidLinkButton` | Link reopens after dismissing, then clicking Refresh | Clear token on dismiss, not just on success |
| 2 | `PlaidLinkButton` | Link reopens after successful account add | Same root cause as Bug 1 |
| 3 | Dashboard | "Last refreshed" timestamp doesn't update after Refresh | Re-fetch timestamp from server after refresh |
| 4 | `PlaidReauthButton.tsx:49` | Reauth modal reopens after dismissing | Clear token on dismiss |
| 5 | `middleware.ts:9` | Malformed auth header causes 500 | Wrap `atob()` in try/catch |
| 6 | `compute-snapshot.ts:32` | `Math.abs` overstates assets (overdrafts, negative investment balances) | Remove `Math.abs` from depository/investment; handle sign correctly |
| 7 | `accounts/refresh/route.ts:50` | New/removed Plaid accounts not synced | Add upsert for new accounts, delete closed ones |
| 8 | `plaid/create-link-token/route.ts:10` | ~~Link token missing Investments product~~ **Fixed** | Moved to `optional_products` |
| 9 | `net-worth/route.ts:22` | NaN `days` param causes 500 | Validate and fallback before use |
| 10 | `transactions/route.ts:22` | NaN/negative `limit` param causes 500 | Validate and fallback before use |

---

## Proposed Architecture: Multi-User with Profiles, Groups, and Sharing

This section describes the architecture needed to support:
1. **Auth** — real user accounts (replacing HTTP Basic Auth)
2. **Profiles** — each person has their own financial data
3. **Groups** — households or couples sharing a combined view
4. **Sharing** — net worth snapshots scoped to a group

### Design Principles

- Plaid items and manual accounts are owned by a **user** (profile), not a hardcoded string
- Groups aggregate members' data for shared views (e.g., household net worth)
- Net worth snapshots are scoped to either a user or a group
- The existing single-user data can be migrated by creating a real user for "justin" and reassigning rows

---

### Proposed Schema (Drizzle DDL)

```typescript
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  numeric,
  integer,
  serial,
  boolean,
  date,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Auth ────────────────────────────────────────────────────────────────────

// users — one row per registered user
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),  // bcrypt, cost factor 12
  displayName: text("display_name").notNull(),
  totpSecret: text("totp_secret"),              // encrypted TOTP secret (AES-256-GCM)
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  recoveryCodes: text("recovery_codes"),        // JSON array of bcrypt-hashed codes
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// sessions — server-side session store
// Keyed by a random token stored in an HttpOnly cookie
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  mfaPending: boolean("mfa_pending").notNull().default(false),  // true after password auth, before MFA
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Groups ──────────────────────────────────────────────────────────────────

// groups — a household or any set of users sharing a combined view
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const groupRoleEnum = pgEnum("group_role", ["owner", "member"]);

// group_members — many-to-many between users and groups
export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: groupRoleEnum("role").notNull().default("member"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (t) => ({
  uniq: unique().on(t.groupId, t.userId),
}));

// group_invitations — pending invitations to join a group
export const groupInvitations = pgTable("group_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  invitedByUserId: uuid("invited_by_user_id")
    .notNull()
    .references(() => users.id),
  invitedEmail: text("invited_email").notNull(),
  token: text("token").notNull().unique(),  // random URL-safe token
  acceptedAt: timestamp("accepted_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── External Share Links ───────────────────────────────────────────────────

// share_links — read-only public links to user's financial data
export const shareLinks = pgTable("share_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),     // crypto.randomBytes(32).toString("base64url")
  label: text("label"),                        // optional user-friendly name
  includeNetWorth: boolean("include_net_worth").notNull().default(true),
  includeBalances: boolean("include_balances").notNull().default(false),
  includeTransactions: boolean("include_transactions").notNull().default(false),
  expiresAt: timestamp("expires_at"),          // null = no expiration
  revokedAt: timestamp("revoked_at"),          // soft delete
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Financial Data (with userId foreign key) ─────────────────────────────────

export const plaidItems = pgTable("plaid_items", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  institutionId: text("institution_id").notNull(),
  institutionName: text("institution_name").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  itemId: text("item_id").notNull().unique(),
  transactionsCursor: text("transactions_cursor"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// accounts, transactions, holdings — unchanged structurally
// They inherit user ownership transitively through plaid_items.user_id

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  plaidItemId: integer("plaid_item_id")
    .notNull()
    .references(() => plaidItems.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().unique(),
  name: text("name").notNull(),
  officialName: text("official_name"),
  type: text("type").notNull(),
  subtype: text("subtype"),
  mask: text("mask"),
  currentBalance: numeric("current_balance", { precision: 12, scale: 2 }),
  availableBalance: numeric("available_balance", { precision: 12, scale: 2 }),
  limitAmount: numeric("limit_amount", { precision: 12, scale: 2 }),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.accountId, { onDelete: "cascade" }),
  transactionId: text("transaction_id").notNull().unique(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: date("date").notNull(),
  merchantName: text("merchant_name"),
  name: text("name").notNull(),
  category: text("category"),
  pending: boolean("pending").notNull().default(false),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const holdings = pgTable("holdings", {
  id: serial("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.accountId, { onDelete: "cascade" }),
  securityId: text("security_id").notNull(),
  name: text("name").notNull(),
  tickerSymbol: text("ticker_symbol"),
  quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
  price: numeric("price", { precision: 12, scale: 4 }).notNull(),
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  costBasis: numeric("cost_basis", { precision: 14, scale: 2 }),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const manualAccounts = pgTable("manual_accounts", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  subtype: text("subtype"),
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull(),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Snapshots (user-scoped and group-scoped) ─────────────────────────────────

// user_net_worth_snapshots — daily snapshot per user
// Replaces the current net_worth_snapshots (which has no owner)
export const userNetWorthSnapshots = pgTable("user_net_worth_snapshots", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  totalAssets: numeric("total_assets", { precision: 14, scale: 2 }).notNull(),
  totalLiabilities: numeric("total_liabilities", { precision: 14, scale: 2 }).notNull(),
  netWorth: numeric("net_worth", { precision: 14, scale: 2 }).notNull(),
  depositoryTotal: numeric("depository_total", { precision: 14, scale: 2 }),
  creditTotal: numeric("credit_total", { precision: 14, scale: 2 }),
  investmentTotal: numeric("investment_total", { precision: 14, scale: 2 }),
  loanTotal: numeric("loan_total", { precision: 14, scale: 2 }),
  manualAssetsTotal: numeric("manual_assets_total", { precision: 14, scale: 2 }),
  manualLiabilitiesTotal: numeric("manual_liabilities_total", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqUserDate: unique().on(t.userId, t.date),
}));

// group_net_worth_snapshots — daily snapshot for a group (sum of all members)
export const groupNetWorthSnapshots = pgTable("group_net_worth_snapshots", {
  id: serial("id").primaryKey(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  totalAssets: numeric("total_assets", { precision: 14, scale: 2 }).notNull(),
  totalLiabilities: numeric("total_liabilities", { precision: 14, scale: 2 }).notNull(),
  netWorth: numeric("net_worth", { precision: 14, scale: 2 }).notNull(),
  depositoryTotal: numeric("depository_total", { precision: 14, scale: 2 }),
  creditTotal: numeric("credit_total", { precision: 14, scale: 2 }),
  investmentTotal: numeric("investment_total", { precision: 14, scale: 2 }),
  loanTotal: numeric("loan_total", { precision: 14, scale: 2 }),
  manualAssetsTotal: numeric("manual_assets_total", { precision: 14, scale: 2 }),
  manualLiabilitiesTotal: numeric("manual_liabilities_total", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqGroupDate: unique().on(t.groupId, t.date),
}));
```

---

### Proposed Indexes

```sql
-- Auth
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Groups
CREATE INDEX idx_group_members_group_id ON group_members(group_id);
CREATE INDEX idx_group_members_user_id ON group_members(user_id);
CREATE INDEX idx_group_invitations_token ON group_invitations(token);
CREATE INDEX idx_group_invitations_group_id ON group_invitations(group_id);

-- Financial data — scoped by user (via plaid_items.user_id)
CREATE INDEX idx_plaid_items_user_id ON plaid_items(user_id);
CREATE INDEX idx_accounts_plaid_item_id ON accounts(plaid_item_id);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_date_id ON transactions(date DESC, id DESC);
CREATE INDEX idx_holdings_account_id ON holdings(account_id);
CREATE INDEX idx_manual_accounts_user_id ON manual_accounts(user_id);

-- Share links
CREATE INDEX idx_share_links_token ON share_links(token);

-- Snapshots
CREATE INDEX idx_user_snapshots_user_date ON user_net_worth_snapshots(user_id, date DESC);
CREATE INDEX idx_group_snapshots_group_date ON group_net_worth_snapshots(group_id, date DESC);
```

---

### Proposed API Routes

#### Auth

**`POST /api/auth/register`**
- Body: `{ email, password, displayName }`
- Creates user with bcrypt-hashed password (cost 12)
- Returns 201 with session cookie

**`POST /api/auth/login`**
- Body: `{ email, password }`
- Verifies password, creates session row, sets `HttpOnly; Secure; SameSite=Lax` cookie
- Returns 200 with user info

**`POST /api/auth/logout`**
- Deletes session row, clears cookie
- Returns 200

**`GET /api/auth/me`**
- Returns current user from session (including `mfaEnabled` flag)
- Used by frontend to check auth state

**`DELETE /api/auth/delete-account`**
- Revokes all Plaid access tokens (decrypts each, calls `plaidClient.itemRemove`)
- Plaid revocation errors are logged but don't block deletion
- Deletes user row (cascades to all related data: sessions, plaid items, accounts,
  transactions, holdings, manual accounts, share links, snapshots, group memberships)
- Clears session cookie
- Returns 200

#### MFA (TOTP)

**`POST /api/auth/mfa/setup`**
- Generates 20-byte TOTP secret via `otpauth` library
- Returns QR code as data URL, plaintext Base32 secret, and 8 recovery codes
- Stores encrypted secret and bcrypt-hashed recovery codes in DB
- Does NOT enable MFA yet — user must verify first
- Response: `{ qrCodeUrl, secret, recoveryCodes }`

**`POST /api/auth/mfa/verify-setup`**
- Body: `{ code }` (6-digit TOTP code)
- Validates code against stored secret (window of 1, ±30s drift)
- Sets `mfaEnabled = true` on success
- Response: `{ success: true }`

**`POST /api/auth/mfa/verify`**
- Body: `{ sessionId, code }` (TOTP code or recovery code)
- Called after login when user has MFA enabled (session has `mfaPending = true`)
- Validates UUID format, checks session expiration
- For recovery codes: bcrypt-compares against stored hashes, consumes on use
- Sets session cookie (`httpOnly; secure; sameSite=lax; 30-day maxAge`)
- Clears `mfa_pending` cookie
- Response: `{ success: true }`

**`POST /api/auth/mfa/disable`**
- Body: `{ code }` (valid TOTP code required to disable)
- Clears `mfaEnabled`, `totpSecret`, and `recoveryCodes` from user record
- Prevents unauthorized removal if session is compromised
- Response: `{ success: true }`

#### Middleware Changes

Replace the HTTP Basic Auth middleware with session-cookie auth:

```typescript
export async function middleware(request: NextRequest) {
  const sessionId = request.cookies.get("session_id")?.value;
  if (!sessionId) return redirectToLogin(request);

  // Validate session against DB — need edge-compatible DB call or short-lived JWT
  const session = await validateSession(sessionId);
  if (!session || session.expiresAt < new Date()) return redirectToLogin(request);

  // Inject userId into request headers for downstream route handlers
  const headers = new Headers(request.headers);
  headers.set("x-user-id", session.userId);
  return NextResponse.next({ request: { headers } });
}
```

**Note on edge runtime:** postgres.js does not run in the Edge runtime. The middleware will need to either use a JWT (signed, short-lived, verifiable without DB) or run in Node.js runtime. JWTs are the practical choice here — issue on login, verify in middleware with `jose` (edge-compatible), include `userId` in the payload.

**Recommended approach:** Issue a signed JWT (HS256 or EdDSA) at login. Store it in an `HttpOnly; Secure; SameSite=Lax` cookie. Middleware verifies the JWT signature without a DB round-trip. Session revocation (logout) just clears the cookie; for true revocation, maintain a short blocklist in Redis or keep sessions short-lived (15 min) with refresh tokens.

#### Groups

**`POST /api/groups`**
- Body: `{ name }`
- Creates group, adds caller as `owner`
- Returns 201 with group

**`GET /api/groups`**
- Returns groups the caller belongs to

**`GET /api/groups/:groupId`**
- Returns group details and member list (requires membership)

**`POST /api/groups/:groupId/invitations`**
- Body: `{ email }`
- Creates invitation with 7-day expiry, sends email (or returns token for manual sharing)
- Requires `owner` role

**`POST /api/groups/:groupId/invitations/:token/accept`**
- Looks up invitation by token, validates expiry, adds caller as `member`
- Sets `acceptedAt`

**`DELETE /api/groups/:groupId/members/:userId`**
- Removes member (owner can remove anyone; member can remove themselves)

#### External Share Links

**`POST /api/share-links`**
- Body: `{ label?, includeNetWorth, includeBalances, includeTransactions }`
- Generates 256-bit random token (`crypto.randomBytes(32).toString("base64url")`)
- Returns 201 with share link object

**`GET /api/share-links`**
- Returns all non-revoked share links for the authenticated user
- Filters by `revokedAt IS NULL`

**`DELETE /api/share-links?id={linkId}`**
- Soft-deletes by setting `revokedAt = NOW()`
- Validates caller owns the link

**`GET /api/shared/[token]`** _(public, no auth)_
- Looks up share link by token
- Returns 404 if not found or revoked, 410 if expired
- Returns data based on link permissions:
  - `includeNetWorth`: last 90 days of `userNetWorthSnapshots`
  - `includeBalances`: Plaid accounts (name, type, mask, balance, institution) + manual accounts
  - `includeTransactions`: last 200 transactions (date, name, merchant, amount, category)
- Includes user's display name and link label
- Never exposes sensitive data (access tokens, full account numbers)

#### Financial Data Routes (modified)

All financial data routes must filter by the authenticated `userId` extracted from the JWT/session. Routes that today do `db.select().from(plaidItems)` must become `db.select().from(plaidItems).where(eq(plaidItems.userId, userId))`.

**`GET /api/accounts`** — filter by `userId`

**`POST /api/accounts/refresh`** — refresh items for authenticated `userId` only

**`GET /api/transactions`** — join through accounts → plaid_items to scope by `userId`

**`GET /api/holdings`** — join through accounts → plaid_items to scope by `userId`

**`GET|POST|PUT|DELETE /api/manual-accounts`** — filter by `userId`

**`GET /api/net-worth`** — query `user_net_worth_snapshots` by `userId` (and optionally `group_id` for group view)

**`GET /api/groups/:groupId/net-worth`** _(new)_
- Returns `group_net_worth_snapshots` for a group
- Requires group membership

---

### Middleware Logic (Proposed)

```
Request arrives
  ↓
Is path excluded? (_next/static, _next/image, favicon.ico, /api/auth/*)
  → Yes: pass through
  → No: continue
  ↓
Extract JWT from cookie "session"
  → Missing or invalid: 401 JSON { error: "Unauthorized" } for /api/* routes
                        302 redirect to /login for page routes
  ↓
Verify JWT signature and expiry (jose, edge-compatible)
  → Expired/invalid: same as missing
  ↓
Inject x-user-id header: JWT payload.sub
  ↓
NextResponse.next()
```

---

### Migration Strategy

The goal is to migrate the existing single-user data to the new multi-user schema without data loss.

#### Phase 1: Add users table, create "justin" user

```sql
-- 1. Create users table
-- 2. Insert the existing user
INSERT INTO users (id, email, password_hash, display_name)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000000',  -- well-known UUID for migration
  'justin@example.com',
  '<bcrypt hash of chosen password>',
  'Justin'
);
```

#### Phase 2: Add userId columns to plaid_items and manual_accounts

```sql
-- Add nullable first, then backfill, then add NOT NULL constraint
ALTER TABLE plaid_items ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE manual_accounts ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Backfill
UPDATE plaid_items SET user_id = 'aaaaaaaa-0000-0000-0000-000000000000';
UPDATE manual_accounts SET user_id = 'aaaaaaaa-0000-0000-0000-000000000000';

-- Add NOT NULL constraint
ALTER TABLE plaid_items ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE manual_accounts ALTER COLUMN user_id SET NOT NULL;

-- Drop the old text owner column
ALTER TABLE plaid_items DROP COLUMN owner;
ALTER TABLE manual_accounts DROP COLUMN owner;
```

#### Phase 3: Migrate net_worth_snapshots to user_net_worth_snapshots

```sql
-- Create new table with user_id
CREATE TABLE user_net_worth_snapshots ( ... );

-- Migrate existing rows
INSERT INTO user_net_worth_snapshots (user_id, date, total_assets, ...)
SELECT 'aaaaaaaa-0000-0000-0000-000000000000', date, total_assets, ...
FROM net_worth_snapshots;

-- Drop old table (after verification)
DROP TABLE net_worth_snapshots;
```

#### Phase 4: Sessions and middleware

- Deploy sessions table
- Deploy new auth routes
- Swap middleware from Basic Auth to JWT
- Update all API routes to read `x-user-id` from headers

#### Phase 5: Groups (optional, can be deferred)

- Deploy groups, group_members, group_invitations, group_net_worth_snapshots
- Deploy group API routes
- Add group net worth aggregation to refresh pipeline

---

### computeSnapshot Bug Fix

The current `sumByType` function applies `Math.abs` to all account balances:

```typescript
// BUG: overdrafts and negative investment balances become positive assets
.reduce((sum, a) => sum + Math.abs(parseFloat(a.currentBalance ?? "0")), 0);
```

The correct approach: Plaid balance conventions vary by account type.

- **Depository:** `current` is positive for a balance in your favor, negative for overdraft. Use the raw value.
- **Credit:** `current` is positive for the amount owed (a liability). The existing code treats it as a positive number for liabilities, which is correct — but `Math.abs` is masking sign issues that could appear.
- **Investment:** `current` is the portfolio value. Use the raw value.
- **Loan:** `current` is positive for amount owed (a liability). Same as credit.

Fixed implementation:

```typescript
function sumByType(accounts: PlaidAccount[], type: string): number {
  return accounts
    .filter((a) => a.type === type)
    .reduce((sum, a) => sum + parseFloat(a.currentBalance ?? "0"), 0);
}
```

For liability types (credit, loan), the sum is then used as `totalLiabilities`, which is already semantically correct. Remove `Math.abs` throughout. If a credit balance is negative (Plaid returns this when you have a credit), it reduces liabilities, which is correct.

---

### Query Patterns

#### Get user's accounts with institution info (replaces N+1 loop)

```typescript
const result = await db
  .select({
    id: accounts.id,
    accountId: accounts.accountId,
    name: accounts.name,
    type: accounts.type,
    // ...other account fields
    institutionName: plaidItems.institutionName,
    errorCode: plaidItems.errorCode,
    errorMessage: plaidItems.errorMessage,
  })
  .from(accounts)
  .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
  .where(eq(plaidItems.userId, userId));
```

#### Get transactions for a user (scoped via join)

```typescript
const result = await db
  .select({ ...getTableColumns(transactions) })
  .from(transactions)
  .innerJoin(accounts, eq(transactions.accountId, accounts.accountId))
  .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
  .where(eq(plaidItems.userId, userId))
  .orderBy(desc(transactions.date), desc(transactions.id))
  .limit(limit);
```

#### Compute group net worth (aggregate across members)

```typescript
// Fetch all plaid accounts and manual accounts for all group members
const members = await db
  .select({ userId: groupMembers.userId })
  .from(groupMembers)
  .where(eq(groupMembers.groupId, groupId));

const memberIds = members.map(m => m.userId);

const plaidAccts = await db
  .select({ type: accounts.type, currentBalance: accounts.currentBalance })
  .from(accounts)
  .innerJoin(plaidItems, eq(accounts.plaidItemId, plaidItems.id))
  .where(inArray(plaidItems.userId, memberIds));

const manualAccts = await db
  .select({ type: manualAccounts.type, balance: manualAccounts.balance })
  .from(manualAccounts)
  .where(inArray(manualAccounts.userId, memberIds));

const snapshot = computeSnapshot(plaidAccts, manualAccts);
```

---

### Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM (Plaid token encryption) |
| `PLAID_CLIENT_ID` | Plaid API client ID |
| `PLAID_SECRET` | Plaid API secret |
| `PLAID_ENV` | `sandbox` or `production` |
| `JWT_SECRET` | _(new)_ Secret for signing session JWTs (min 32 bytes) |

---

### Open Questions for UX/Design Alignment

These are architectural decisions that depend on UX choices being made in parallel:

1. **Group visibility model:** Can group members see each other's individual account details, or only aggregate totals? This affects whether transaction/holdings routes need group-scoped queries or just individual.

2. **Invitation flow:** Email-based (requires email service) or shareable-link-based (simpler, no email infra)? The schema supports both via the `token` field and `invited_email`.

3. **Session duration:** How long should logins persist? Longer sessions are more convenient but require either refresh tokens or accepting that compromised sessions stay valid longer. Recommend 30-day sliding window with refresh on activity.

4. **Snapshot ownership for shared accounts:** If Justin links a bank account and is in a group with Sarah, does that account appear in both the individual and group snapshots? The proposed model says yes — user snapshots are individual, group snapshots aggregate all members.
