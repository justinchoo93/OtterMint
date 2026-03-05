-- Migration: Add multi-user support tables and modify existing tables
-- This applies the schema changes needed for auth, groups, and sharing.

-- 1. Create enum type
DO $$ BEGIN
  CREATE TYPE "public"."group_role" AS ENUM('owner', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create new tables (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "display_name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "group_members" (
  "id" serial PRIMARY KEY NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" "group_role" DEFAULT 'member' NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "group_members_group_user_unique" UNIQUE("group_id","user_id")
);

CREATE TABLE IF NOT EXISTS "group_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE cascade,
  "invited_by" uuid NOT NULL REFERENCES "users"("id"),
  "invited_email" text,
  "token" text NOT NULL,
  "accepted_at" timestamp,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "group_invitations_token_unique" UNIQUE("token")
);

CREATE TABLE IF NOT EXISTS "share_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token" text NOT NULL,
  "label" text,
  "include_net_worth" boolean DEFAULT true NOT NULL,
  "include_balances" boolean DEFAULT false NOT NULL,
  "include_transactions" boolean DEFAULT false NOT NULL,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "share_links_token_unique" UNIQUE("token")
);

CREATE TABLE IF NOT EXISTS "user_net_worth_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "date" date NOT NULL,
  "total_assets" numeric(14, 2) NOT NULL,
  "total_liabilities" numeric(14, 2) NOT NULL,
  "net_worth" numeric(14, 2) NOT NULL,
  "depository_total" numeric(14, 2),
  "credit_total" numeric(14, 2),
  "investment_total" numeric(14, 2),
  "loan_total" numeric(14, 2),
  "manual_assets_total" numeric(14, 2),
  "manual_liabilities_total" numeric(14, 2),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_snapshots_user_date_unique" UNIQUE("user_id","date")
);

CREATE TABLE IF NOT EXISTS "group_net_worth_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE cascade,
  "date" date NOT NULL,
  "total_assets" numeric(14, 2) NOT NULL,
  "total_liabilities" numeric(14, 2) NOT NULL,
  "net_worth" numeric(14, 2) NOT NULL,
  "depository_total" numeric(14, 2),
  "credit_total" numeric(14, 2),
  "investment_total" numeric(14, 2),
  "loan_total" numeric(14, 2),
  "manual_assets_total" numeric(14, 2),
  "manual_liabilities_total" numeric(14, 2),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "group_snapshots_group_date_unique" UNIQUE("group_id","date")
);

-- 3. Modify existing tables: add user_id to plaid_items and manual_accounts
-- Add user_id column (nullable first)
ALTER TABLE "plaid_items" ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE cascade;
ALTER TABLE "manual_accounts" ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE cascade;

-- Drop old owner column if it exists
ALTER TABLE "plaid_items" DROP COLUMN IF EXISTS "owner";
ALTER TABLE "manual_accounts" DROP COLUMN IF EXISTS "owner";

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS "idx_sessions_user_id" ON "sessions" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_group_members_user_id" ON "group_members" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_group_snapshots_group_date" ON "group_net_worth_snapshots" USING btree ("group_id","date");
CREATE INDEX IF NOT EXISTS "idx_plaid_items_user_id" ON "plaid_items" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_accounts_plaid_item_id" ON "accounts" USING btree ("plaid_item_id");
CREATE INDEX IF NOT EXISTS "idx_holdings_account_id" ON "holdings" USING btree ("account_id");
CREATE INDEX IF NOT EXISTS "idx_manual_accounts_user_id" ON "manual_accounts" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_share_links_token" ON "share_links" USING btree ("token");
CREATE INDEX IF NOT EXISTS "idx_transactions_account_id" ON "transactions" USING btree ("account_id");
CREATE INDEX IF NOT EXISTS "idx_transactions_date_id" ON "transactions" USING btree ("date","id");
CREATE INDEX IF NOT EXISTS "idx_user_snapshots_user_date" ON "user_net_worth_snapshots" USING btree ("user_id","date");

-- 5. Enforce one group per user (idempotent)
DO $$ BEGIN
  ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_unique" UNIQUE ("user_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
