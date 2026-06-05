// @vitest-environment node
//
// Real-database cross-tenant isolation tests for the FULL RLS rollout.
//
// Unlike every other test in this repo (which mocks `@/lib/db`), this suite
// connects to a REAL local Postgres so that actual Row-Level Security policies
// run. It is gated behind RLS_TEST_DATABASE_URL: when that env var is unset the
// whole suite is SKIPPED, so the default `npm test` (no database) stays green.
//
// To run it (apply migrations 0000-0008 to the DB first):
//   RLS_TEST_DATABASE_URL=postgresql://app_user:app_user_local_pw@localhost:5433/ottermint \
//   RLS_TEST_SUPERUSER_URL=postgresql://postgres:postgres@localhost:5433/ottermint \
//   npm test -- rls-isolation
//
// - RLS_TEST_DATABASE_URL connects as the non-superuser `app_user` role (RLS applies).
// - RLS_TEST_SUPERUSER_URL connects as the superuser (bypasses RLS) for seeding,
//   cleanup, and the "leak proof" contrast tests.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";

const APP_URL = process.env.RLS_TEST_DATABASE_URL;
const SUPER_URL = process.env.RLS_TEST_SUPERUSER_URL;

// Unique suffix so reruns / parallel runs do not collide on unique columns.
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EMAIL_A = `rls-a-${SUFFIX}@example.com`;
const EMAIL_B = `rls-b-${SUFFIX}@example.com`;
const EMAIL_C = `rls-c-${SUFFIX}@example.com`;

// The postgres types strip the tagged-template call signature from the
// transaction handle (TransactionSql is built with Omit, which drops call
// signatures), even though the runtime object is fully callable. `asSql`
// recovers the call signature without changing any behavior.
const asSql = (tx: unknown) => tx as Sql;

