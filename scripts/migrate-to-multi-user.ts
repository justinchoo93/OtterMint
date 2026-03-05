/**
 * Migration script: Single-user to multi-user
 *
 * This script:
 * 1. Creates the first user account from existing data
 * 2. Backfills user_id on plaid_items and manual_accounts
 * 3. Migrates net_worth_snapshots to user_net_worth_snapshots
 *
 * Run with: npx tsx scripts/migrate-to-multi-user.ts
 *
 * Prerequisites:
 * - Database schema has been pushed (npm run db:push)
 * - Set MIGRATION_EMAIL, MIGRATION_PASSWORD, MIGRATION_NAME env vars
 *   (or it defaults to the values below)
 */

import postgres from "postgres";
import bcrypt from "bcryptjs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const email = process.env.MIGRATION_EMAIL;
const password = process.env.MIGRATION_PASSWORD;
const displayName = process.env.MIGRATION_NAME;

if (!email || !password || !displayName) {
  console.error(
    "MIGRATION_EMAIL, MIGRATION_PASSWORD, and MIGRATION_NAME are all required.\n" +
    "Example: MIGRATION_EMAIL=you@example.com MIGRATION_PASSWORD=<secure> MIGRATION_NAME=You npx tsx scripts/migrate-to-multi-user.ts"
  );
  process.exit(1);
}

async function migrate() {
  const sql = postgres(DATABASE_URL!);

  try {
    console.log("Starting migration to multi-user...\n");

    // 1. Check if users table already has rows
    const existingUsers = await sql`SELECT count(*) as cnt FROM users`;
    if (parseInt(existingUsers[0].cnt) > 0) {
      console.log("Users already exist. Skipping user creation.");
      const users = await sql`SELECT id, email FROM users LIMIT 1`;
      console.log(`Using existing user: ${users[0].email} (${users[0].id})`);
      const userId = users[0].id;
      await backfillUserId(sql, userId);
      await migrateSnapshots(sql, userId);
    } else {
      // Create the first user
      const passwordHash = await bcrypt.hash(password!, 12);
      const [user] = await sql`
        INSERT INTO users (email, password_hash, display_name)
        VALUES (${email!}, ${passwordHash}, ${displayName!})
        RETURNING id, email
      `;
      console.log(`Created user: ${user.email} (${user.id})`);
      await backfillUserId(sql, user.id);
      await migrateSnapshots(sql, user.id);
    }

    console.log("\nMigration complete!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

async function backfillUserId(sql: postgres.Sql, userId: string) {
  // Check if plaid_items has user_id column and needs backfill
  const plaidItemsNullCount =
    await sql`SELECT count(*) as cnt FROM plaid_items WHERE user_id IS NULL`;
  if (parseInt(plaidItemsNullCount[0].cnt) > 0) {
    const result =
      await sql`UPDATE plaid_items SET user_id = ${userId} WHERE user_id IS NULL`;
    console.log(`Backfilled user_id on ${result.count} plaid_items rows`);
  } else {
    console.log("plaid_items already have user_id set");
  }

  // Check if manual_accounts has user_id column and needs backfill
  const manualNullCount =
    await sql`SELECT count(*) as cnt FROM manual_accounts WHERE user_id IS NULL`;
  if (parseInt(manualNullCount[0].cnt) > 0) {
    const result =
      await sql`UPDATE manual_accounts SET user_id = ${userId} WHERE user_id IS NULL`;
    console.log(
      `Backfilled user_id on ${result.count} manual_accounts rows`
    );
  } else {
    console.log("manual_accounts already have user_id set");
  }
}

async function migrateSnapshots(sql: postgres.Sql, userId: string) {
  // Check if old net_worth_snapshots table exists
  const tableExists = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'net_worth_snapshots'
    ) as exists
  `;

  if (!tableExists[0].exists) {
    console.log("net_worth_snapshots table not found, skipping migration");
    return;
  }

  // Check if there are rows to migrate
  const oldCount =
    await sql`SELECT count(*) as cnt FROM net_worth_snapshots`;
  if (parseInt(oldCount[0].cnt) === 0) {
    console.log("No snapshots to migrate");
    return;
  }

  // Migrate to user_net_worth_snapshots
  const result = await sql`
    INSERT INTO user_net_worth_snapshots (
      user_id, date, total_assets, total_liabilities, net_worth,
      depository_total, credit_total, investment_total, loan_total,
      manual_assets_total, manual_liabilities_total
    )
    SELECT
      ${userId}, date, total_assets, total_liabilities, net_worth,
      depository_total, credit_total, investment_total, loan_total,
      manual_assets_total, manual_liabilities_total
    FROM net_worth_snapshots
    ON CONFLICT (user_id, date) DO NOTHING
  `;
  console.log(
    `Migrated ${result.count} rows from net_worth_snapshots to user_net_worth_snapshots`
  );
}

migrate();
