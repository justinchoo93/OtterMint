// @vitest-environment node
//
// Real-database proof that a Plaid sync leaves the owner's categories alone:
// the real syncTransactions upserts run against Postgres as app_user (Plaid's
// API is mocked), then the real read helper still applies the owner's choice
// and memory. Gated like rls-isolation.test.ts: skipped unless
// RLS_TEST_DATABASE_URL and RLS_TEST_SUPERUSER_URL point at a migrated
// disposable database.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres, { type Sql } from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

const { mockTransactionsSync } = vi.hoisted(() => ({ mockTransactionsSync: vi.fn() }));
vi.mock("@/lib/plaid", () => ({ plaidClient: { transactionsSync: mockTransactionsSync } }));

import { syncTransactions } from "@/lib/sync-transactions";
import { selectClassifiedTransactionRows } from "@/lib/db/classified-transactions";

const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const SUPER_URL = process.env.RLS_TEST_SUPERUSER_URL;
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EMAIL = `sync-survival-${SUFFIX}@example.com`;
const ACCOUNT = `acc-sync-${SUFFIX}`;
const OWN = `txn-own-${SUFFIX}`;
const REMEMBERED = `txn-mem-${SUFFIX}`;

function plaidTxn(transactionId: string, name: string, amount: number) {
  return {
    transaction_id: transactionId,
    account_id: ACCOUNT,
    amount,
    date: "2026-09-10",
    name,
    merchant_name: null,
    pending: false,
    iso_currency_code: "USD",
    personal_finance_category: { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES" },
  };
}

describe.skipIf(!APP_URL)("Plaid sync keeps the owner's categories", () => {
  let admin: Sql;
  let app: Sql;
  let userId: string;

  beforeAll(async () => {
    admin = postgres(SUPER_URL!, { max: 1 });
    app = postgres(APP_URL!, { max: 1 });
    const [user] = await admin<{ id: string }[]>`
      insert into users (email, password_hash, display_name) values (${EMAIL}, 'x', 'Sync') returning id`;
    userId = user.id;
    const [item] = await admin<{ id: number }[]>`
      insert into plaid_items (user_id, institution_id, institution_name, access_token_encrypted, item_id)
      values (${userId}, 'ins_sync', 'Bank', 'enc', ${"item-sync-" + SUFFIX}) returning id`;
    await admin`insert into accounts (user_id, plaid_item_id, account_id, name, type, subtype)
      values (${userId}, ${item.id}, ${ACCOUNT}, 'Checking', 'depository', 'checking')`;
    await admin`insert into transactions (user_id, account_id, transaction_id, amount, date, name,
        category, category_detailed, user_category, user_category_detailed)
      values (${userId}, ${ACCOUNT}, ${OWN}, '45.00', '2026-09-10', 'SOCCER CLUB 1',
        'UNCATEGORIZED', null, 'CUSTOM_SPENDING', 'CUSTOM_SPENDING_KIDS_ACTIVITIES')`;
    await admin`insert into transactions (user_id, account_id, transaction_id, amount, date, name,
        category, category_detailed)
      values (${userId}, ${ACCOUNT}, ${REMEMBERED}, '-2000.00', '2026-09-10', 'ACME PAYROLL PPD 1',
        'UNCATEGORIZED', null)`;
    await admin`insert into category_memories (user_id, match_key, category, category_detailed)
      values (${userId}, 'acme payroll ppd', 'INCOME', 'INCOME_SALARY')`;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from users where email = ${EMAIL}`;
      await admin.end();
    }
    if (app) await app.end();
  });

  it("rewrites Plaid's columns on both upsert paths and leaves the choice and the memory", async () => {
    // Plaid re-sends both rows: one as "added" (a full resync), one as "modified".
    mockTransactionsSync.mockResolvedValueOnce({
      data: {
        added: [plaidTxn(OWN, "SOCCER CLUB 1", 45)],
        modified: [plaidTxn(REMEMBERED, "ACME PAYROLL PPD 1", -2000)],
        removed: [],
        has_more: false,
        next_cursor: "cursor-1",
      },
    });
    const db = drizzle(app, { schema });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
      const result = await syncTransactions("access-token", null, userId, tx);
      expect(result).toMatchObject({ added: 1, modified: 1, removed: 0 });
      return selectClassifiedTransactionRows(tx, userId, "2026-01-01");
    });

    const [stored] = await admin<{ category: string; user_category: string; user_category_detailed: string }[]>`
      select category, user_category, user_category_detailed from transactions where transaction_id = ${OWN}`;
    expect(stored).toEqual({
      category: "GENERAL_SERVICES",
      user_category: "CUSTOM_SPENDING",
      user_category_detailed: "CUSTOM_SPENDING_KIDS_ACTIVITIES",
    });
    const memories = await admin`select match_key from category_memories where user_id = ${userId}`;
    expect(memories).toHaveLength(1);

    const byName = Object.fromEntries(rows.map((row) => [row.name, row.categoryDetailed]));
    expect(byName).toEqual({
      "SOCCER CLUB 1": "CUSTOM_SPENDING_KIDS_ACTIVITIES",
      "ACME PAYROLL PPD 1": "INCOME_SALARY",
    });
  });
});