describe.skipIf(!APP_URL)("RLS full isolation", () => {
  let adminSql: Sql;
  let appSql: Sql;
  let userA: string;
  let userB: string;
  let userC: string; // not in any group with A/B
  let itemA: number; // plaid_items.id owned by A
  let itemB: number;
  let groupId: string;

  // Run `fn` as app_user inside one transaction with the GUC set to `uid`.
  const asUser = <T>(uid: string, fn: (tx: Sql) => Promise<T> | T) =>
    appSql.begin(async (txRaw) => {
      const tx = asSql(txRaw);
      await tx`select set_config('app.current_user_id', ${uid}, true)`;
      return fn(tx);
    });

  // Run `fn` as app_user inside one transaction WITHOUT setting the GUC.
  const asNobody = <T>(fn: (tx: Sql) => Promise<T> | T) =>
    appSql.begin(async (txRaw) => fn(asSql(txRaw)));

  beforeAll(async () => {
    if (!SUPER_URL) {
      throw new Error(
        "RLS_TEST_SUPERUSER_URL must be set alongside RLS_TEST_DATABASE_URL"
      );
    }
    adminSql = postgres(SUPER_URL, { max: 1 });
    appSql = postgres(APP_URL!, { max: 1 });

    // --- Seed two users (A, B) who share a group, and a third (C) who does
    // not. All seeding is done as superuser (RLS bypassed). ---
    const [a] = await adminSql<{ id: string }[]>`
      insert into users (email, password_hash, display_name)
      values (${EMAIL_A}, 'x', 'A') returning id`;
    const [b] = await adminSql<{ id: string }[]>`
      insert into users (email, password_hash, display_name)
      values (${EMAIL_B}, 'x', 'B') returning id`;
    const [c] = await adminSql<{ id: string }[]>`
      insert into users (email, password_hash, display_name)
      values (${EMAIL_C}, 'x', 'C') returning id`;
    userA = a.id;
    userB = b.id;
    userC = c.id;

    // manual accounts
    await adminSql`insert into manual_accounts (user_id, name, type, balance)
      values (${userA}, 'A manual', 'asset', '100')`;
    await adminSql`insert into manual_accounts (user_id, name, type, balance)
      values (${userB}, 'B manual', 'asset', '200')`;

    // plaid items + accounts + transactions + holdings for A and B
    const [pa] = await adminSql<{ id: number }[]>`
      insert into plaid_items (user_id, institution_id, institution_name,
        access_token_encrypted, item_id)
      values (${userA}, 'ins_a', 'Bank A', 'enc', ${"item-a-" + SUFFIX})
      returning id`;
    const [pb] = await adminSql<{ id: number }[]>`
      insert into plaid_items (user_id, institution_id, institution_name,
        access_token_encrypted, item_id)
      values (${userB}, 'ins_b', 'Bank B', 'enc', ${"item-b-" + SUFFIX})
      returning id`;
    itemA = pa.id;
    itemB = pb.id;

    await adminSql`insert into accounts (user_id, plaid_item_id, account_id,
        name, type) values (${userA}, ${itemA}, ${"acc-a-" + SUFFIX}, 'A acct', 'depository')`;
    await adminSql`insert into accounts (user_id, plaid_item_id, account_id,
        name, type) values (${userB}, ${itemB}, ${"acc-b-" + SUFFIX}, 'B acct', 'depository')`;

    await adminSql`insert into transactions (user_id, account_id, transaction_id,
        amount, date, name)
      values (${userA}, ${"acc-a-" + SUFFIX}, ${"txn-a-" + SUFFIX}, '10', '2026-01-01', 'A txn')`;
    await adminSql`insert into transactions (user_id, account_id, transaction_id,
        amount, date, name)
      values (${userB}, ${"acc-b-" + SUFFIX}, ${"txn-b-" + SUFFIX}, '20', '2026-01-01', 'B txn')`;

    await adminSql`insert into holdings (user_id, account_id, security_id, name,
        quantity, price, value)
      values (${userA}, ${"acc-a-" + SUFFIX}, 'sec-a', 'A hold', '1', '1', '1')`;
    await adminSql`insert into holdings (user_id, account_id, security_id, name,
        quantity, price, value)
      values (${userB}, ${"acc-b-" + SUFFIX}, 'sec-b', 'B hold', '1', '1', '1')`;

    // share links
    await adminSql`insert into share_links (user_id, token, include_net_worth)
      values (${userA}, ${"share-a-" + SUFFIX}, true)`;
    await adminSql`insert into share_links (user_id, token, include_net_worth)
      values (${userB}, ${"share-b-" + SUFFIX}, true)`;

    // user net worth snapshots
    await adminSql`insert into user_net_worth_snapshots (user_id, date,
        total_assets, total_liabilities, net_worth)
      values (${userA}, '2026-01-01', '100', '0', '100')`;
    await adminSql`insert into user_net_worth_snapshots (user_id, date,
        total_assets, total_liabilities, net_worth)
      values (${userB}, '2026-01-01', '200', '0', '200')`;

    // sessions
    await adminSql`insert into sessions (user_id, expires_at)
      values (${userA}, now() + interval '1 day')`;
    await adminSql`insert into sessions (user_id, expires_at)
      values (${userB}, now() + interval '1 day')`;

    // group with A (owner) + B (member); C is not in it.
    const [g] = await adminSql<{ id: string }[]>`
      insert into groups (name, created_by) values ('Household', ${userA})
      returning id`;
    groupId = g.id;
    await adminSql`insert into group_members (group_id, user_id, role)
      values (${groupId}, ${userA}, 'owner')`;
    await adminSql`insert into group_members (group_id, user_id, role)
      values (${groupId}, ${userB}, 'member')`;
    await adminSql`insert into group_net_worth_snapshots (group_id, date,
        total_assets, total_liabilities, net_worth)
      values (${groupId}, '2026-01-01', '300', '0', '300')`;
  });

  afterAll(async () => {
    if (adminSql) {
      await adminSql`delete from users where email in (${EMAIL_A}, ${EMAIL_B}, ${EMAIL_C})`;
      await adminSql.end();
    }
    if (appSql) await appSql.end();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Per-user isolation. Every owned table is fail-closed with no GUC. For the
  // tables WITHOUT a group-read policy, A sees ONLY A's rows; the group-shared
  // tables (manual_accounts/plaid_items/accounts) are covered separately below
  // because A legitimately sees fellow member B's rows there.
  // ────────────────────────────────────────────────────────────────────────
  const allOwnedTables = [
    "manual_accounts",
    "plaid_items",
    "accounts",
    "transactions",
    "holdings",
    "share_links",
    "user_net_worth_snapshots",
    "sessions",
  ] as const;

  // Tables with NO group-read policy: A must see ONLY A's rows.
  const strictlyPrivateTables = [
    "transactions",
    "holdings",
    "share_links",
    "user_net_worth_snapshots",
    "sessions",
  ] as const;

  for (const table of strictlyPrivateTables) {
    it(`${table}: A sees only A's rows; B's rows are invisible`, async () => {
      const rows = await asUser(userA, (tx) =>
        tx`select user_id from ${tx(table)}`
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r.user_id).toBe(userA);
    });
  }

  for (const table of allOwnedTables) {
    it(`${table}: fail-closed — no GUC returns 0 rows`, async () => {
      const rows = await asNobody((tx) => tx`select * from ${tx(table)}`);
      expect(rows).toHaveLength(0);
    });
  }

  it("manual_accounts: WITH CHECK rejects inserting a row owned by B", async () => {
    await expect(
      asUser(userA, (tx) =>
        tx`insert into manual_accounts (user_id, name, type, balance)
           values (${userB}, 'sneaky', 'asset', '1')`
      )
    ).rejects.toThrow(/row-level security/);
  });

  it("leak proof: superuser sees BOTH A's and B's manual accounts", async () => {
    const rows = await adminSql<{ user_id: string }[]>`
      select user_id from manual_accounts where user_id in (${userA}, ${userB})`;
    const ids = rows.map((r) => r.user_id);
    expect(ids).toContain(userA);
    expect(ids).toContain(userB);
  });

  // ────────────────────────────────────────────────────────────────────────
  // users: own row + group-read of fellow members; outsider cannot read.
  // ────────────────────────────────────────────────────────────────────────
  it("users: A reads its own row", async () => {
    const rows = await asUser(userA, (tx) =>
      tx`select id from users where id = ${userA}`
    );
    expect(rows).toHaveLength(1);
  });

  it("users: A (group with B) can read fellow member B's row", async () => {
    const rows = await asUser(userA, (tx) =>
      tx`select id from users where id = ${userB}`
    );
    expect(rows).toHaveLength(1);
  });

  it("users: A cannot read outsider C's row", async () => {
    const rows = await asUser(userA, (tx) =>
      tx`select id from users where id = ${userC}`
    );
    expect(rows).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // group_members: a member reads the whole group; no recursion lockout.
  // ────────────────────────────────────────────────────────────────────────
  it("group_members: B can list ALL members of its group (no recursion lockout)", async () => {
    const rows = await asUser(userB, (tx) =>
      tx`select user_id from group_members where group_id = ${groupId}`
    );
    expect(rows.length).toBe(2);
    const ids = rows.map((r) => r.user_id);
    expect(ids).toContain(userA);
    expect(ids).toContain(userB);
  });

  it("group_members: outsider C sees no rows of A&B's group", async () => {
    const rows = await asUser(userC, (tx) =>
      tx`select user_id from group_members where group_id = ${groupId}`
    );
    expect(rows).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // groups / group_net_worth_snapshots: members only.
  // ────────────────────────────────────────────────────────────────────────
  it("groups: member B sees the group; outsider C does not", async () => {
    const asB = await asUser(userB, (tx) =>
      tx`select id from groups where id = ${groupId}`
    );
    expect(asB).toHaveLength(1);
    const asC = await asUser(userC, (tx) =>
      tx`select id from groups where id = ${groupId}`
    );
    expect(asC).toHaveLength(0);
  });

  it("group_net_worth_snapshots: member sees them; outsider does not", async () => {
    const asB = await asUser(userB, (tx) =>
      tx`select id from group_net_worth_snapshots where group_id = ${groupId}`
    );
    expect(asB.length).toBeGreaterThan(0);
    const asC = await asUser(userC, (tx) =>
      tx`select id from group_net_worth_snapshots where group_id = ${groupId}`
    );
    expect(asC).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Group cross-member financial reads: A and B share a group, so A sees B's
  // accounts/manual_accounts/plaid_items; outsider C does not.
  // ────────────────────────────────────────────────────────────────────────
  it("accounts_group_read: A can read fellow member B's accounts", async () => {
    const rows = await asUser(userA, (tx) =>
      tx`select user_id from accounts where user_id = ${userB}`
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("manual_accounts_group_read: A can read fellow member B's manual accounts", async () => {
    const rows = await asUser(userA, (tx) =>
      tx`select user_id from manual_accounts where user_id = ${userB}`
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("plaid_items_group_read: A can read fellow member B's plaid items", async () => {
    const rows = await asUser(userA, (tx) =>
      tx`select user_id from plaid_items where user_id = ${userB}`
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("outsider C cannot read A's accounts via group read", async () => {
    const rows = await asUser(userC, (tx) =>
      tx`select user_id from accounts where user_id = ${userA}`
    );
    expect(rows).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // SECURITY DEFINER functions: callable by app_user with NO GUC set.
  // ────────────────────────────────────────────────────────────────────────
  it("resolve_share_link + owner-context read returns the owner's data", async () => {
    const link = await asNobody((tx) =>
      tx`select * from resolve_share_link(${"share-a-" + SUFFIX})`
    );
    expect(link).toHaveLength(1);
    expect(link[0].user_id).toBe(userA);

    // Reading the owner's snapshots while impersonating the owner works.
    const snaps = await asUser(userA, (tx) =>
      tx`select net_worth from user_net_worth_snapshots where user_id = ${userA}`
    );
    expect(snaps.length).toBeGreaterThan(0);
  });

  it("resolve_invitation returns safe public fields for a valid invite", async () => {
    const token = "invite-" + SUFFIX;
    await adminSql`insert into group_invitations (group_id, invited_by, token,
        expires_at)
      values (${groupId}, ${userA}, ${token}, now() + interval '1 day')`;

    const rows = await asNobody((tx) =>
      tx`select * from resolve_invitation(${token})`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].group_id).toBe(groupId);
    expect(rows[0].inviter_name).toBe("A");
    expect(rows[0].accepted_at).toBeNull();
  });

  it("accept_invitation: typed errors + happy path bootstrap a membership", async () => {
    // NOT_FOUND for a bogus token.
    await expect(
      asNobody((tx) => tx`select accept_invitation(${"nope-" + SUFFIX}, ${userC})`)
    ).rejects.toThrow(/NOT_FOUND/);

    // Happy path: C accepts an invitation and becomes a member.
    const token = "accept-" + SUFFIX;
    await adminSql`insert into group_invitations (group_id, invited_by, token,
        expires_at)
      values (${groupId}, ${userA}, ${token}, now() + interval '1 day')`;

    await asNobody((tx) => tx`select accept_invitation(${token}, ${userC})`);

    const members = await adminSql<{ user_id: string }[]>`
      select user_id from group_members where group_id = ${groupId}`;
    expect(members.map((m) => m.user_id)).toContain(userC);

    // ALREADY_ACCEPTED if C tries the same token again.
    await expect(
      asNobody((tx) => tx`select accept_invitation(${token}, ${userC})`)
    ).rejects.toThrow(/ALREADY_ACCEPTED/);

    // Clean up so later assertions about group composition stay stable.
    await adminSql`delete from group_members where user_id = ${userC}`;
  });

  it("resolve_item_owner + webhook-style write under owner context", async () => {
    const owner = await asNobody((tx) =>
      tx`select resolve_item_owner(${"item-a-" + SUFFIX}) as user_id`
    );
    expect(owner[0].user_id).toBe(userA);

    // Impersonating the owner, an UPDATE of the owner's item passes WITH CHECK.
    await asUser(userA, (tx) =>
      tx`update plaid_items set error_code = 'TEST' where id = ${itemA}`
    );
    const [row] = await adminSql<{ error_code: string }[]>`
      select error_code from plaid_items where id = ${itemA}`;
    expect(row.error_code).toBe("TEST");
  });

  it("session + login definers are callable by app_user with NO GUC", async () => {
    // lookup_user_for_login finds A by email pre-auth.
    const login = await asNobody((tx) =>
      tx`select * from lookup_user_for_login(${EMAIL_A})`
    );
    expect(login).toHaveLength(1);
    expect(login[0].id).toBe(userA);

    // create_session / lookup_session / slide_session / delete_session cycle.
    const created = await asNobody((tx) =>
      tx`select create_session(${userA}, now() + interval '1 day', false) as id`
    );
    const sessionId = created[0].id as string;

    const looked = await asNobody((tx) =>
      tx`select * from lookup_session(${sessionId})`
    );
    expect(looked).toHaveLength(1);
    expect(looked[0].user_id).toBe(userA);

    await asNobody((tx) =>
      tx`select slide_session(${sessionId}, now() + interval '2 days')`
    );
    await asNobody((tx) => tx`select delete_session(${sessionId})`);

    const after = await asNobody((tx) =>
      tx`select * from lookup_session(${sessionId})`
    );
    expect(after).toHaveLength(0);
  });

  it("remove_group_member: owner removes a member; non-owner is denied", async () => {
    // Add a throwaway member D to the group.
    const [d] = await adminSql<{ id: string }[]>`
      insert into users (email, password_hash, display_name)
      values (${"rls-d-" + SUFFIX + "@example.com"}, 'x', 'D') returning id`;
    const userD = d.id;
    await adminSql`insert into group_members (group_id, user_id, role)
      values (${groupId}, ${userD}, 'member')`;

    // Member B (not owner) cannot remove D.
    await expect(
      asUser(userB, (tx) =>
        tx`select remove_group_member(${groupId}, ${userD}, ${userB})`
      )
    ).rejects.toThrow(/NOT_OWNER/);

    // Owner A can remove D.
    await asUser(userA, (tx) =>
      tx`select remove_group_member(${groupId}, ${userD}, ${userA})`
    );
    const left = await adminSql<{ user_id: string }[]>`
      select user_id from group_members where group_id = ${groupId} and user_id = ${userD}`;
    expect(left).toHaveLength(0);

    await adminSql`delete from users where id = ${userD}`;
  });
});
