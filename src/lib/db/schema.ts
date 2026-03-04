import {
  pgTable,
  text,
  timestamp,
  numeric,
  integer,
  serial,
  boolean,
  date,
} from "drizzle-orm/pg-core";

export const plaidItems = pgTable("plaid_items", {
  id: serial("id").primaryKey(),
  institutionId: text("institution_id").notNull(),
  institutionName: text("institution_name").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  itemId: text("item_id").notNull().unique(),
  transactionsCursor: text("transactions_cursor"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  owner: text("owner").notNull().default("justin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  plaidItemId: integer("plaid_item_id")
    .notNull()
    .references(() => plaidItems.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().unique(),
  name: text("name").notNull(),
  officialName: text("official_name"),
  type: text("type").notNull(), // depository, credit, investment, loan
  subtype: text("subtype"), // checking, savings, credit card, etc.
  mask: text("mask"), // last 4 digits
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
  name: text("name").notNull(),
  type: text("type").notNull(), // asset or liability
  subtype: text("subtype"), // crypto, real estate, vehicle, other
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull(),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  owner: text("owner").notNull().default("justin"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
