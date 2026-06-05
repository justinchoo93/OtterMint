// @vitest-environment node
//
// Real-database cross-tenant isolation test for the RLS prototype (Milestone 1).
//
// Unlike every other test in this repo (which mocks `@/lib/db`), this suite
// connects to a REAL local Postgres so that actual Row-Level Security policies
// run. It is gated behind RLS_TEST_DATABASE_URL: when that env var is unset the
// whole suite is SKIPPED, so the default `npm test` (no database) stays green.
//
// To run it (see drizzle/0006_rls_prototype.sql for role/policy setup):
//   RLS_TEST_DATABASE_URL=postgresql://app_user:app_user_local_pw@localhost:5433/ottermint \
//   RLS_TEST_SUPERUSER_URL=postgresql://postgres:postgres@localhost:5433/ottermint \
//   npm test -- rls-isolation
//
// - RLS_TEST_DATABASE_URL connects as the non-superuser `app_user` role (RLS applies).
// - RLS_TEST_SUPERUSER_URL connects as the superuser (bypasses RLS) for seeding,
//   cleanup, and the "leak proof" contrast test.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";

const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const SUPER_URL = process.env.RLS_TEST_SUPERUSER_URL;

// Unique suffix so reruns / parallel runs do not collide on the unique email.
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EMAIL_A = `rls-a-${SUFFIX}@example.com`;
const EMAIL_B = `rls-b-${SUFFIX}@example.com`;

describe.skipIf(!APP_URL)("RLS isolation (manual_accounts prototype)", () => {
  let adminSql: Sql;
  let appSql: Sql;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    // Connections are opened ONLY here so that importing this file never
    // touches the network (keeps default test collection side-effect free).
    if (!SUPER_URL) {
      throw new Error(
        "RLS_TEST_SUPERUSER_URL must be set alongside RLS_TEST_DATABASE_URL"
      );
    }
    adminSql = postgres(SUPER_URL, { max: 1 });
    appSql = postgres(APP_URL!, { max: 1 });

    // Seed two users and one manual_accounts row owned by each, as superuser.
    const [a] = await adminSql<{ id: string }[]>`
      insert into users (email, password_hash, display_name)
      values (${EMAIL_A}, 'x', 'A') returning id`;
    const [b] = await adminSql<{ id: string }[]>`
      insert into users (email, password_hash, display_name)
      values (${EMAIL_B}, 'x', 'B') returning id`;
    userA = a.id;
    userB = b.id;

    await adminSql`
      insert into manual_accounts (user_id, name, type, balance)
      values (${userA}, 'A acct', 'asset', '100')`;
    await adminSql`
      insert into manual_accounts (user_id, name, type, balance)
      values (${userB}, 'B acct', 'asset', '200')`;
  });

  afterAll(async () => {
    // Clean up seeded rows (cascades to manual_accounts) and close connections.
    if (adminSql) {
      await adminSql`delete from users where email in (${EMAIL_A}, ${EMAIL_B})`;
      await adminSql.end();
    }
    if (appSql) {
      await appSql.end();
    }
  });

  // The postgres types strip the tagged-template call signature from the
  // transaction handle (`TransactionSql` is built with `Omit`, which drops
  // call signatures), even though the runtime object is fully callable.
  // `asSql` recovers the call signature without changing any behavior.
  const asSql = (tx: unknown) => tx as Sql;

  it("(a) fail-closed: app_user WITHOUT the GUC set sees 0 rows", async () => {
    const rows = await appSql.begin(async (txRaw) => {
      const tx = asSql(txRaw);
      // No set_config call -> current_setting('app.current_user_id', true) is
      // NULL -> the policy predicate is NULL -> every row is denied.
      return tx`select * from manual_accounts`; // NO where clause
    });
    expect(rows).toHaveLength(0);
  });

  it("(b) isolation: app_user in A's context sees only A's row", async () => {
    const rows = await appSql.begin(async (txRaw) => {
      const tx = asSql(txRaw);
      await tx`select set_config('app.current_user_id', ${userA}, true)`;
      return tx`select user_id from manual_accounts`; // NO where clause
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(userA);
  });

  it("(c) WITH CHECK: app_user in A's context cannot insert a row owned by B", async () => {
    await expect(
      appSql.begin(async (txRaw) => {
        const tx = asSql(txRaw);
        await tx`select set_config('app.current_user_id', ${userA}, true)`;
        return tx`
          insert into manual_accounts (user_id, name, type, balance)
          values (${userB}, 'sneaky', 'asset', '1')`;
      })
    ).rejects.toThrow(/row-level security/);
  });

  it("(d) leak proof: superuser sees BOTH A's and B's rows (policy, not app code, is the wall)", async () => {
    const rows = await adminSql<{ user_id: string }[]>`
      select user_id from manual_accounts`; // NO where clause
    const ids = rows.map((r) => r.user_id);
    expect(ids).toContain(userA);
    expect(ids).toContain(userB);
  });
});
