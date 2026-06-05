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
  unique,
  index,
} from "drizzle-orm/pg-core";

// ─── Auth ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  consentGivenAt: timestamp("consent_given_at", { withTimezone: true }),
  totpSecret: text("totp_secret"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  recoveryCodes: text("recovery_codes"),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mfaPending: boolean("mfa_pending").notNull().default(false),
    mfaFailedAttempts: integer("mfa_failed_attempts").notNull().default(0),
    mfaLockedUntil: timestamp("mfa_locked_until", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_sessions_user_id").on(t.userId)]
);

// ─── Groups ──────────────────────────────────────────────────────────────────

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const groupRoleEnum = pgEnum("group_role", ["owner", "member"]);

export const groupMembers = pgTable(
  "group_members",
  {
    id: serial("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: groupRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("group_members_group_user_unique").on(t.groupId, t.userId),
    unique("group_members_user_unique").on(t.userId),
    index("idx_group_members_user_id").on(t.userId),
  ]
);

export const groupInvitations = pgTable("group_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  invitedBy: uuid("invited_by").references(() => users.id, {
    onDelete: "set null",
  }),
  invitedEmail: text("invited_email"), // nullable for link-only invites
  token: text("token").notNull().unique(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Share Links ─────────────────────────────────────────────────────────────

export const shareLinks = pgTable("share_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  label: text("label"),
  includeNetWorth: boolean("include_net_worth").notNull().default(true),
  includeBalances: boolean("include_balances").notNull().default(false),
  includeTransactions: boolean("include_transactions").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // null = never expires
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Financial Data ──────────────────────────────────────────────────────────

export const plaidItems = pgTable(
  "plaid_items",
  {
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_plaid_items_user_id").on(t.userId)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_accounts_plaid_item_id").on(t.plaidItemId),
    index("idx_accounts_user_id").on(t.userId),
  ]
);

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_transactions_account_id").on(t.accountId),
    index("idx_transactions_account_id_date").on(t.accountId, t.date),
    index("idx_transactions_date_id").on(t.date, t.id),
    index("idx_transactions_user_id").on(t.userId),
  ]
);

export const holdings = pgTable(
  "holdings",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_holdings_account_id").on(t.accountId),
    index("idx_holdings_user_id").on(t.userId),
  ]
);

export const manualAccounts = pgTable(
  "manual_accounts",
  {
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_manual_accounts_user_id").on(t.userId)]
);

// ─── Snapshots ───────────────────────────────────────────────────────────────

export const userNetWorthSnapshots = pgTable(
  "user_net_worth_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    totalAssets: numeric("total_assets", { precision: 14, scale: 2 }).notNull(),
    totalLiabilities: numeric("total_liabilities", {
      precision: 14,
      scale: 2,
    }).notNull(),
    netWorth: numeric("net_worth", { precision: 14, scale: 2 }).notNull(),
    depositoryTotal: numeric("depository_total", { precision: 14, scale: 2 }),
    creditTotal: numeric("credit_total", { precision: 14, scale: 2 }),
    investmentTotal: numeric("investment_total", { precision: 14, scale: 2 }),
    loanTotal: numeric("loan_total", { precision: 14, scale: 2 }),
    manualAssetsTotal: numeric("manual_assets_total", {
      precision: 14,
      scale: 2,
    }),
    manualLiabilitiesTotal: numeric("manual_liabilities_total", {
      precision: 14,
      scale: 2,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("user_snapshots_user_date_unique").on(t.userId, t.date),
    index("idx_user_snapshots_user_date").on(t.userId, t.date),
  ]
);

export const groupNetWorthSnapshots = pgTable(
  "group_net_worth_snapshots",
  {
    id: serial("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    totalAssets: numeric("total_assets", { precision: 14, scale: 2 }).notNull(),
    totalLiabilities: numeric("total_liabilities", {
      precision: 14,
      scale: 2,
    }).notNull(),
    netWorth: numeric("net_worth", { precision: 14, scale: 2 }).notNull(),
    depositoryTotal: numeric("depository_total", { precision: 14, scale: 2 }),
    creditTotal: numeric("credit_total", { precision: 14, scale: 2 }),
    investmentTotal: numeric("investment_total", { precision: 14, scale: 2 }),
    loanTotal: numeric("loan_total", { precision: 14, scale: 2 }),
    manualAssetsTotal: numeric("manual_assets_total", {
      precision: 14,
      scale: 2,
    }),
    manualLiabilitiesTotal: numeric("manual_liabilities_total", {
      precision: 14,
      scale: 2,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("group_snapshots_group_date_unique").on(t.groupId, t.date),
    index("idx_group_snapshots_group_date").on(t.groupId, t.date),
  ]
);
