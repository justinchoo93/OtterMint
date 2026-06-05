-- Denormalize a user_id column onto the derived-ownership tables
-- (accounts, transactions, holdings) so future Row-Level Security policies
-- can key on a local column instead of traversing foreign keys.
-- Hand-written (not the raw drizzle output) so the column is added nullable,
-- backfilled from the existing ownership chain, and only THEN made NOT NULL.
-- Every statement is idempotent so the file is safe to re-run.

-- 1. Add the column nullable first (cannot be NOT NULL while rows lack a value).
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint

-- 2. Backfill. Order matters: accounts gets its owner from plaid_items first,
--    then transactions and holdings inherit from their account.
UPDATE "accounts" a
  SET "user_id" = pi."user_id"
  FROM "plaid_items" pi
  WHERE a."plaid_item_id" = pi."id" AND a."user_id" IS NULL;--> statement-breakpoint
UPDATE "transactions" t
  SET "user_id" = a."user_id"
  FROM "accounts" a
  WHERE t."account_id" = a."account_id" AND t."user_id" IS NULL;--> statement-breakpoint
UPDATE "holdings" h
  SET "user_id" = a."user_id"
  FROM "accounts" a
  WHERE h."account_id" = a."account_id" AND h."user_id" IS NULL;--> statement-breakpoint

-- 3. Now that every row has an owner, enforce NOT NULL.
ALTER TABLE "accounts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint

-- 4. Foreign keys (drop-if-exists then add, so the file is re-runnable).
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" DROP CONSTRAINT IF EXISTS "holdings_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 5. Indexes for the new column.
CREATE INDEX IF NOT EXISTS "idx_accounts_user_id" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_user_id" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_holdings_user_id" ON "holdings" USING btree ("user_id");
