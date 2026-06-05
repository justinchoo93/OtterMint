ALTER TABLE "group_invitations" DROP CONSTRAINT IF EXISTS "group_invitations_invited_by_users_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_share_links_token";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "last_refreshed_at" SET DATA TYPE timestamptz USING "last_refreshed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "created_at" SET DATA TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "group_invitations" ALTER COLUMN "invited_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "group_invitations" ALTER COLUMN "accepted_at" SET DATA TYPE timestamptz USING "accepted_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "group_invitations" ALTER COLUMN "expires_at" SET DATA TYPE timestamptz USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "group_invitations" ALTER COLUMN "created_at" SET DATA TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "group_invitations" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "group_net_worth_snapshots" ALTER COLUMN "created_at" SET DATA TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "group_net_worth_snapshots" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "created_at" SET DATA TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "holdings" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "holdings" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "manual_accounts" ALTER COLUMN "created_at" SET DATA TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "manual_accounts" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "manual_accounts" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "manual_accounts" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "plaid_items" ALTER COLUMN "created_at" SET DATA TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "plaid_items" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "plaid_items" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "plaid_items" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "mfa_locked_until" SET DATA TYPE timestamptz USING "mfa_locked_until" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DATA TYPE timestamptz USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "share_links" ALTER COLUMN "expires_at" SET DATA TYPE timestamptz USING "expires_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "share_links" ALTER COLUMN "revoked_at" SET DATA TYPE timestamptz USING "revoked_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "share_links" ALTER COLUMN "created_at" SET DATA TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "share_links" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_net_worth_snapshots" ALTER COLUMN "created_at" SET DATA TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "user_net_worth_snapshots" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "consent_given_at" SET DATA TYPE timestamptz USING "consent_given_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "locked_until" SET DATA TYPE timestamptz USING "locked_until" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transactions_account_id_date" ON "transactions" USING btree ("account_id","date");