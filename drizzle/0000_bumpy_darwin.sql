CREATE TYPE "public"."group_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"plaid_item_id" integer NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"official_name" text,
	"type" text NOT NULL,
	"subtype" text,
	"mask" text,
	"current_balance" numeric(12, 2),
	"available_balance" numeric(12, 2),
	"limit_amount" numeric(12, 2),
	"iso_currency_code" text DEFAULT 'USD',
	"last_refreshed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "group_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"invited_email" text,
	"token" text NOT NULL,
	"accepted_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "group_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_user_unique" UNIQUE("group_id","user_id"),
	CONSTRAINT "group_members_user_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "group_net_worth_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"security_id" text NOT NULL,
	"name" text NOT NULL,
	"ticker_symbol" text,
	"quantity" numeric(18, 8) NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"cost_basis" numeric(14, 2),
	"iso_currency_code" text DEFAULT 'USD',
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"balance" numeric(14, 2) NOT NULL,
	"iso_currency_code" text DEFAULT 'USD',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaid_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"institution_id" text NOT NULL,
	"institution_name" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"item_id" text NOT NULL,
	"transactions_cursor" text,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plaid_items_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"merchant_name" text,
	"name" text NOT NULL,
	"category" text,
	"pending" boolean DEFAULT false NOT NULL,
	"iso_currency_code" text DEFAULT 'USD',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "user_net_worth_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
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
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_plaid_item_id_plaid_items_id_fk" FOREIGN KEY ("plaid_item_id") REFERENCES "public"."plaid_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_net_worth_snapshots" ADD CONSTRAINT "group_net_worth_snapshots_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_accounts" ADD CONSTRAINT "manual_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD CONSTRAINT "plaid_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_net_worth_snapshots" ADD CONSTRAINT "user_net_worth_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_plaid_item_id" ON "accounts" USING btree ("plaid_item_id");--> statement-breakpoint
CREATE INDEX "idx_group_members_user_id" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_group_snapshots_group_date" ON "group_net_worth_snapshots" USING btree ("group_id","date");--> statement-breakpoint
CREATE INDEX "idx_holdings_account_id" ON "holdings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_manual_accounts_user_id" ON "manual_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_plaid_items_user_id" ON "plaid_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_share_links_token" ON "share_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_transactions_account_id" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_date_id" ON "transactions" USING btree ("date","id");--> statement-breakpoint
CREATE INDEX "idx_user_snapshots_user_date" ON "user_net_worth_snapshots" USING btree ("user_id","date");